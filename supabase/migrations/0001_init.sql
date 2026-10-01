-- TR Dhal Site Ops — initial schema
-- Covers the full confirmed data model. RLS policies in this migration are
-- fully written for profiles/sites/user_sites/items/shopkeepers/buildings
-- (needed by the auth + site-assignment feature and the master-data
-- dropdowns). RLS is enabled on orders/receiving/approvals/releases now
-- (safe default: no access until policies exist) — their policies land in
-- the migration that ships the Orders feature.

-- ─────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────

create type site_role as enum ('ho1_ordering', 'ho2_receiving', 'ho3_accounts');

-- 'rejected' is intentionally not included yet — v2 will add the
-- reject-and-send-back-to-HO2 workflow. Adding it later is a single
-- `alter type order_status add value` migration, no data model change.
create type order_status as enum ('placed', 'pending_approval', 'completed', 'cancelled');

-- ─────────────────────────────────────────────────────────────────────────
-- Identity
-- ─────────────────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

create table user_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  role site_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, site_id, role)
);

create index user_sites_user_id_idx on user_sites (user_id);
create index user_sites_site_id_idx on user_sites (site_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Master data (dropdown-with-add-new lists)
-- ─────────────────────────────────────────────────────────────────────────

create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table shopkeepers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  name text not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (site_id, name)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Orders → Receive → Approve
-- ─────────────────────────────────────────────────────────────────────────

create table orders (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id),
  item_id uuid not null references items (id),
  quantity_ordered numeric not null check (quantity_ordered > 0),
  shopkeeper_id uuid not null references shopkeepers (id),
  placed_by uuid not null references profiles (id),
  placed_date timestamptz not null default now(),
  status order_status not null default 'placed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_site_id_idx on orders (site_id);
create index orders_status_idx on orders (status);

-- Audit trail for HO1 edits/cancellations on an order (order stays visible
-- with full history even after completion).
create table order_edit_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  edited_by uuid not null references profiles (id),
  edited_at timestamptz not null default now(),
  action text not null check (action in ('edited', 'cancelled')),
  note text,
  previous_values jsonb
);

create table receiving_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  quantity_received numeric not null check (quantity_received > 0),
  condition_notes text,
  received_by uuid not null references profiles (id),
  received_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index receiving_logs_order_id_idx on receiving_logs (order_id);

-- One approval per order: approving is what moves status to 'completed',
-- which is terminal (no edits after) — so at most one row makes sense.
create table approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders (id) on delete cascade,
  approved_by uuid not null references profiles (id),
  approved_date timestamptz not null default now(),
  remarks text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- Inventory releases (usage log — append-only in v1: no update/delete
-- policy is granted below; corrections-via-offsetting-entry is a v2 idea)
-- ─────────────────────────────────────────────────────────────────────────

create table inventory_releases (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id),
  item_id uuid not null references items (id),
  quantity_released numeric not null check (quantity_released > 0),
  quality_notes text,
  destination_building_id uuid not null references buildings (id),
  released_by uuid not null references profiles (id),
  released_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index inventory_releases_site_item_idx on inventory_releases (site_id, item_id);

-- Derived running inventory. A view (not a stored table) so it can never
-- drift from the receiving/release logs it's computed from.
create view site_inventory as
select
  coalesce(rec.site_id, rel.site_id) as site_id,
  coalesce(rec.item_id, rel.item_id) as item_id,
  coalesce(rec.received, 0) - coalesce(rel.released, 0) as quantity_available
from (
  select o.site_id, o.item_id, sum(r.quantity_received) as received
  from receiving_logs r
  join orders o on o.id = r.order_id
  group by o.site_id, o.item_id
) rec
full outer join (
  select site_id, item_id, sum(quantity_released) as released
  from inventory_releases
  group by site_id, item_id
) rel on rel.site_id = rec.site_id and rel.item_id = rec.item_id;

-- ─────────────────────────────────────────────────────────────────────────
-- Housekeeping triggers
-- ─────────────────────────────────────────────────────────────────────────

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_set_updated_at
  before update on orders
  for each row execute procedure set_updated_at();

-- Auto-create a profile row whenever Admin creates an auth user via the
-- service-role admin.createUser() call. Runs as security definer so it
-- bypasses RLS regardless of who's calling.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'is_admin')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS helper functions (security definer so they read past RLS on the
-- tables they check — this is what avoids recursive-policy problems)
-- ─────────────────────────────────────────────────────────────────────────

create function is_admin(uid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select p.is_admin from profiles p where p.id = uid), false);
$$;

