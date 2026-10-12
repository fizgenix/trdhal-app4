-- Direct receipts: misc items that arrive at site with no purchase order.
-- HO2 logs them on the Receiving page; HO3 approves (→ stock) or rejects.
--
-- Rather than a parallel set of tables, each direct receipt is stored as a
-- purchase order of kind 'direct' (numbered MISC-0001, MISC-0002, …) whose
-- lines are already received and waiting on approval. So approve_order(),
-- site_inventory, release_inventory() and the Stock Inventory ledger all
-- work on them unchanged. The Orders page hides 'direct' POs — HO1 never
-- placed them — and HO2 still gets no ordering access.

-- ─────────────────────────────────────────────────────────────────────────
-- purchase_orders: kind, and vendor optional for direct receipts
-- ─────────────────────────────────────────────────────────────────────────

alter table purchase_orders
  add column kind text not null default 'po' check (kind in ('po', 'direct'));

alter table purchase_orders alter column shopkeeper_id drop not null;

alter table purchase_orders
  add constraint purchase_orders_vendor_required check (kind = 'direct' or shopkeeper_id is not null);

create sequence direct_receipt_number_seq;

-- ─────────────────────────────────────────────────────────────────────────
-- HO2 can add new items and vendors (misc items are often new). Same
-- shape as the HO1 policies in 0001_init.sql.
-- ─────────────────────────────────────────────────────────────────────────

drop policy items_insert on items;
create policy items_insert on items for insert
  with check (
    is_admin(auth.uid())
    or exists (
      select 1 from user_sites us
      where us.user_id = auth.uid() and us.role in ('ho1_ordering', 'ho2_receiving')
    )
  );

drop policy shopkeepers_insert on shopkeepers;
create policy shopkeepers_insert on shopkeepers for insert
  with check (
    is_admin(auth.uid())
    or exists (
      select 1 from user_sites us
      where us.user_id = auth.uid() and us.role in ('ho1_ordering', 'ho2_receiving')
    )
  );

-- A rejected direct receipt is logged with its reason.
alter table order_edit_log drop constraint order_edit_log_action_check;
alter table order_edit_log add constraint order_edit_log_action_check
  check (action in ('edited', 'cancelled', 'added', 'removed', 'rejected'));

-- ─────────────────────────────────────────────────────────────────────────
-- log_direct_receipt — the MISC PO, its lines (already pending approval)
-- and one receiving log per line, in one transaction.
-- p_lines: [{ "item_id": uuid, "quantity": number, "unit": text }, …]
-- ─────────────────────────────────────────────────────────────────────────

create function log_direct_receipt(
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

  if p_notes is null or btrim(p_notes) = '' then
    raise exception 'Add a note on where these items came from.';
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
    id, quantity_ordered, btrim(p_notes), auth.uid(), coalesce(p_received_date, now()),
    nullif(btrim(p_invoice_number), '')
  from lines;

  return v_po;
end;
$$;

grant execute on function log_direct_receipt(uuid, uuid, timestamptz, text, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- reject_direct_receipt — HO3 turns down a direct-receipt line (reason
-- required). The line is cancelled, so it never reaches stock.
-- ─────────────────────────────────────────────────────────────────────────

create function reject_direct_receipt(p_order_id uuid, p_reason text)
returns orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_kind text;
begin
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Item not found.';
  end if;

  select kind into v_kind from purchase_orders where id = v_order.purchase_order_id;

  if v_kind <> 'direct' then
    raise exception 'Only direct receipts can be rejected.';
  end if;

  if not (is_admin(auth.uid()) or has_site_role(auth.uid(), v_order.site_id, 'ho3_accounts')) then
    raise exception 'You do not have approval access at this site.';
  end if;

  if v_order.status <> 'pending_approval'
    or exists (select 1 from approvals where order_id = p_order_id) then
    raise exception 'Only items still waiting on approval can be rejected.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Add a reason for rejecting this item.';
  end if;

  update orders set status = 'cancelled' where id = p_order_id
  returning * into v_order;

  insert into order_edit_log (order_id, edited_by, action, note)
  values (p_order_id, auth.uid(), 'rejected', btrim(p_reason));

  return v_order;
end;
$$;

grant execute on function reject_direct_receipt(uuid, text) to authenticated;
