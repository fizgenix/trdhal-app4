-- New items now pick their unit from a standard list (src/lib/units.ts).
-- Bring units already saved in line with it, so the same unit isn't
-- spelled several ways. Only exact known spellings are rewritten; anything
-- else is left as it is.

update items
set unit = case lower(regexp_replace(unit, '[\s.]+', '', 'g'))
  when 'bag' then 'bags'
  when 'kgs' then 'kg' when 'kilo' then 'kg' when 'kilos' then 'kg'
  when 'kilogram' then 'kg' when 'kilograms' then 'kg'
  when 'tons' then 'ton' when 'tonne' then 'ton' when 'tonnes' then 'ton' when 'mt' then 'ton'
  when 'pc' then 'pcs' when 'piece' then 'pcs' when 'pieces' then 'pcs'
  when 'no' then 'pcs' when 'nos' then 'pcs' when 'number' then 'pcs' when 'numbers' then 'pcs'
  when 'unit' then 'pcs' when 'units' then 'pcs'
  when 'box' then 'boxes'
  when 'sqft' then 'sq.ft' when 'sft' then 'sq.ft'
  when 'sqm' then 'sq.m' when 'sqmt' then 'sq.m'
  when 'cft' then 'cu.ft' when 'cuft' then 'cu.ft'
  when 'cum' then 'cu.m' when 'cumt' then 'cu.m'
  when 'mtr' then 'metre' when 'mtrs' then 'metre' when 'metres' then 'metre'
  when 'meter' then 'metre' when 'meters' then 'metre'
  when 'ltr' then 'litre' when 'ltrs' then 'litre' when 'litres' then 'litre'
  when 'liter' then 'litre' when 'liters' then 'litre'
  else unit
end
where unit is not null;
