/**
 * Small fuzzy matcher for the Item / Vendor pickers — tolerant of case,
 * spacing, punctuation and small typos, so "8x8 white-tiles", "8X8 White
 * Tiles" and "8x8 whte tiles" all find the same saved entry instead of
 * becoming three separate ones. Shared by the client picker and the
 * createOrder server action.
 */

/** Lowercase, punctuation turned into spaces, whitespace collapsed. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Edit distance where swapping two neighbouring letters ("cemnet" →
 * "cement") counts as one typo, not two (optimal string alignment).
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** 0..1 — how alike two (already normalized) strings are, by edit distance. */
function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editDistance(a, b) / max;
}

/**
 * 0..1 score of how well a typed query matches a saved name.
 *  1      — same name once case/spacing/punctuation are ignored
 *  ≥ 0.9  — the name starts with / contains what was typed
 *  else   — typo tolerance: whole-string similarity, plus each typed word
 *           against its best-matching word in the name (so "whte tiles"
 *           still finds "8x8 White Tiles").
 */
export function matchScore(query: string, name: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q) return 0;
  if (q === n) return 1;
  if (n.startsWith(q)) return 0.95;
  if (n.includes(q)) return 0.9;

  const qWords = q.split(" ");
  const nWords = n.split(" ");
  // Each typed word vs. its best word in the name — full word, or the
  // word's start for a partly-typed one ("cem" → "cement").
  const wordSim = (qw: string, nw: string) =>
    Math.max(similarity(qw, nw), qw.length >= 3 ? similarity(qw, nw.slice(0, qw.length)) : 0);
  const wordScore =
    qWords.reduce((sum, qw) => sum + Math.max(...nWords.map((nw) => wordSim(qw, nw))), 0) /
    qWords.length;
  // Word-level matches are slightly discounted vs. a whole-name match, but
  // every typed word being a near-miss of a saved word still counts as
  // "similar" (≥ SIMILAR_THRESHOLD) — "whte tils" → "8x8 White Tiles".
  return Math.max(similarity(q, n), wordScore * 0.95);
}

/** Below this, an option isn't shown as a search result at all. */
export const SHOW_THRESHOLD = 0.6;
/** At or above this, a "new" name is close enough to an existing one to ask "did you mean…?" */
export const SIMILAR_THRESHOLD = 0.75;

export function rankMatches<T>(
  query: string,
  options: T[],
  nameOf: (o: T) => string,
): Array<{ option: T; score: number }> {
  return options
    .map((option) => ({ option, score: matchScore(query, nameOf(option)) }))
    .filter((r) => r.score >= SHOW_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}
