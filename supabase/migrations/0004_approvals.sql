-- Approval feature: HO3 reviews the full receiving log against the
-- ordered quantity and approves, closing the order out. Same atomic-RPC
-- pattern as log_receiving (see 0003_receiving.sql) — the approvals
-- insert and the orders.status flip to 'completed' must happen together,
-- and the `for update` row lock serializes a race between two HO3 users
-- approving the same order at once.
--
-- Per the confirmed workflow: approval is only possible once the total
-- received meets or exceeds the ordered quantity (no approving a short
-- delivery in v1), and only while the order is still 'pending_approval'.

create or replace function approve_order(
  p_order_id uuid,
  p_remarks text default null
)
returns approvals
language plpgsql
security definer set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_received numeric;
  v_approval approvals%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status != 'pending_approval' then
    raise exception 'Only orders that are Pending Approval can be approved (status: %).', v_order.status;
  end if;

  if not (is_admin(auth.uid()) or has_site_role(auth.uid(), v_order.site_id, 'ho3_accounts')) then
    raise exception 'You do not have approval access at this site.';
  end if;

  select coalesce(sum(quantity_received), 0) into v_received
  from receiving_logs
  where order_id = p_order_id;

  if v_received < v_order.quantity_ordered then
    raise exception 'Received quantity (%) is less than ordered (%) — cannot approve yet.', v_received, v_order.quantity_ordered;
  end if;

  insert into approvals (order_id, approved_by, remarks)
  values (p_order_id, auth.uid(), p_remarks)
  returning * into v_approval;

  update orders set status = 'completed' where id = p_order_id;

  return v_approval;
end;
$$;

grant execute on function approve_order(uuid, text) to authenticated;

-- Anyone assigned to the order's site (or Admin) can read approval
-- details — who approved it, when, and any remarks — as part of the
-- order's full history.
create policy approvals_select on approvals for select
  using (
    is_admin(auth.uid())
    or exists (
      select 1 from orders o
      where o.id = approvals.order_id and has_site_access(auth.uid(), o.site_id)
    )
  );
