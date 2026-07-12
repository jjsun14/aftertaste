/**
 * Import resolution (spec: docs/import-spec.md §3).
 *
 * Each parsed row → Foursquare search (food-filtered, biased by the batch
 * location) → confidence-scored candidates. Throttled so a large paste
 * can't burn the FSQ quota in one burst.
 */
import { searchFoursquarePlaces } from '@/lib/foursquare';
import type { SearchResult } from '@/data/mockData';
import type { ParsedRow } from '@/lib/importParse';

export type ResolveStatus =
  | 'confirmed'   // high-confidence top match, pre-checked
  | 'pick'        // plausible candidates, user should choose
  | 'attention'   // nothing food-shaped matched
  | 'duplicate';  // already in memories or want-to-try

export interface ResolvedRow {
  row: ParsedRow;
  status: ResolveStatus;
  candidates: SearchResult[];      // up to 3
  chosen: SearchResult | null;     // pre-selected for confirmed, else user taps
  excluded: boolean;               // user opted the row out on the review screen
}

const CONCURRENCY = 4;

/** lowercase, strip diacritics/punctuation, collapse whitespace */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchScore(query: string, candidate: string): number {
  const q = normalizeName(query);
  const c = normalizeName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 0.85;
  if (c.includes(q) || q.includes(c)) return 0.7;
  // token overlap (order-insensitive): "story juk siroo" still matches
  const qt = new Set(q.split(' '));
  const ct = new Set(c.split(' '));
  let hits = 0;
  qt.forEach((t) => { if (ct.has(t)) hits++; });
  return hits / Math.max(qt.size, 1) * 0.8;
}

async function resolveOne(
  row: ParsedRow,
  bias: { lat: number; lng: number } | null,
  existingKeys: Set<string>,
  existingFsqIds: Set<string>,
): Promise<ResolvedRow> {
  let results: SearchResult[] = [];
  try {
    results = await searchFoursquarePlaces(row.name, bias?.lat ?? null, bias?.lng ?? null);
  } catch {
    // network/API failure → let the user retry from the review screen
  }

  const scored = results
    .map((r) => ({ r, score: matchScore(row.name, r.name) }))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const candidates = scored.map((x) => x.r);
  const top = scored[0];

  if (!top) {
    return { row, status: 'attention', candidates: [], chosen: null, excluded: false };
  }

  const isDupe =
    existingFsqIds.has(top.r.id) ||
    existingKeys.has(normalizeName(top.r.name));
  if (isDupe) {
    return { row, status: 'duplicate', candidates, chosen: top.r, excluded: true };
  }

  if (top.score >= 0.85) {
    return { row, status: 'confirmed', candidates, chosen: top.r, excluded: false };
  }
  return { row, status: 'pick', candidates, chosen: null, excluded: false };
}

/**
 * Resolve all rows with limited concurrency. `existingKeys` = normalized
 * names of current memories + want-to-try; `existingFsqIds` = their
 * fsq_place_ids where known. Duplicate rows within the batch itself are
 * collapsed before any network call (saves quota).
 */
export async function resolveRows(
  rows: ParsedRow[],
  bias: { lat: number; lng: number } | null,
  existingKeys: Set<string>,
  existingFsqIds: Set<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<ResolvedRow[]> {
  // In-batch dedupe by normalized name
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = normalizeName(r.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const out: ResolvedRow[] = new Array(unique.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < unique.length) {
      const i = next++;
      out[i] = await resolveOne(unique[i], bias, existingKeys, existingFsqIds);
      done++;
      onProgress?.(done, unique.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker()),
  );
  return out;
}
