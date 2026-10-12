-- Direct receipts: vendor is now required, and the "where did these come
-- from?" note is gone (the vendor answers that). Same signature as
-- 0016_direct_receipts.sql, so `create or replace` swaps the body in place
-- and the existing grant still applies. p_notes stays, now optional.
--
-- The column stays nullable so any direct receipts already logged without
-- a vendor remain valid; new ones are checked here.

create or replace function log_direct_receipt(
  p_site_id uuid,
  p_shopkeeper_id uuid,
  p_received_date timestamptz,
  p_invoice_number text,
  p_notes text,
  p_lines jsonb
)
returns purchase_orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_po purchase_orders%rowtype;
  v_number text;
begin
  if not (is_admin(auth.uid()) or has_site_role(auth.uid(), p_site_id, 'ho2_receiving')) then
    raise exception 'You do not have receiving access at this site.';
  end if;

  if p_shopkeeper_id is null then
    raise exception 'Choose the vendor these items came from.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where coalesce((l ->> 'quantity')::numeric, 0) <= 0
  ) then
    raise exception 'Enter a quantity greater than zero for every item.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where coalesce(btrim(l ->> 'unit'), '') = ''
  ) then
    raise exception 'Choose the unit for every item.';
  end if;

  -- Skip any number a manually entered PO already took.
  loop
    v_number := 'MISC-' || lpad(nextval('direct_receipt_number_seq')::text, 4, '0');
    exit when not exists (select 1 from purchase_orders where po_number = v_number);
  end loop;

  insert into purchase_orders (site_id, po_number, shopkeeper_id, placed_by, kind)
  values (p_site_id, v_number, p_shopkeeper_id, auth.uid(), 'direct')
  returning * into v_po;

  with lines as (
    insert into orders (
      purchase_order_id, site_id, item_id, quantity_ordered, unit, placed_by, placed_date,
      status, created_at
    )
    select
      v_po.id, v_po.site_id, (l ->> 'item_id')::uuid, (l ->> 'quantity')::numeric,
      btrim(l ->> 'unit'), v_po.placed_by, v_po.placed_date, 'pending_approval', clock_timestamp()
    from jsonb_array_elements(p_lines) with ordinality as t (l, n)
    order by n
    returning id, quantity_ordered
  )
  insert into receiving_logs (
    order_id, quantity_received, condition_notes, received_by, received_date, invoice_number
  )
  select
    id, quantity_ordered, nullif(btrim(p_notes), ''), auth.uid(), coalesce(p_received_date, now()),
    nullif(btrim(p_invoice_number), '')
  from lines;

  return v_po;
end;
$$;
