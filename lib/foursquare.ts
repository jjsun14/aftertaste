import type { SearchResult } from '@/data/mockData';

// Foursquare Places API (FSQ OS) — Service Key + Bearer auth
const FSQ_API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '';
const FSQ_BASE = 'https://places-api.foursquare.com';
const FSQ_API_VERSION = '2025-06-17';

// "Dining and Drinking" root category. NOTE: this API version ignores the old
// `categories=13000` integer param — it must be `fsq_category_ids` with the
// hex id, otherwise results are completely unfiltered (law firms, salons...).
const FOOD_CATEGORY_ID = '4d4b7105d754a06374d81259';

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

  // Typed query → one call, relevance-ranked, no radius cap.
  // RELEVANCE blends name-match quality with proximity (ll), so the exact
  // match 6km away beats a weak match around the corner — a radius cap
  // would silently exclude it whenever the closer ring has enough results.
  if (hasQuery) {
    const params = new URLSearchParams({
      query: query.trim(),
      fsq_category_ids: FOOD_CATEGORY_ID,
      limit: '50',
    });
    if (hasLocation) {
      params.set('ll', `${lat},${lng}`);
      params.set('sort', 'RELEVANCE');
    }
    return mapPlaces(await fetchFSQ(params));
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