create function has_site_access(uid uuid, target_site uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from user_sites us
    where us.user_id = uid and us.site_id = target_site
  );
$$;

create function has_site_role(uid uuid, target_site uuid, target_role site_role)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from user_sites us
    where us.user_id = uid and us.site_id = target_site and us.role = target_role
  );
$$;

create function shares_site_with(uid uuid, other uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from user_sites a
    join user_sites b on a.site_id = b.site_id
    where a.user_id = uid and b.user_id = other
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table sites enable row level security;
alter table user_sites enable row level security;
alter table items enable row level security;
alter table shopkeepers enable row level security;
alter table buildings enable row level security;
alter table orders enable row level security;
alter table order_edit_log enable row level security;
alter table receiving_logs enable row level security;
alter table approvals enable row level security;
alter table inventory_releases enable row level security;

-- profiles: admins see everyone; everyone sees themselves; colleagues
-- assigned to a shared site can see each other's name (needed to show
-- "placed by" / "received by" once Orders ships). Only Admin can write —
-- keeps identity data (names/logins) tamper-proof, per spec.
create policy profiles_select on profiles for select
  using (is_admin(auth.uid()) or id = auth.uid() or shares_site_with(auth.uid(), id));

create policy profiles_insert on profiles for insert
  with check (is_admin(auth.uid()));

create policy profiles_update on profiles for update
  using (is_admin(auth.uid()));

create policy profiles_delete on profiles for delete
  using (is_admin(auth.uid()));

-- sites: admins see/manage all; everyone else sees only sites they're
-- assigned to.
create policy sites_select on sites for select
  using (is_admin(auth.uid()) or has_site_access(auth.uid(), id));

create policy sites_insert on sites for insert
  with check (is_admin(auth.uid()));

create policy sites_update on sites for update
  using (is_admin(auth.uid()));

create policy sites_delete on sites for delete
  using (is_admin(auth.uid()));

-- user_sites: admins manage all assignments; a user can see their own.
create policy user_sites_select on user_sites for select
  using (is_admin(auth.uid()) or user_id = auth.uid());

create policy user_sites_insert on user_sites for insert
  with check (is_admin(auth.uid()));

create policy user_sites_update on user_sites for update
  using (is_admin(auth.uid()));

create policy user_sites_delete on user_sites for delete
  using (is_admin(auth.uid()));

-- items: global master list, visible to anyone signed in and assigned to
-- at least one site (or Admin). Addable by Admin + HO1 (per spec).
create policy items_select on items for select
  using (
    is_admin(auth.uid())
    or exists (select 1 from user_sites us where us.user_id = auth.uid())
  );

create policy items_insert on items for insert
  with check (
    is_admin(auth.uid())
    or exists (
      select 1 from user_sites us
      where us.user_id = auth.uid() and us.role = 'ho1_ordering'
    )
  );

create policy items_update on items for update
  using (is_admin(auth.uid()));

create policy items_delete on items for delete
  using (is_admin(auth.uid()));

-- shopkeepers: same shape as items — addable by Admin + HO1.
create policy shopkeepers_select on shopkeepers for select
  using (
    is_admin(auth.uid())
    or exists (select 1 from user_sites us where us.user_id = auth.uid())
  );

create policy shopkeepers_insert on shopkeepers for insert
  with check (
    is_admin(auth.uid())
    or exists (
      select 1 from user_sites us
      where us.user_id = auth.uid() and us.role = 'ho1_ordering'
    )
  );

create policy shopkeepers_update on shopkeepers for update
  using (is_admin(auth.uid()));

create policy shopkeepers_delete on shopkeepers for delete
  using (is_admin(auth.uid()));

-- buildings: per-site list. Visible to anyone assigned to that site.
-- Addable by Admin + HO2 (they pick the destination building at release
-- time).
create policy buildings_select on buildings for select
  using (is_admin(auth.uid()) or has_site_access(auth.uid(), site_id));

create policy buildings_insert on buildings for insert
  with check (
    is_admin(auth.uid()) or has_site_role(auth.uid(), site_id, 'ho2_receiving')
  );

create policy buildings_update on buildings for update
  using (is_admin(auth.uid()));

create policy buildings_delete on buildings for delete
  using (is_admin(auth.uid()));

-- orders / order_edit_log / receiving_logs / approvals / inventory_releases:
-- RLS is enabled above with no policies yet, so all access is denied except
-- through the service-role client — this is the safe default until the
-- Orders / Receiving / Approval / Release features are built, each of
-- which will ship its own migration adding the real policies.
