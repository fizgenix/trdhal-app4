-- Inventory Release feature: HO2 releases stock to a building, deducting
-- from the site's running inventory (received minus already released).
--
-- Same atomic-RPC pattern as log_receiving / approve_order, plus one more
-- piece: the hard-stop-at-available-stock rule (confirmed answer, unlike
-- Receiving which has no such cap). Checking "is there enough left" and
-- then inserting the release has to be race-proof — two HO2 users
-- releasing the same low-stock item at the same moment must not both
-- pass the check. There's no single inventory row to lock (quantity
-- available is derived from two other tables), so this uses
-- pg_advisory_xact_lock keyed on (site, item) to serialize releases
-- against the same stock within the transaction.

create or replace function release_inventory(
  p_site_id uuid,
  p_item_id uuid,
  p_quantity_released numeric,
  p_quality_notes text,
  p_destination_building_id uuid,
  p_released_date timestamptz default now()
)
returns inventory_releases
language plpgsql
security definer set search_path = public
as $$
declare
  v_available numeric;
  v_release inventory_releases%rowtype;
begin
  if not (is_admin(auth.uid()) or has_site_role(auth.uid(), p_site_id, 'ho2_receiving')) then
    raise exception 'You do not have receiving access at this site.';
  end if;

  if p_quantity_released is null or p_quantity_released <= 0 then
    raise exception 'Enter a quantity greater than zero.';
  end if;

  if not exists (
    select 1 from buildings b where b.id = p_destination_building_id and b.site_id = p_site_id
  ) then
    raise exception 'That destination building does not belong to this site.';
  end if;

  -- Serialize concurrent releases against the same site+item so two
  -- requests can't both pass the availability check before either commits.
  perform pg_advisory_xact_lock(hashtextextended(p_site_id::text || ':' || p_item_id::text, 0));

  select coalesce(sum(r.quantity_received), 0) - coalesce((
    select sum(quantity_released) from inventory_releases
    where site_id = p_site_id and item_id = p_item_id
  ), 0)
  into v_available
  from receiving_logs r
  join orders o on o.id = r.order_id
  where o.site_id = p_site_id and o.item_id = p_item_id;

  v_available := coalesce(v_available, 0);

  if p_quantity_released > v_available then
    raise exception 'Only % available — cannot release %.', v_available, p_quantity_released;
  end if;

  insert into inventory_releases (
    site_id, item_id, quantity_released, quality_notes, destination_building_id, released_by, released_date
  )
  values (
    p_site_id, p_item_id, p_quantity_released, p_quality_notes, p_destination_building_id, auth.uid(),
    coalesce(p_released_date, now())
  )
  returning * into v_release;

  return v_release;
end;
$$;

grant execute on function release_inventory(uuid, uuid, numeric, text, uuid, timestamptz) to authenticated;

-- Anyone assigned to the site (or Admin) can read its release log.
create policy inventory_releases_select on inventory_releases for select
  using (is_admin(auth.uid()) or has_site_access(auth.uid(), site_id));

-- The site_inventory view (0001_init.sql) is queried directly by the
-- Release page to show current stock. Views execute as their owner by
-- default unless security_invoker is set, which could silently bypass the
-- RLS policies on the tables it reads — set it explicitly so the view
-- always enforces RLS as the querying user, per Supabase's own guidance.
alter view site_inventory set (security_invoker = on);
