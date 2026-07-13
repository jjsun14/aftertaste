/**
 * Import resolution (spec: docs/import-spec.md §3).
 *
 * Each parsed row → Google Places search (biased by the row's own
 * location hint or the batch default) → confidence-scored candidates.
 * Throttled so a large paste can't burn the API quota in one burst.
 */
import { searchGooglePlaces } from '@/lib/googlePlaces';
import { makeSessionToken, searchLocations, retrieveLocation } from '@/lib/mapboxLocation';
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
  candidates: SearchResult[];      // up to 3 (nearest-first for chains)
  chosen: SearchResult | null;     // pre-selected for confirmed, else user taps
  excluded: boolean;               // user opted the row out on the review screen
  /** Where this row was searched — shown and editable on the review screen */
  locationLabel: string;
  bias: Coords | null;
}

const CONCURRENCY = 4;

/** lowercase, strip diacritics/punctuation, collapse whitespace */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Apostrophes vanish rather than become spaces — users type "wendys"
    // for "Wendy's"; mapping to "wendy s" broke every chain match.
    .replace(/['’`]/g, '')
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

export type Coords = { lat: number; lng: number };

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Geocode a location string ("NYC", "33328", "Ellicott City") to coords.
 * Cached per unique string; proximity makes ambiguous names ("Springfield")
 * resolve near the batch area instead of wherever ranks globally.
 */
export async function geocodeCity(
  city: string,
  cache: Map<string, Coords | null>,
  proximity?: Coords | null,
): Promise<Coords | null> {
  const key = city.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  let coords: Coords | null = null;
  try {
    const token = makeSessionToken();
    const suggestions = await searchLocations(city, token, proximity ?? undefined);
    if (suggestions.length > 0) {
      const place = await retrieveLocation(suggestions[0].mapbox_id, token);
      if (place) coords = { lat: place.lat, lng: place.lng };
    }
  } catch { /* fall back to batch bias */ }
  cache.set(key, coords);
  return coords;
}

/**
 * Score + rank search results for one imported name.
 * - Name similarity is the base score; distance from the bias point is a
 *   penalty, so "Culver's 3km away" always beats "Culver's in Kansas".
 * - Chains (several results normalizing to the same name) are NEVER
 *   auto-confirmed — the user must pick the location; candidates are the
 *   nearest ones.
 */
export function classifyCandidates(
  name: string,
  results: SearchResult[],
  bias: Coords | null,
): { candidates: SearchResult[]; topScore: number; isChain: boolean } {
  const scored = results
    .map((r) => {
      const nameScore = matchScore(name, r.name);
      let penalty = 0;
      if (bias && r.latitude !== undefined && r.longitude !== undefined) {
        penalty = Math.min(0.25, haversineKm(bias, { lat: r.latitude, lng: r.longitude }) / 400);
      }
      return { r, nameScore, score: nameScore - penalty };
    })
    .filter((x) => x.nameScore >= 0.4)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top) return { candidates: [], topScore: 0, isChain: false };

  const topNorm = normalizeName(top.r.name);
  const sameName = scored.filter((x) => normalizeName(x.r.name) === topNorm);
  const isChain = sameName.length > 1;

  // For chains, offer the nearest same-name locations first
  const ordered = isChain
    ? [...sameName, ...scored.filter((x) => normalizeName(x.r.name) !== topNorm)]
    : scored;

  return {
    candidates: ordered.slice(0, 3).map((x) => x.r),
    topScore: top.nameScore,
    isChain,
  };
}

async function resolveOne(
  row: ParsedRow,
  batchBias: Coords | null,
  batchLabel: string,
  cityCache: Map<string, Coords | null>,
  existingKeys: Set<string>,
  existingPlaceIds: Set<string>,
): Promise<ResolvedRow> {
  // Location precedence: exact coords from a Maps URL → the row's own
  // city hint (geocoded near the batch area) → the batch default.
  let bias: Coords | null = null;
  let locationLabel = batchLabel;
  if (row.coords) {
    bias = row.coords;
    locationLabel = 'from your link';
  } else if (row.city) {
    const geocoded = await geocodeCity(row.city, cityCache, batchBias);
    if (geocoded) {
      bias = geocoded;
      locationLabel = row.city;
    }
  }
  if (!bias) bias = batchBias;

  let results: SearchResult[] = [];
  try {
    results = await searchGooglePlaces(row.name, bias?.lat ?? null, bias?.lng ?? null);
  } catch {
    // network/API failure → let the user retry from the review screen
  }

  const { candidates, topScore, isChain } = classifyCandidates(row.name, results, bias);
  const base = { row, candidates, excluded: false, locationLabel, bias };

  if (candidates.length === 0) {
    return { ...base, status: 'attention', chosen: null };
  }

  const top = candidates[0];
  const isDupe = existingPlaceIds.has(top.id) || existingKeys.has(normalizeName(top.name));
  if (isDupe) {
    return { ...base, status: 'duplicate', chosen: top, excluded: true };
  }

  // Chains require a human to pick the location — never auto-confirm.
  if (topScore >= 0.85 && !isChain) {
    return { ...base, status: 'confirmed', chosen: top };
  }
  return { ...base, status: 'pick', chosen: null };
}

/**
 * Resolve all rows with limited concurrency. `existingKeys` = normalized
 * names of current memories + want-to-try; `existingPlaceIds` = their
 * place_ids where known. Duplicate rows within the batch itself are
 * collapsed before any network call (saves quota).
 */
export async function resolveRows(
  rows: ParsedRow[],
  bias: Coords | null,
  batchLabel: string,
  existingKeys: Set<string>,
  existingPlaceIds: Set<string>,
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
  const cityCache = new Map<string, Coords | null>();
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < unique.length) {
      const i = next++;
      out[i] = await resolveOne(unique[i], bias, batchLabel, cityCache, existingKeys, existingPlaceIds);
      done++;
      onProgress?.(done, unique.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker()),
  );
  return out;
}
