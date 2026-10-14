-- The person placing a PO now picks its date (defaults to today), so a PO
-- placed on paper earlier can be entered with its real date. The date
-- can't be in the future — checked against today in India time (the
-- business's timezone), on top of the same check in the Orders form and
-- the createOrder server action.
--
-- Today's date stores the current time, as before. An earlier date is
-- stored as noon India time on that day, so it shows as the same day
-- whether it's formatted in UTC or IST.

create function purchase_orders_placed_date_not_future()
returns trigger
language plpgsql
as $$
begin
  if (new.placed_date at time zone 'Asia/Kolkata')::date
       > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The order date can''t be in the future.';
  end if;
  return new;
end;
$$;

create trigger purchase_orders_placed_date_not_future
before insert or update of placed_date on purchase_orders
for each row execute function purchase_orders_placed_date_not_future();

-- create_purchase_order gains p_placed_date. Same body as in
-- 0012_purchase_orders.sql apart from the date.
drop function create_purchase_order(uuid, text, uuid, jsonb);

create function create_purchase_order(
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
    -- A future date is rejected by the trigger above.
    v_placed_date := (p_placed_date + time '12:00') at time zone 'Asia/Kolkata';
  end if;

  insert into purchase_orders (site_id, po_number, shopkeeper_id, placed_by, placed_date)
  values (p_site_id, btrim(p_po_number), p_shopkeeper_id, auth.uid(), v_placed_date)
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

grant execute on function create_purchase_order(uuid, text, uuid, jsonb, date) to authenticated;
