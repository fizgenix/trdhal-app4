-- 1. A delivery's received date can't be before its PO's order date —
--    checked on the calendar day in India time, the same way as
--    0009_received_date_not_future.sql. Direct receipts (MISC-) are skipped:
--    their "order" is created when the receipt is logged, so a backdated
--    received date is expected there.
--
-- 2. A logged delivery can be corrected (quantity, received date, invoice,
--    notes) through edit_receiving() — by the person who logged it, or
--    Admin, and only until HO3 has approved it. Every edit is kept in
--    receiving_edit_log with the previous values, like order_edit_log.

-- ─────────────────────────────────────────────────────────────────────────
-- Received date >= order date
-- ─────────────────────────────────────────────────────────────────────────

create function receiving_logs_received_date_not_before_order()
returns trigger
language plpgsql
as $$
declare
  v_placed_date timestamptz;
begin
  select po.placed_date into v_placed_date
  from orders o
  join purchase_orders po on po.id = o.purchase_order_id
  where o.id = new.order_id and po.kind = 'po';

  if v_placed_date is not null
     and (new.received_date at time zone 'Asia/Kolkata')::date
         < (v_placed_date at time zone 'Asia/Kolkata')::date then
    raise exception 'The received date can''t be before the order date (%).',
      to_char(v_placed_date at time zone 'Asia/Kolkata', 'FMDD Mon YYYY');
  end if;
  return new;
end;
$$;

create trigger receiving_logs_received_date_not_before_order
before insert or update of received_date on receiving_logs
for each row execute function receiving_logs_received_date_not_before_order();

-- ─────────────────────────────────────────────────────────────────────────
-- receiving_edit_log
-- ─────────────────────────────────────────────────────────────────────────

create table receiving_edit_log (
  id uuid primary key default gen_random_uuid(),
  receiving_log_id uuid not null references receiving_logs (id) on delete cascade,
  edited_by uuid not null references profiles (id),
  edited_at timestamptz not null default now(),
  note text,
  previous_values jsonb not null
);

create index receiving_edit_log_receiving_log_id_idx on receiving_edit_log (receiving_log_id);

alter table receiving_edit_log enable row level security;

-- Readable by anyone who can read the delivery itself. No write policies —
-- written only by edit_receiving() below.
create policy receiving_edit_log_select on receiving_edit_log for select
  using (
    is_admin(auth.uid())
    or exists (
      select 1 from receiving_logs r
      join orders o on o.id = r.order_id
      where r.id = receiving_edit_log.receiving_log_id and has_site_access(auth.uid(), o.site_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- edit_receiving
-- ─────────────────────────────────────────────────────────────────────────

create function edit_receiving(
  p_receiving_log_id uuid,
  p_quantity_received numeric,
  p_received_date timestamptz,
  p_invoice_number text,
  p_condition_notes text,
  p_note text default null
)
returns receiving_logs
language plpgsql
security definer set search_path = public
as $$
declare
  v_log receiving_logs%rowtype;
  v_order orders%rowtype;
begin
  select * into v_log from receiving_logs where id = p_receiving_log_id;

  if not found then
    raise exception 'Delivery not found.';
  end if;

  -- Lock the line, the same row approve_order() locks, so an approval
  -- can't land between the check below and the update.
  select * into v_order from orders where id = v_log.order_id for update;

  if not (
    is_admin(auth.uid())
    or (v_log.received_by = auth.uid() and has_site_role(auth.uid(), v_order.site_id, 'ho2_receiving'))
  ) then
    raise exception 'Only the person who logged this delivery can edit it.';
  end if;

  if v_order.status not in ('placed', 'pending_approval') then
    raise exception 'This delivery can no longer be edited — the item is closed.';
  end if;

  -- An approval covers everything received before it.
  if exists (
    select 1 from approvals a
    where a.order_id = v_log.order_id and a.created_at >= v_log.created_at
  ) then
    raise exception 'This delivery has already been approved and can no longer be edited.';
  end if;

  if p_quantity_received is null or p_quantity_received <= 0 then
    raise exception 'Enter a quantity greater than zero.';
  end if;

  if p_invoice_number is null or btrim(p_invoice_number) = '' then
    raise exception 'Enter the invoice number for this delivery.';
  end if;

  if p_received_date is null then
    raise exception 'Pick the date this delivery arrived.';
  end if;

  insert into receiving_edit_log (receiving_log_id, edited_by, note, previous_values)
  values (
    p_receiving_log_id, auth.uid(), nullif(btrim(p_note), ''),
    jsonb_build_object(
      'quantity_received', v_log.quantity_received,
      'received_date', v_log.received_date,
      'invoice_number', v_log.invoice_number,
      'condition_notes', v_log.condition_notes
    )
  );

  -- The received-date triggers (not in the future, not before the order
  -- date) check the new date here.
  update receiving_logs
  set quantity_received = p_quantity_received,
      received_date = p_received_date,
      invoice_number = btrim(p_invoice_number),
      condition_notes = nullif(btrim(p_condition_notes), '')
  where id = p_receiving_log_id
  returning * into v_log;

  return v_log;
end;
$$;

grant execute on function edit_receiving(uuid, numeric, timestamptz, text, text, text) to authenticated;
