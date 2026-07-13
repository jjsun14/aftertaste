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

    // Mid-word prefixes ("Quart" → Quarterdeck) don't match in Text
    // Search — rescue them via the prefix-native Autocomplete endpoint.
    if (food.length === 0 && query.trim().length >= 3) {
      const predictions = await autocompleteFood(query, lat, lng);
      if (predictions.length > 0) {
        const seen = new Set(predictions.map((p) => p.id));
        return [...predictions, ...rest.map((p) => toSearchResult(p, bias)).filter((r) => !seen.has(r.id))];
      }
    }

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

// Food-ish types as they appear on autocomplete predictions.
const FOOD_TYPE_HINTS = new Set([
  'food', 'restaurant', 'bar', 'cafe', 'bakery', 'coffee_shop',
  'meal_takeaway', 'meal_delivery', 'bar_and_grill', 'sports_bar',
  'ice_cream_shop', 'dessert_shop', 'tea_house', 'cafeteria', 'diner',
]);

/**
 * Prefix fallback: Text Search treats "Quart" as the word *quart*, not a
 * prefix of "Quarterdeck" — it is not an autocomplete. When a typed query
 * yields no food results, this asks the actual Autocomplete endpoint,
 * which is prefix-native. Predictions carry no coordinates; callers must
 * ensureResolved() before anything needs lat/lng (selection, bookmark).
 * Billing: Autocomplete is its own Essentials-tier SKU (10K free/month).
 */
async function autocompleteFood(
  query: string,
  lat: number | null,
  lng: number | null,
): Promise<SearchResult[]> {
  const body: Record<string, unknown> = { input: query };
  if (lat !== null && lng !== null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 40000.0 } };
    body.origin = { latitude: lat, longitude: lng }; // enables distanceMeters
  }
  const response = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) return [];
  const json = await response.json();
  const predictions: any[] = (json.suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean);

  return predictions
    .filter((p) => (p.types ?? []).some((t: string) => FOOD_TYPE_HINTS.has(t)))
    // Autocomplete's own order isn't proximity-aware — nearest first
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
    .map((p): SearchResult => {
      const meters: number | undefined = p.distanceMeters;
      return {
        id: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        address: p.structuredFormat?.secondaryText?.text ?? '',
        distance:
          meters === undefined ? '' : meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1609).toFixed(1)} mi`,
        category: '',
        priceTier: undefined,
        latitude: undefined,  // resolved on selection via ensureResolved()
        longitude: undefined,
        isVisited: false,
        isBookmarked: false,
      };
    });
}

/**
 * Fill in coordinates/address/category/price for a result that came from
 * the autocomplete fallback (no-op when coordinates already exist). One
 * details call covers everything, including priceLevel.
 */
export async function ensureResolved(result: SearchResult): Promise<SearchResult> {
  if (result.latitude !== undefined && result.longitude !== undefined) return result;
  const fields = 'id,location,formattedAddress,shortFormattedAddress,addressComponents,primaryTypeDisplayName,priceLevel';
  const response = await fetch(`${BASE}/places/${encodeURIComponent(result.id)}`, {
    headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': fields },
  });
  if (!response.ok) throw new Error('Could not load place details');
  const place: GooglePlace & { priceLevel?: string } = await response.json();
  const mapped = toSearchResult(place, null);
  return {
    ...result,
    address: mapped.address || result.address,
    city: mapped.city,
    state: mapped.state,
    category: mapped.category || result.category,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
    priceTier: priceLevelToTier(place.priceLevel) ?? result.priceTier,
  };
}

function priceLevelToTier(level?: string): '$' | '$$' | '$$$' | '$$$$' | undefined {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE': return '$';
    case 'PRICE_LEVEL_MODERATE': return '$$';
    case 'PRICE_LEVEL_EXPENSIVE': return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return '$$$$';
    default: return undefined;
  }
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
    return priceLevelToTier(json.priceLevel);
  } catch {
    return undefined; // price prefill is best-effort, never blocks logging
  }
}
