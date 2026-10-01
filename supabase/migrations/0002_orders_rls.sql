-- Orders feature: RLS for orders + order_edit_log.
--
-- Visibility: anyone assigned to a site (any role) or Admin can read its
-- orders — HO2/HO3 will need this once Receiving/Approval ship, and the
-- spec calls for full order history staying visible.
--
-- Write: only HO1 (or Admin) can create an order at a site. Editing is
-- scoped to the order's own creator (or Admin), only while status is
-- still 'placed' (before any receiving has been logged), and only to
-- 'placed' or 'cancelled' — the pending_approval/completed transitions
-- are owned by the Receiving/Approval features, not by HO1 edits.

create policy orders_select on orders for select
  using (is_admin(auth.uid()) or has_site_access(auth.uid(), site_id));

create policy orders_insert on orders for insert
  with check (
    is_admin(auth.uid())
    or (placed_by = auth.uid() and has_site_role(auth.uid(), site_id, 'ho1_ordering'))
  );

create policy orders_update on orders for update
  using (
    is_admin(auth.uid())
    or (placed_by = auth.uid() and status = 'placed')
  )
  with check (
    is_admin(auth.uid())
    or (placed_by = auth.uid() and status in ('placed', 'cancelled'))
  );

-- order_edit_log: readable by anyone who can see the order; insertable by
-- the order's own creator (or Admin) — mirrors the orders_update policy so
-- the audit trail can only be written by whoever was actually allowed to
-- make the change it's logging.
create policy order_edit_log_select on order_edit_log for select
  using (
    is_admin(auth.uid())
    or exists (
      select 1 from orders o
      where o.id = order_edit_log.order_id and has_site_access(auth.uid(), o.site_id)
    )
  );

create policy order_edit_log_insert on order_edit_log for insert
  with check (
    edited_by = auth.uid()
    and exists (
      select 1 from orders o
      where o.id = order_edit_log.order_id
        and (is_admin(auth.uid()) or o.placed_by = auth.uid())
    )
  );
