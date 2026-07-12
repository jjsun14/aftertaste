/**
 * Mapbox Search Box helpers for LOCATION lookup (cities, regions, zips) —
 * used by the search-location picker in StepSearch and the import flow's
 * batch city bias. Restaurant search itself is Google Places (lib/googlePlaces).
 */
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const SEARCH_BOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

export interface LocationSuggestion {
  mapbox_id: string;
  name: string;
  context: string; // full formatted label shown in dropdowns
}

export function makeSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function searchLocations(
  query: string,
  sessionToken: string,
  proximity?: { lat: number; lng: number } | null,
): Promise<LocationSuggestion[]> {
  if (!query.trim() || !MAPBOX_TOKEN) return [];
  const params = new URLSearchParams({
    q: query,
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
    // No 'country' (matches like "Liberia" for "Maryland" via Maryland
    // County, Liberia) and no 'street' — city/region granularity is what
    // the search bias needs.
    types: 'region,postcode,district,place,locality,neighborhood,address',
    limit: '5',
    language: 'en',
  });
  // Rank nearby matches first (e.g. your own zip above other cities')
  if (proximity) {
    params.set('proximity', `${proximity.lng},${proximity.lat}`);
  }
  try {
    const res = await fetch(`${SEARCH_BOX_BASE}/suggest?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.suggestions ?? []).map((s: any) => ({
      mapbox_id: s.mapbox_id,
      name: s.name,
      // Always lead with the place's own name — place_formatted alone is
      // just the surrounding region ("Davie" would render as only
      // "Florida, United States")
      context: s.full_address ?? [s.name, s.place_formatted].filter(Boolean).join(', '),
    }));
  } catch {
    return [];
  }
}

export async function retrieveLocation(
  mapbox_id: string,
  sessionToken: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!MAPBOX_TOKEN) return null;
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, session_token: sessionToken });
  try {
    const res = await fetch(`${SEARCH_BOX_BASE}/retrieve/${mapbox_id}?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    const feature = json.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.geometry.coordinates;
    const label =
      feature.properties.full_address ??
      feature.properties.place_formatted ??
      feature.properties.name;
    return { lat, lng, label };
  } catch {
    return null;
  }
}
