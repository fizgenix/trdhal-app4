-- Partial approvals. HO3 no longer has to wait for the full ordered
-- quantity on a line:
--
-- 1. Approve what's been received so far — the line stays open; HO2 keeps
--    logging deliveries and HO3 approves each new batch. The line becomes
--    'completed' once received >= ordered and all of it is approved.
-- 2. Close short — accept what's been received as final (remarks
--    required) and complete the line even though it's below the ordered
--    quantity. No more deliveries can be logged against it after that.
--
-- So a line can now have several approvals, each recording how much it
-- approved. Status stays 'pending_approval' between partial approvals —
-- the app works out "partly approved" from the approved vs received
-- totals, rather than adding an enum value.

-- ─────────────────────────────────────────────────────────────────────────
-- approvals: many per line, each with the quantity it approved
-- ─────────────────────────────────────────────────────────────────────────

alter table approvals drop constraint approvals_order_id_key;

create index approvals_order_id_idx on approvals (order_id);

alter table approvals
  add column quantity_approved numeric,
  add column closes_short boolean not null default false;

-- Every existing approval approved the line's whole received total.
update approvals a
set quantity_approved = (
  select coalesce(sum(r.quantity_received), 0) from receiving_logs r where r.order_id = a.order_id
);

alter table approvals
  alter column quantity_approved set not null,
  add constraint approvals_quantity_approved_check check (quantity_approved >= 0);

-- ─────────────────────────────────────────────────────────────────────────
-- approve_order — same atomic, row-locked pattern as 0004, now approving
-- whatever's received but not yet approved. New parameter, so the old
-- signature is dropped rather than left callable.
-- ─────────────────────────────────────────────────────────────────────────

drop function approve_order(uuid, text);

create function approve_order(
  p_order_id uuid,
  p_remarks text default null,
  p_close_short boolean default false
)
returns approvals
language plpgsql
security definer set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_received numeric;
  v_approved numeric;
  v_to_approve numeric;
  v_approval approvals%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status != 'pending_approval' then
    raise exception 'Only items that are Pending Approval can be approved (status: %).', v_order.status;
  end if;

  if not (is_admin(auth.uid()) or has_site_role(auth.uid(), v_order.site_id, 'ho3_accounts')) then
    raise exception 'You do not have approval access at this site.';
  end if;

  select coalesce(sum(quantity_received), 0) into v_received
  from receiving_logs where order_id = p_order_id;

  select coalesce(sum(quantity_approved), 0) into v_approved
  from approvals where order_id = p_order_id;

  v_to_approve := v_received - v_approved;

  if p_close_short then
    if v_received >= v_order.quantity_ordered then
      raise exception 'This item is fully received — approve it normally instead of closing it short.';
    end if;
    if p_remarks is null or btrim(p_remarks) = '' then
      raise exception 'Add a remark explaining why this item is being closed short.';
    end if;
  elsif v_to_approve <= 0 then
    raise exception 'Nothing new to approve — everything received so far is already approved.';
  end if;

  insert into approvals (order_id, approved_by, remarks, quantity_approved, closes_short)
  values (p_order_id, auth.uid(), nullif(btrim(p_remarks), ''), greatest(v_to_approve, 0), p_close_short)
  returning * into v_approval;

  if p_close_short or v_received >= v_order.quantity_ordered then
    update orders set status = 'completed' where id = p_order_id;
  end if;

  return v_approval;
end;
$$;

grant execute on function approve_order(uuid, text, boolean) to authenticated;
