import type { SearchResult } from '@/data/mockData';

// Legacy Foursquare v2 API — uses OAuth Client ID + Secret (no bearer token needed)
const FSQ_CLIENT_ID = process.env.EXPO_PUBLIC_FOURSQUARE_CLIENT_ID ?? '';
const FSQ_CLIENT_SECRET = process.env.EXPO_PUBLIC_FOURSQUARE_CLIENT_SECRET ?? '';
const FSQ_BASE = 'https://api.foursquare.com/v2';
const FSQ_VERSION = '20231010'; // API version date

interface FoursquareVenue {
  id: string;
  name: string;
  location: {
    address?: string;
    city?: string;
    state?: string;
    formattedAddress?: string[];
    lat: number;
    lng: number;
    distance?: number; // meters, only present when ll param used
  };
  categories: { name: string }[];
}

/**
 * Search Foursquare Places (Legacy v2 API) for restaurants/food venues.
 *
 * @param query          - free-text search (e.g. "pizza", "ramen")
 * @param lat            - optional user latitude for nearby ranking
 * @param lng            - optional user longitude
 * @param visitedNames   - Set of restaurant names already in the user's memories
 * @param bookmarkedNames - Set of restaurant names in the user's want-to-try list
 */
export async function searchFoursquarePlaces(
  query: string,
  lat: number | null,
  lng: number | null,
  visitedNames: Set<string>,
  bookmarkedNames: Set<string>,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    client_id: FSQ_CLIENT_ID,
    client_secret: FSQ_CLIENT_SECRET,
    v: FSQ_VERSION,
    query,
    categoryId: '4d4b7105d754a06374d81259', // "Food" top-level category
    limit: '50',
    intent: 'browse',
  });

  // Use lat/lng if available for proximity sorting, otherwise Foursquare uses IP geolocation
  if (lat !== null && lng !== null) {
    params.set('ll', `${lat},${lng}`);
    params.set('radius', '32000'); // ~20 miles
  }

  const response = await fetch(`${FSQ_BASE}/venues/search?${params.toString()}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Foursquare API error ${response.status}: ${text}`);
  }

  const json = await response.json();

  if (json.meta?.code !== 200) {
    throw new Error(`Foursquare error: ${json.meta?.errorDetail ?? 'Unknown error'}`);
  }

  const venues: FoursquareVenue[] = json.response?.venues ?? [];

  // Sort by raw distance ascending (closest first) when location is available
  if (lat !== null && lng !== null) {
    venues.sort((a, b) => (a.location.distance ?? 0) - (b.location.distance ?? 0));
  }

  return venues.map((venue): SearchResult => {
    const address = venue.location.formattedAddress?.slice(0, 2).join(', ')
      ?? venue.location.address
      ?? '';

    // Format distance when available (returned in meters when ll param used)
    let distanceStr = '';
    if (venue.location.distance !== undefined) {
      distanceStr = venue.location.distance < 1000
        ? `${venue.location.distance} m`
        : `${(venue.location.distance / 1609).toFixed(1)} mi`;
    }

    return {
      id: venue.id,
      name: venue.name,
      address,
      distance: distanceStr,
      latitude: venue.location.lat,
      longitude: venue.location.lng,
      isVisited: visitedNames.has(venue.name),
      isBookmarked: bookmarkedNames.has(venue.name),
    };
  });
}
