/**
 * Restaurant search via Google Places API (New) — replaced Foursquare
 * (July 2026) after FSQ cut its free tier to 500 calls/month.
 *
 * COST MODEL (critical — field masks decide billing):
 *  - Search calls request ONLY Pro-tier fields (5,000 free/month).
 *  - priceLevel is Enterprise-tier (1,000 free/month), so it is fetched
 *    by a SEPARATE one-shot details call when the user actually selects
 *    a restaurant — never on search results.
 *  - Never add rating/hours/photos fields to the search mask; one such
 *    field bills the whole call at the higher tier.
 */
import type { SearchResult } from '@/data/mockData';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
const BASE = 'https://places.googleapis.com/v1';

// Pro-tier fields only — see cost model above.
const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.types',
  'places.primaryTypeDisplayName',
  'places.addressComponents',
].join(',');

// Types for browse mode (Nearby Search requires an explicit list).
const BROWSE_TYPES = [
  'restaurant', 'cafe', 'bar', 'bakery', 'coffee_shop',
  'meal_takeaway', 'ice_cream_shop', 'dessert_shop', 'tea_house',
];

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  addressComponents?: { types?: string[]; shortText?: string; longText?: string }[];
}

// Strip generic suffixes so "Italian Restaurant" → "Italian", etc.
const STRIP_SUFFIXES = /\s+(Restaurant|Place|Shop|Joint|Spot|House|Eatery|Establishment|Parlor|Store)$/i;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function googleFetch(path: string, body: unknown, fields: string): Promise<any> {
  const response = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': fields,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Places error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function toSearchResult(place: GooglePlace, bias: { lat: number; lng: number } | null): SearchResult {
  const comps = place.addressComponents ?? [];
  const comp = (type: string, short = true) => {
    const c = comps.find((x) => x.types?.includes(type));
    return short ? c?.shortText : c?.longText;
  };
  const city =
    comp('locality', false) ?? comp('postal_town', false) ?? comp('sublocality_level_1', false);
  const state = comp('administrative_area_level_1');

  let distance = '';
  if (bias && place.location) {
    const meters = haversineMeters(bias.lat, bias.lng, place.location.latitude, place.location.longitude);
    distance = meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1609).toFixed(1)} mi`;
  }

  const rawCategory = place.primaryTypeDisplayName?.text ?? '';

  return {
    id: place.id,
    name: place.displayName?.text ?? '',
    address: place.shortFormattedAddress ?? place.formattedAddress ?? '',
    city: city ?? undefined,
    state: state ?? undefined,
    distance,
    category: rawCategory.replace(STRIP_SUFFIXES, '').trim(),
    priceTier: undefined, // filled by fetchPriceTier() on selection
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    isVisited: false,     // applied at render time by StepSearch
    isBookmarked: false,
  };
}

/**
 * Search food places. Same contract as the old searchFoursquarePlaces:
 * query + optional location; empty query = browse nearby.
 */
export async function searchGooglePlaces(
  query: string,
  lat: number | null,
  lng: number | null,
): Promise<SearchResult[]> {
  const hasLocation = lat !== null && lng !== null;
  const hasQuery = query.trim().length > 0;
  const bias = hasLocation ? { lat: lat!, lng: lng! } : null;

  if (hasQuery) {
    const body: Record<string, unknown> = { textQuery: query.trim(), maxResultCount: 20 };
    if (hasLocation) {
      body.locationBias = {
        circle: { center: { latitude: lat, longitude: lng }, radius: 40000.0 },
      };
    }
    const json = await googleFetch('places:searchText', body, SEARCH_FIELDS);
    const places: GooglePlace[] = json.places ?? [];

    // Text Search isn't food-filtered server-side; every food place carries
    // the literal 'food' type, so partition: food matches first, everything
    // else sinks to the bottom (still visible — "Katz Jewelry" loses to
    // Katz's Deli but a mistyped food place isn't silently hidden).
    const food = places.filter((p) => p.types?.includes('food'));
    const rest = places.filter((p) => !p.types?.includes('food'));
    return [...food, ...rest].map((p) => toSearchResult(p, bias));
  }

  // Browse (no query): nearest food places, expanding radius if sparse.
  if (hasLocation) {
    const RADII = [5000, 15000, 40000];
    const MIN_RESULTS = 5;
    for (const radius of RADII) {
      const json = await googleFetch(
        'places:searchNearby',
        {
          includedTypes: BROWSE_TYPES,
          // Supermarkets/gas stations sneak in via their bakery/takeaway
          // sub-types — not what "restaurants near me" means.
          excludedTypes: ['supermarket', 'grocery_store', 'convenience_store', 'gas_station'],
          maxResultCount: 20,
          rankPreference: 'DISTANCE',
          locationRestriction: {
            circle: { center: { latitude: lat, longitude: lng }, radius },
          },
        },
        SEARCH_FIELDS,
      );
      const places: GooglePlace[] = json.places ?? [];
      if (places.length >= MIN_RESULTS || radius === RADII[RADII.length - 1]) {
        return places.map((p) => toSearchResult(p, bias));
      }
    }
  }

  return [];
}

/**
 * Fetch the price tier for ONE selected place (Enterprise-tier call —
 * only used when the user actually picks a restaurant to log).
 */
export async function fetchPriceTier(
  placeId: string,
): Promise<'$' | '$$' | '$$$' | '$$$$' | undefined> {
  try {
    const response = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': 'id,priceLevel' },
    });
    if (!response.ok) return undefined;
    const json = await response.json();
    switch (json.priceLevel) {
      case 'PRICE_LEVEL_INEXPENSIVE': return '$';
      case 'PRICE_LEVEL_MODERATE': return '$$';
      case 'PRICE_LEVEL_EXPENSIVE': return '$$$';
      case 'PRICE_LEVEL_VERY_EXPENSIVE': return '$$$$';
      default: return undefined;
    }
  } catch {
    return undefined; // price prefill is best-effort, never blocks logging
  }
}
