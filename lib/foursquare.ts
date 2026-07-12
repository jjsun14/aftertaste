import type { SearchResult } from '@/data/mockData';

// Foursquare Places API (FSQ OS) — Service Key + Bearer auth
const FSQ_API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '';
const FSQ_BASE = 'https://places-api.foursquare.com';
const FSQ_API_VERSION = '2025-06-17';

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
 * @param query          - free-text search (e.g. "pizza", "ramen")
 * @param lat            - optional user latitude for nearby ranking
 * @param lng            - optional user longitude
 * @param visitedNames   - Set of restaurant names already in the user's memories
 * @param bookmarkedNames - Set of restaurant names in the user's want-to-try list
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

function mapPlaces(
  places: FSQPlace[],
  visitedNames: Set<string>,
  bookmarkedNames: Set<string>,
): SearchResult[] {
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
      isVisited: visitedNames.has(place.name),
      isBookmarked: bookmarkedNames.has(place.name),
    };
  });
}

export async function searchFoursquarePlaces(
  query: string,
  lat: number | null,
  lng: number | null,
  visitedNames: Set<string>,
  bookmarkedNames: Set<string>,
): Promise<SearchResult[]> {
  const hasLocation = lat !== null && lng !== null;
  const hasQuery = query.trim().length > 0;

  // Strategy: start with a tight radius for nearby results, expand if too few
  const RADII = [5000, 15000, 40000]; // ~3mi, ~9mi, ~25mi
  const INITIAL_LIMIT = '20';  // Faster initial load; user can refine with search
  const MIN_RESULTS = 5;

  if (hasLocation) {
    for (const radius of RADII) {
      // Use lower limit for generic browse, full limit when user typed a query
      const limit = hasQuery ? '50' : INITIAL_LIMIT;
      const params = new URLSearchParams({
        query: query || 'restaurant',
        categories: '13000',
        limit,
        ll: `${lat},${lng}`,
        radius: String(radius),
        sort: 'DISTANCE',
      });

      const places = await fetchFSQ(params);
      if (places.length >= MIN_RESULTS || radius === RADII[RADII.length - 1]) {
        return mapPlaces(places, visitedNames, bookmarkedNames);
      }
    }
  }

  // No location or location search returned nothing — do a text-only search
  // This is important for international searches where GPS might be off
  if (hasQuery) {
    const params = new URLSearchParams({
      query,
      categories: '13000',
      limit: '50',
    });
    if (hasLocation) {
      // Still pass location for distance sorting but no radius restriction
      params.set('ll', `${lat},${lng}`);
      params.set('sort', 'DISTANCE');
    }
    const places = await fetchFSQ(params);
    return mapPlaces(places, visitedNames, bookmarkedNames);
  }

  return [];
}
