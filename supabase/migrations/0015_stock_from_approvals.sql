-- Site stock now counts only what HO3 has *approved*, not everything HO2
-- has received. Received-but-unapproved goods can't be released until
-- they're approved. Stock = approved − released, per (site, item, unit),
-- exactly as before otherwise (0011_unit_per_order.sql).
--
-- Releases made before this change could exceed the approved total; the
-- Stock Inventory page shows such a line as a negative balance rather
-- than hiding it.

-- ─────────────────────────────────────────────────────────────────────────
-- site_inventory — approved in, minus released. Same columns as before, so
-- the Release page reads it unchanged. security_invoker re-applied as in
-- 0005 so the view enforces RLS as the querying user.
-- ─────────────────────────────────────────────────────────────────────────

drop view site_inventory;

create view site_inventory as
select
  coalesce(app.site_id, rel.site_id) as site_id,
  coalesce(app.item_id, rel.item_id) as item_id,
  coalesce(app.unit, rel.unit) as unit,
  coalesce(app.approved, 0) - coalesce(rel.released, 0) as quantity_available
from (
  select o.site_id, o.item_id, o.unit, sum(a.quantity_approved) as approved
  from approvals a
  join orders o on o.id = a.order_id
  group by o.site_id, o.item_id, o.unit
) app
full outer join (
  select site_id, item_id, unit, sum(quantity_released) as released
  from inventory_releases
  group by site_id, item_id, unit
) rel
  on rel.site_id = app.site_id and rel.item_id = app.item_id and rel.unit = app.unit;

alter view site_inventory set (security_invoker = on);

-- ─────────────────────────────────────────────────────────────────────────
-- release_inventory — same signature and lock as 0011; the availability
-- check now sums approvals instead of receiving logs.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function release_inventory(
  p_site_id uuid,
  p_item_id uuid,
  p_unit text,
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

  if p_unit is null or btrim(p_unit) = '' then
    raise exception 'Choose which stock to release from.';
  end if;

  if not exists (
    select 1 from buildings b where b.id = p_destination_building_id and b.site_id = p_site_id
  ) then
    raise exception 'That destination building does not belong to this site.';
  end if;

  -- Serialize concurrent releases against the same stock line so two
  -- requests can't both pass the availability check before either commits.
  perform pg_advisory_xact_lock(
    hashtextextended(p_site_id::text || ':' || p_item_id::text || ':' || p_unit, 0)
  );

  select coalesce(sum(a.quantity_approved), 0) - coalesce((
    select sum(quantity_released) from inventory_releases
    where site_id = p_site_id and item_id = p_item_id and unit = p_unit
  ), 0)
  into v_available
  from approvals a
  join orders o on o.id = a.order_id
  where o.site_id = p_site_id and o.item_id = p_item_id and o.unit = p_unit;

  v_available := coalesce(v_available, 0);

  if p_quantity_released > v_available then
    raise exception 'Only % % approved and available — cannot release %.', v_available, p_unit, p_quantity_released;
  end if;

  insert into inventory_releases (
    site_id, item_id, unit, quantity_released, quality_notes, destination_building_id,
    released_by, released_date
  )
  values (
    p_site_id, p_item_id, p_unit, p_quantity_released, p_quality_notes, p_destination_building_id,
    auth.uid(), coalesce(p_released_date, now())
  )
  returning * into v_release;

  return v_release;
end;
$$;
