-- A purchase order can now carry several items, each in its own unit (e.g.
-- conduit pipe in Rmtr and bends in Dozen on the same PO).
--
-- New purchase_orders table holds what's shared across the PO: PO number,
-- vendor, site, who placed it and when. Each existing `orders` row becomes
-- one *line* of a PO — item, quantity, unit and its own status. Lines are
-- received and approved one by one, exactly as orders were before, so
-- receiving_logs / approvals / site_inventory / log_receiving() /
-- approve_order() / release_inventory() keep working per line, unchanged.
--
-- The PO itself has no stored status — it's derived from its lines in the
-- app (all placed → Placed, all approved → Completed, all removed →
-- Cancelled, otherwise Pending Approval), so it can never drift from them.

-- ─────────────────────────────────────────────────────────────────────────
-- purchase_orders
-- ─────────────────────────────────────────────────────────────────────────

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id),
  po_number text not null,
  shopkeeper_id uuid not null references shopkeepers (id),
  placed_by uuid not null references profiles (id),
  placed_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint purchase_orders_po_number_key unique (po_number),
  -- Target of the (purchase_order_id, site_id) FK on orders below, which
  -- guarantees a line is always at the same site as its PO.
  constraint purchase_orders_id_site_key unique (id, site_id)
);

create index purchase_orders_site_id_idx on purchase_orders (site_id);

-- Backfill: every existing order becomes a one-line PO. The PO reuses the
-- order's id, which makes linking the two below a plain copy.
insert into purchase_orders (id, site_id, po_number, shopkeeper_id, placed_by, placed_date, created_at)
select id, site_id, po_number, shopkeeper_id, placed_by, placed_date, created_at
from orders;

-- ─────────────────────────────────────────────────────────────────────────
-- orders → PO lines. PO number and vendor now live on the PO only.
-- site_id / placed_by stay on each line: the RLS policies and RPCs that
-- already guard receiving, approval and edits all read them from here.
-- ─────────────────────────────────────────────────────────────────────────

alter table orders add column purchase_order_id uuid;

update orders set purchase_order_id = id;

alter table orders
  alter column purchase_order_id set not null,
  add constraint orders_purchase_order_fkey
    foreign key (purchase_order_id, site_id) references purchase_orders (id, site_id);

create index orders_purchase_order_id_idx on orders (purchase_order_id);

alter table orders drop column po_number;
alter table orders drop column shopkeeper_id;

-- Lines are created only through create_purchase_order() / add_order_line()
-- below (a PO and its lines must be written together, and adding a line
-- must check the PO's owner) — so no direct insert policy any more.
drop policy orders_insert on orders;

-- ─────────────────────────────────────────────────────────────────────────
-- order_edit_log: lines can now also be added to a PO after it's placed,
-- or removed from it.
-- ─────────────────────────────────────────────────────────────────────────

alter table order_edit_log drop constraint order_edit_log_action_check;
alter table order_edit_log add constraint order_edit_log_action_check
  check (action in ('edited', 'cancelled', 'added', 'removed'));

-- ─────────────────────────────────────────────────────────────────────────
-- RLS: anyone assigned to the site (or Admin) can read its POs. No write
-- policies — POs are written only through the functions below.
-- ─────────────────────────────────────────────────────────────────────────

alter table purchase_orders enable row level security;

create policy purchase_orders_select on purchase_orders for select
  using (is_admin(auth.uid()) or has_site_access(auth.uid(), site_id));

-- ─────────────────────────────────────────────────────────────────────────
-- create_purchase_order — the PO and all its lines in one transaction.
-- p_lines: [{ "item_id": uuid, "quantity_ordered": number, "unit": text }, …]
-- A duplicate PO number surfaces as unique_violation (23505).
-- ─────────────────────────────────────────────────────────────────────────

create function create_purchase_order(
  p_site_id uuid,
  p_po_number text,
  p_shopkeeper_id uuid,
  p_lines jsonb
)
returns purchase_orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_po purchase_orders%rowtype;
begin
  if not (is_admin(auth.uid()) or has_site_role(auth.uid(), p_site_id, 'ho1_ordering')) then
    raise exception 'You do not have ordering access at this site.';
  end if;

  if p_po_number is null or btrim(p_po_number) = '' then
    raise exception 'Enter the PO number for this order.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the order.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where coalesce((l ->> 'quantity_ordered')::numeric, 0) <= 0
  ) then
    raise exception 'Enter a quantity greater than zero for every item.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where coalesce(btrim(l ->> 'unit'), '') = ''
  ) then
    raise exception 'Choose the unit for every item.';
  end if;

  insert into purchase_orders (site_id, po_number, shopkeeper_id, placed_by)
  values (p_site_id, btrim(p_po_number), p_shopkeeper_id, auth.uid())
  returning * into v_po;

  -- clock_timestamp() (not now()) for created_at, so it rises row by row
  -- and the lines list back in the order they were entered on the PO.
  insert into orders (
    purchase_order_id, site_id, item_id, quantity_ordered, unit, placed_by, placed_date, created_at
  )
  select
    v_po.id, v_po.site_id, (l ->> 'item_id')::uuid, (l ->> 'quantity_ordered')::numeric,
    btrim(l ->> 'unit'), v_po.placed_by, v_po.placed_date, clock_timestamp()
  from jsonb_array_elements(p_lines) with ordinality as t (l, n)
  order by n;

  return v_po;
end;
$$;

grant execute on function create_purchase_order(uuid, text, uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- add_order_line — add a forgotten item to an existing PO. Only the PO's
-- own creator (or Admin), and only while the PO still has an open line
-- (not every line approved or removed). The new line is owned by the PO's
-- creator, so the existing edit/remove rules apply to it unchanged.
-- ─────────────────────────────────────────────────────────────────────────

create function add_order_line(
  p_purchase_order_id uuid,
  p_item_id uuid,
  p_quantity_ordered numeric,
  p_unit text,
  p_note text default null
)
returns orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_po purchase_orders%rowtype;
  v_line orders%rowtype;
begin
  select * into v_po from purchase_orders where id = p_purchase_order_id for update;

  if not found then
    raise exception 'Purchase order not found.';
  end if;

  if not (
    is_admin(auth.uid())
    or (v_po.placed_by = auth.uid() and has_site_role(auth.uid(), v_po.site_id, 'ho1_ordering'))
  ) then
    raise exception 'Only the person who placed this PO can add items to it.';
  end if;

  if not exists (
    select 1 from orders
    where purchase_order_id = p_purchase_order_id and status in ('placed', 'pending_approval')
  ) then
    raise exception 'This PO is closed — items can no longer be added to it.';
  end if;

  if p_quantity_ordered is null or p_quantity_ordered <= 0 then
    raise exception 'Enter a quantity greater than zero.';
  end if;

  if p_unit is null or btrim(p_unit) = '' then
    raise exception 'Choose the unit for this item.';
  end if;

  insert into orders (purchase_order_id, site_id, item_id, quantity_ordered, unit, placed_by)
  values (p_purchase_order_id, v_po.site_id, p_item_id, p_quantity_ordered, btrim(p_unit), v_po.placed_by)
  returning * into v_line;

  insert into order_edit_log (order_id, edited_by, action, note)
  values (v_line.id, auth.uid(), 'added', nullif(btrim(p_note), ''));

  return v_line;
end;
$$;

grant execute on function add_order_line(uuid, uuid, numeric, text, text) to authenticated;
