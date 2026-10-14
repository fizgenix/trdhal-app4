-- Each item line of a PO can carry an optional short description (size,
-- brand, spec — e.g. "25mm, ISI marked"), entered on the Orders tab when
-- placing the PO or adding an item to it, and shown wherever the line is.

alter table orders add column description text;

-- create_purchase_order: same as 0020_po_placed_date.sql, plus each line's
-- optional "description" in p_lines.
create or replace function create_purchase_order(
  p_site_id uuid,
  p_po_number text,
  p_shopkeeper_id uuid,
  p_lines jsonb,
  p_placed_date date default null
)
returns purchase_orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_po purchase_orders%rowtype;
  v_placed_date timestamptz;
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

  if p_placed_date is null or p_placed_date = (now() at time zone 'Asia/Kolkata')::date then
    v_placed_date := now();
  else
    -- A future date is rejected by the purchase_orders_placed_date_not_future trigger.
    v_placed_date := (p_placed_date + time '12:00') at time zone 'Asia/Kolkata';
  end if;

  insert into purchase_orders (site_id, po_number, shopkeeper_id, placed_by, placed_date)
  values (p_site_id, btrim(p_po_number), p_shopkeeper_id, auth.uid(), v_placed_date)
  returning * into v_po;

  -- clock_timestamp() (not now()) for created_at, so it rises row by row
  -- and the lines list back in the order they were entered on the PO.
  insert into orders (
    purchase_order_id, site_id, item_id, quantity_ordered, unit, description,
    placed_by, placed_date, created_at
  )
  select
    v_po.id, v_po.site_id, (l ->> 'item_id')::uuid, (l ->> 'quantity_ordered')::numeric,
    btrim(l ->> 'unit'), nullif(btrim(l ->> 'description'), ''),
    v_po.placed_by, v_po.placed_date, clock_timestamp()
  from jsonb_array_elements(p_lines) with ordinality as t (l, n)
  order by n;

  return v_po;
end;
$$;

-- add_order_line gains p_description. Same body as in 0012_purchase_orders.sql
-- apart from that.
drop function add_order_line(uuid, uuid, numeric, text, text);

create function add_order_line(
  p_purchase_order_id uuid,
  p_item_id uuid,
  p_quantity_ordered numeric,
  p_unit text,
  p_note text default null,
  p_description text default null
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

  insert into orders (purchase_order_id, site_id, item_id, quantity_ordered, unit, description, placed_by)
  values (
    p_purchase_order_id, v_po.site_id, p_item_id, p_quantity_ordered, btrim(p_unit),
    nullif(btrim(p_description), ''), v_po.placed_by
  )
  returning * into v_line;

  insert into order_edit_log (order_id, edited_by, action, note)
  values (v_line.id, auth.uid(), 'added', nullif(btrim(p_note), ''));

  return v_line;
end;
$$;

grant execute on function add_order_line(uuid, uuid, numeric, text, text, text) to authenticated;
