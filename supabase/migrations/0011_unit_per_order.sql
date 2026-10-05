-- The unit now belongs to each order instead of being fixed on the item.
-- Sand can be ordered in ton one day and kg the next; that order's receiving,
-- "left to receive" check, approval and history all stay in the order's own
-- unit. items.unit stays as the item's usual unit, pre-filled on the order form.
--
-- Site stock (Release) is tracked per item *and* unit: "Sand: 2 ton" and
-- "Sand: 500 kg" are separate stock lines, released from separately.
-- No conversion between units, so totals can never mix them.

-- ─────────────────────────────────────────────────────────────────────────
-- orders.unit — backfilled from the item's unit, which is what every
-- existing order was implicitly in.
-- ─────────────────────────────────────────────────────────────────────────

alter table orders add column unit text;

update orders o
set unit = i.unit
from items i
where i.id = o.item_id;

alter table orders alter column unit set not null;

-- ─────────────────────────────────────────────────────────────────────────
-- inventory_releases.unit — which stock line a release came out of.
-- ─────────────────────────────────────────────────────────────────────────

alter table inventory_releases add column unit text;

update inventory_releases r
set unit = i.unit
from items i
where i.id = r.item_id;

alter table inventory_releases alter column unit set not null;

drop index if exists inventory_releases_site_item_idx;
create index inventory_releases_site_item_unit_idx on inventory_releases (site_id, item_id, unit);

-- ─────────────────────────────────────────────────────────────────────────
-- site_inventory — stock per (site, item, unit). Dropped and recreated
-- because the grouping changes; security_invoker re-applied as in 0005.
-- ─────────────────────────────────────────────────────────────────────────

drop view site_inventory;

create view site_inventory as
select
  coalesce(rec.site_id, rel.site_id) as site_id,
  coalesce(rec.item_id, rel.item_id) as item_id,
  coalesce(rec.unit, rel.unit) as unit,
  coalesce(rec.received, 0) - coalesce(rel.released, 0) as quantity_available
from (
  select o.site_id, o.item_id, o.unit, sum(r.quantity_received) as received
  from receiving_logs r
  join orders o on o.id = r.order_id
  group by o.site_id, o.item_id, o.unit
) rec
full outer join (
  select site_id, item_id, unit, sum(quantity_released) as released
  from inventory_releases
  group by site_id, item_id, unit
) rel
  on rel.site_id = rec.site_id and rel.item_id = rec.item_id and rel.unit = rec.unit;

alter view site_inventory set (security_invoker = on);

-- ─────────────────────────────────────────────────────────────────────────
-- release_inventory — same atomic, lock-guarded check as 0005, now against
-- one (site, item, unit) stock line. New parameter, so the old signature is
-- dropped rather than left callable.
-- ─────────────────────────────────────────────────────────────────────────

drop function release_inventory(uuid, uuid, numeric, text, uuid, timestamptz);

create function release_inventory(
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

  select coalesce(sum(r.quantity_received), 0) - coalesce((
    select sum(quantity_released) from inventory_releases
    where site_id = p_site_id and item_id = p_item_id and unit = p_unit
  ), 0)
  into v_available
  from receiving_logs r
  join orders o on o.id = r.order_id
  where o.site_id = p_site_id and o.item_id = p_item_id and o.unit = p_unit;

  v_available := coalesce(v_available, 0);

  if p_quantity_released > v_available then
    raise exception 'Only % % available — cannot release %.', v_available, p_unit, p_quantity_released;
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

grant execute on function release_inventory(uuid, uuid, text, numeric, text, uuid, timestamptz)
  to authenticated;
