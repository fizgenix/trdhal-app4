-- Receiving feature: HO2 logs one or more receiving entries against an
-- order (partial deliveries allowed). The first entry on an order flips
-- its status from 'placed' to 'pending_approval'.
--
-- This is done through a single security-definer RPC rather than two
-- separate table writes from the app, for two reasons: (1) atomicity — the
-- receiving_logs insert and the orders.status flip must both happen or
-- neither should, and the `for update` row lock below also serializes two
-- HO2 users racing to log against the same order at once; (2) it keeps
-- receiving_logs genuinely append-only (no insert policy is granted below
-- — the table can only be written through this function), the same
-- append-only posture already used for inventory_releases.

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

  insert into receiving_logs (order_id, quantity_received, condition_notes, received_by, received_date)
  values (p_order_id, p_quantity_received, p_condition_notes, auth.uid(), coalesce(p_received_date, now()))
  returning * into v_log;

  if v_order.status = 'placed' then
    update orders set status = 'pending_approval' where id = p_order_id;
  end if;

  return v_log;
end;
$$;

grant execute on function log_receiving(uuid, numeric, text, timestamptz) to authenticated;

-- Anyone assigned to the order's site (or Admin) can read the receiving
-- history — this is what powers the "ordered vs received" view on both
-- the Orders and Receiving pages.
create policy receiving_logs_select on receiving_logs for select
  using (
    is_admin(auth.uid())
    or exists (
      select 1 from orders o
      where o.id = receiving_logs.order_id and has_site_access(auth.uid(), o.site_id)
    )
  );
