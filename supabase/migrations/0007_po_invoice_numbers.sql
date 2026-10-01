-- PO Number (auto-assigned on orders) + Invoice Number (entered by HO2
-- when logging a delivery against an order) — shown on the Orders and
-- Receiving pages.

-- ─────────────────────────────────────────────────────────────────────────
-- PO Number: sequential, assigned via a column default off a dedicated
-- sequence — the same race-free pattern gen_random_uuid() gives the id
-- columns, so no app-side generation or locking is needed.
-- ─────────────────────────────────────────────────────────────────────────

create sequence po_number_seq;

alter table orders add column po_number text;

-- Backfill existing orders (oldest first, so numbering tracks placement
-- order) before the column is made required/unique.
with numbered as (
  select id, 'PO-' || lpad(nextval('po_number_seq')::text, 5, '0') as po_number
  from orders
  order by created_at
)
update orders
set po_number = numbered.po_number
from numbered
where orders.id = numbered.id;

alter table orders
  alter column po_number set default ('PO-' || lpad(nextval('po_number_seq')::text, 5, '0')),
  alter column po_number set not null,
  add constraint orders_po_number_key unique (po_number);

-- Lets the "Place a new order" form show the number that will be
-- assigned before the order is actually submitted. This is a preview,
-- not a reservation — reads the sequence's last_value/is_called columns
-- directly rather than calling nextval(), so it never consumes a number.
-- If two HO1 users place an order from the same site at the same moment,
-- whoever's insert lands second simply gets the next number instead —
-- same as any other auto-increment preview.
create function peek_next_po_number()
returns text
language sql
security definer set search_path = public
stable
as $$
  select 'PO-' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text,
    5, '0'
  )
  from po_number_seq;
$$;

grant execute on function peek_next_po_number() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Invoice Number: entered by HO2 when logging a delivery. Nullable at the
-- column level (existing rows predate this field), enforced as required
-- going forward inside log_receiving() itself — same posture as the
-- quantity > 0 check already there.
-- ─────────────────────────────────────────────────────────────────────────

alter table receiving_logs add column invoice_number text;

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

  if p_invoice_number is null or btrim(p_invoice_number) = '' then
    raise exception 'Enter the invoice number for this delivery.';
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
