import type { SearchResult } from '@/data/mockData';

// Foursquare Places API (FSQ OS) — Service Key + Bearer auth
const FSQ_API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '';
const FSQ_BASE = 'https://places-api.foursquare.com';
const FSQ_API_VERSION = '2025-06-17';

// "Dining and Drinking" root category (NEW taxonomy). Two traps here:
//  - integer ids like `categories=13000` are rejected by this API version;
//    it must be `fsq_category_ids` with a hex id.
//  - the LEGACY v2 "Food" root (4d4b7105d754a06374d81259) silently excludes
//    everything that moved in the taxonomy reorg: cafés, coffee shops,
//    bakeries, all bars, breweries, dessert shops, food trucks, juice bars.
//    Verified empirically against the live API (July 2026).
const FOOD_CATEGORY_ID = '63be6904847c3692a84b9bb5';

interface FSQPlace {
  fsq_place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  location: {
    address?: string;
    locality?: string;       // city
    region?: string;         // state
    postcode?: string;
    country?: string;
    formatted_address?: string;
  };
  categories: {
    fsq_category_id: string;
    name: string;
    short_name: string;
  }[];
  distance?: number;         // meters, when ll is provided
}

// Strip generic suffixes so "Italian Restaurant" → "Italian", etc.
const STRIP_SUFFIXES = /\s+(Restaurant|Place|Shop|Joint|Spot|House|Eatery|Establishment|Parlor)$/i;

function cleanCategory(place: FSQPlace): string {
  const raw = place.categories[0]?.short_name ?? place.categories[0]?.name ?? '';
  return raw.replace(STRIP_SUFFIXES, '').trim();
}

/**
 * Search Foursquare Places (FSQ OS) for restaurants/food venues.
 *
 * @param query - free-text search (e.g. "pizza", "ramen"); empty = browse nearby
 * @param lat   - optional user latitude for nearby ranking
 * @param lng   - optional user longitude
 */
async function fetchFSQ(
  params: URLSearchParams,
): Promise<FSQPlace[]> {
  const response = await fetch(`${FSQ_BASE}/places/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${FSQ_API_KEY}`,
      'X-Places-Api-Version': FSQ_API_VERSION,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Foursquare API error ${response.status}: ${text}`);
  }

  const json = await response.json();
  return json.results ?? [];
}

function mapPlaces(places: FSQPlace[]): SearchResult[] {
  return places.map((place): SearchResult => {
    const address =
      place.location.formatted_address ??
      [place.location.address, place.location.locality, place.location.region, place.location.country]
        .filter(Boolean).join(', ') ??
      '';

    let distanceStr = '';
    if (place.distance !== undefined) {
      distanceStr = place.distance < 1000
        ? `${place.distance} m`
        : `${(place.distance / 1609).toFixed(1)} mi`;
    }

    return {
      id: place.fsq_place_id,
      name: place.name,
      address,
      city: place.location.locality,
      state: place.location.region,
      distance: distanceStr,
      category: cleanCategory(place),
      priceTier: undefined,
      latitude: place.latitude,
      longitude: place.longitude,
      // Flags are applied at render time in StepSearch, so toggling a
      // bookmark doesn't have to re-run the whole search.
      isVisited: false,
      isBookmarked: false,
    };
  });
}

export async function searchFoursquarePlaces(
  query: string,
  lat: number | null,
  lng: number | null,
): Promise<SearchResult[]> {
  const hasLocation = lat !== null && lng !== null;
  const hasQuery = query.trim().length > 0;

  // Typed query → two calls in parallel, merged:
  //  1. RELEVANCE, no radius: strong matches ranked best-first, including
  //     exact matches far away (never cut off by a radius ring).
  //  2. DISTANCE within 40km: rescues weak/partial matches that RELEVANCE
  //     drops when they aren't close (verified: "septim" 2.4km from
  //     Septime returns 0 under RELEVANCE but matches under DISTANCE).
  // Relevance results lead; distance-only extras are appended (deduped).
  if (hasQuery) {
    const base = {
      query: query.trim(),
      fsq_category_ids: FOOD_CATEGORY_ID,
      limit: '50',
    };

    if (!hasLocation) {
      return mapPlaces(await fetchFSQ(new URLSearchParams(base)));
    }

    const relevanceParams = new URLSearchParams({
      ...base,
      ll: `${lat},${lng}`,
      sort: 'RELEVANCE',
    });
    const nearbyParams = new URLSearchParams({
      ...base,
      ll: `${lat},${lng}`,
      radius: '40000',
      sort: 'DISTANCE',
    });

    const [relevant, nearby] = await Promise.all([
      fetchFSQ(relevanceParams),
      fetchFSQ(nearbyParams),
    ]);

    const seen = new Set(relevant.map((p) => p.fsq_place_id));
    const merged = [...relevant, ...nearby.filter((p) => !seen.has(p.fsq_place_id))];
    return mapPlaces(merged);
  }

  // Browse (no query) → nearest food places, expanding the radius if sparse.
  // Category-only search returns the full food/drink mix (pubs, taco stands,
  // steakhouses) instead of only places matching a filler word.
  const RADII = [5000, 15000, 40000]; // ~3mi, ~9mi, ~25mi
  const INITIAL_LIMIT = '20';  // Faster initial load; user can refine with search
  const MIN_RESULTS = 5;

  if (hasLocation) {
    for (const radius of RADII) {
      const params = new URLSearchParams({
        fsq_category_ids: FOOD_CATEGORY_ID,
        limit: INITIAL_LIMIT,
        ll: `${lat},${lng}`,
        radius: String(radius),
        sort: 'DISTANCE',
      });

      const places = await fetchFSQ(params);
      if (places.length >= MIN_RESULTS || radius === RADII[RADII.length - 1]) {
        return mapPlaces(places);
      }
    }
  }

  return [];
}
