-- Faster row-level security.
--
-- The select policies called is_admin(auth.uid()) and
-- has_site_access(auth.uid(), site_id) as plain expressions, which Postgres
-- re-runs for every row it reads — a page listing a few thousand order
-- lines, logs and approvals ran thousands of extra lookups. Wrapping them in
-- a sub-select makes each an "initPlan" that runs once per query (Supabase's
-- RLS performance guidance), and my_site_ids() turns the per-row site check
-- into one lookup of the caller's sites. Who can see what is unchanged.
--
-- Also adds indexes for the list queries the pages run (newest first, per
-- site) and the one foreign key without an index (order_edit_log.order_id).

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: every site the signed-in user is assigned to
-- ─────────────────────────────────────────────────────────────────────────

create function my_site_ids()
returns setof uuid
language sql
security definer set search_path = public
stable
as $$
  select us.site_id from user_sites us where us.user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Select policies — same rules, evaluated once per query
-- ─────────────────────────────────────────────────────────────────────────

alter policy profiles_select on profiles
  using (
    (select is_admin(auth.uid()))
    or id = (select auth.uid())
    or shares_site_with((select auth.uid()), id)
  );

alter policy sites_select on sites
  using ((select is_admin(auth.uid())) or id in (select my_site_ids()));

alter policy user_sites_select on user_sites
  using ((select is_admin(auth.uid())) or user_id = (select auth.uid()));

alter policy items_select on items
  using (
    (select is_admin(auth.uid()))
    or exists (select 1 from user_sites us where us.user_id = (select auth.uid()))
  );

alter policy shopkeepers_select on shopkeepers
  using (
    (select is_admin(auth.uid()))
    or exists (select 1 from user_sites us where us.user_id = (select auth.uid()))
  );

alter policy buildings_select on buildings
  using ((select is_admin(auth.uid())) or site_id in (select my_site_ids()));

alter policy purchase_orders_select on purchase_orders
  using ((select is_admin(auth.uid())) or site_id in (select my_site_ids()));

alter policy orders_select on orders
  using ((select is_admin(auth.uid())) or site_id in (select my_site_ids()));

alter policy inventory_releases_select on inventory_releases
  using ((select is_admin(auth.uid())) or site_id in (select my_site_ids()));

alter policy order_edit_log_select on order_edit_log
  using (
    (select is_admin(auth.uid()))
    or exists (
      select 1 from orders o
      where o.id = order_edit_log.order_id and o.site_id in (select my_site_ids())
    )
  );

alter policy receiving_logs_select on receiving_logs
  using (
    (select is_admin(auth.uid()))
    or exists (
      select 1 from orders o
      where o.id = receiving_logs.order_id and o.site_id in (select my_site_ids())
    )
  );

alter policy approvals_select on approvals
  using (
    (select is_admin(auth.uid()))
    or exists (
      select 1 from orders o
      where o.id = approvals.order_id and o.site_id in (select my_site_ids())
    )
  );

alter policy receiving_edit_log_select on receiving_edit_log
  using (
    (select is_admin(auth.uid()))
    or exists (
      select 1 from receiving_logs r
      join orders o on o.id = r.order_id
      where r.id = receiving_edit_log.receiving_log_id and o.site_id in (select my_site_ids())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists order_edit_log_order_id_idx on order_edit_log (order_id);
create index if not exists purchase_orders_site_kind_placed_idx
  on purchase_orders (site_id, kind, placed_date desc);
create index if not exists orders_site_created_idx on orders (site_id, created_at);
create index if not exists inventory_releases_site_released_idx
  on inventory_releases (site_id, released_date desc);
