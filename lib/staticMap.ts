/**
 * Mapbox Static Images URL for a memory's location — the card image
 * fallback when a memory has no photo (imports usually don't). Same
 * dark style as the map tab, teal pin at the restaurant.
 *
 * Build these at RENDER TIME only — the URL embeds the access token,
 * so it must never be stored in the database. expo-image caches by URL,
 * so a deterministic URL means each location is fetched once per device.
 */
import { Colors } from '@/theme/colors';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const PIN_COLOR = Colors.primary.replace('#', '');

export function staticMapUrl(
  lat: number,
  lng: number,
  opts: { width?: number; height?: number; zoom?: number } = {},
): string {
  // Defaults match the library card's aspect ratio (1 : 1.15).
  // Static Images caps dimensions at 1280 (pre-@2x max 640).
  const width = Math.min(opts.width ?? 340, 640);
  const height = Math.min(opts.height ?? 391, 640);
  const zoom = opts.zoom ?? 14.2; // neighborhood level — reads as a place
  const pin = `pin-s+${PIN_COLOR}(${lng},${lat})`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/` +
    `${pin}/${lng},${lat},${zoom}/${width}x${height}@2x?access_token=${TOKEN}`
  );
}
