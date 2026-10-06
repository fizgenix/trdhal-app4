-- Deliveries may now exceed the ordered quantity (vendors do send extra).
-- Reverses the cap added in 0006_receiving_quantity_cap.sql; the app flags
-- any over-received line on the Orders, Receiving and Approvals pages
-- instead of blocking it. approve_order() is unchanged — it already
-- requires received >= ordered, which an over-received line meets.
--
-- Same signature as 0007_po_invoice_numbers.sql, so `create or replace`
-- swaps the body in place and the existing grant still applies.

create or replace function log_receiving(
  p_order_id uuid,
  p_quantity_received numeric,
  p_condition_notes text,
  p_received_date timestamptz default now(),
  p_invoice_number text default null
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

  if p_invoice_number is null or btrim(p_invoice_number) = '' then
    raise exception 'Enter the invoice number for this delivery.';
  end if;

  insert into receiving_logs (
    order_id, quantity_received, condition_notes, received_by, received_date, invoice_number
  )
  values (
    p_order_id, p_quantity_received, p_condition_notes, auth.uid(),
    coalesce(p_received_date, now()), btrim(p_invoice_number)
  )
  returning * into v_log;

  if v_order.status = 'placed' then
    update orders set status = 'pending_approval' where id = p_order_id;
  end if;

  return v_log;
end;
$$;
