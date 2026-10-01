-- Bug fix: log_receiving() only rejected zero/negative quantities, so
-- cumulative receiving_logs.quantity_received for an order could exceed
-- orders.quantity_ordered (e.g. logging 80 then 80 again on a 100-unit
-- order). Cap the new entry at whatever's still outstanding.
--
-- Note: approve_order() (0004_approvals.sql) requires received >= ordered
-- to approve; capping received at exactly quantity_ordered still allows
-- that equality case, so this doesn't block approval.

create or replace function log_receiving(
  p_order_id uuid,
  p_quantity_received numeric,
  p_condition_notes text,
  p_received_date timestamptz default now()
)
returns receiving_logs
language plpgsql
security definer set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_log receiving_logs%rowtype;
  v_received_so_far numeric;
  v_remaining numeric;
begin
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status not in ('placed', 'pending_approval') then
    raise exception 'This order can no longer receive deliveries (status: %).', v_order.status;
  end if;

  if not (is_admin(auth.uid()) or has_site_role(auth.uid(), v_order.site_id, 'ho2_receiving')) then
    raise exception 'You do not have receiving access at this site.';
  end if;

  if p_quantity_received is null or p_quantity_received <= 0 then
    raise exception 'Enter a quantity greater than zero.';
  end if;

  select coalesce(sum(quantity_received), 0) into v_received_so_far
  from receiving_logs
  where order_id = p_order_id;

  v_remaining := v_order.quantity_ordered - v_received_so_far;

  if p_quantity_received > v_remaining then
    raise exception
      'Only % left to receive on this order (% of % already received).',
      v_remaining, v_received_so_far, v_order.quantity_ordered;
  end if;

  insert into receiving_logs (order_id, quantity_received, condition_notes, received_by, received_date)
  values (p_order_id, p_quantity_received, p_condition_notes, auth.uid(), coalesce(p_received_date, now()))
  returning * into v_log;

  if v_order.status = 'placed' then
    update orders set status = 'pending_approval' where id = p_order_id;
  end if;

  return v_log;
end;
$$;
