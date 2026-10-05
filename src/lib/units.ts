/**
 * Standard units for items. New items pick from this list (with an
 * "Other…" escape hatch), so the same unit isn't saved as "pcs", "Pcs",
 * "pieces" and "nos" — quantities are summed per item, so the unit has to
 * be unambiguous.
 */
export const STANDARD_UNITS = [
  { value: "bags", label: "bags" },
  { value: "kg", label: "kg" },
  { value: "ton", label: "ton" },
  { value: "pcs", label: "pcs (pieces / nos)" },
  { value: "boxes", label: "boxes" },
  { value: "sq.ft", label: "sq.ft" },
  { value: "sq.m", label: "sq.m" },
  { value: "cu.ft", label: "cu.ft" },
  { value: "cu.m", label: "cu.m" },
  { value: "brass", label: "brass (100 cu.ft)" },
  { value: "rft", label: "rft (running feet)" },
  { value: "metre", label: "metre" },
  { value: "litre", label: "litre" },
] as const;

/** Common spellings → the standard unit. Keys are lowercase with spaces/dots removed. */
const SYNONYMS: Record<string, string> = {
  bag: "bags", bags: "bags",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ton: "ton", tons: "ton", tonne: "ton", tonnes: "ton", mt: "ton",
  pc: "pcs", pcs: "pcs", piece: "pcs", pieces: "pcs", no: "pcs", nos: "pcs", number: "pcs", numbers: "pcs", unit: "pcs", units: "pcs",
  box: "boxes", boxes: "boxes",
  sqft: "sq.ft", sft: "sq.ft", squarefeet: "sq.ft", squarefoot: "sq.ft",
  sqm: "sq.m", sqmt: "sq.m", squaremetre: "sq.m", squaremeter: "sq.m", squaremetres: "sq.m", squaremeters: "sq.m",
  cft: "cu.ft", cuft: "cu.ft", cubicfeet: "cu.ft", cubicfoot: "cu.ft",
  cum: "cu.m", cumt: "cu.m", cubicmetre: "cu.m", cubicmeter: "cu.m", cubicmetres: "cu.m", cubicmeters: "cu.m",
  brass: "brass", bras: "brass",
  rft: "rft", runningfeet: "rft", runningfoot: "rft", rf: "rft",
  m: "metre", mtr: "metre", mtrs: "metre", metre: "metre", metres: "metre", meter: "metre", meters: "metre",
  l: "litre", ltr: "litre", ltrs: "litre", litre: "litre", litres: "litre", liter: "litre", liters: "litre",
};

/** Maps a typed unit to its standard form when it's a known spelling; otherwise returns it trimmed. */
export function canonicalUnit(raw: string): string {
  const key = raw.toLowerCase().replace(/[\s.]+/g, "");
  return SYNONYMS[key] ?? raw.trim();
}
