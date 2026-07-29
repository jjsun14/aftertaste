/**
 * Signed photo URLs — the memory-photos bucket is PRIVATE (July 2026).
 * Stored photo values are the legacy public-style URLs; at render time we
 * convert them to short-lived signed URLs that only the photo's owner can
 * mint (owner-scoped storage RLS). External URLs (seed data, avatars) and
 * local file:// URIs pass through untouched.
 */
import { supabase } from '@/lib/supabase';

const BUCKET = 'memory-photos';
const TTL_SECONDS = 60 * 60; // 1 hour
const cache = new Map<string, { url: string; expiresAt: number }>();

/** Extract the storage path from a stored value, or null if not ours. */
export function storagePathFromUrl(value: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx !== -1) return value.slice(idx + marker.length).split('?')[0];
  return null;
}

/** Synchronous cache lookup — null when a mint is needed. */
export function peekSignedPhotoUrl(stored: string): string | null {
  const path = storagePathFromUrl(stored);
  if (!path) return stored;
  const hit = cache.get(path);
  return hit && hit.expiresAt > Date.now() + 60_000 ? hit.url : null;
}

/**
 * Mint signed URLs for many photos in ONE api call and warm the cache —
 * called right after memories load, so cards resolve synchronously
 * instead of each paying its own round trip.
 */
export async function prefetchSignedPhotoUrls(storedValues: string[]): Promise<void> {
  const paths = [
    ...new Set(
      storedValues
        .map(storagePathFromUrl)
        .filter((p): p is string => !!p),
    ),
  ];
  const missing = paths.filter((p) => {
    const hit = cache.get(p);
    return !hit || hit.expiresAt <= Date.now() + 60_000;
  });
  if (missing.length === 0) return;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(missing, TTL_SECONDS);
    if (error || !data) return;
    for (const item of data) {
      if (item.signedUrl && item.path) {
        cache.set(item.path, {
          url: item.signedUrl,
          expiresAt: Date.now() + TTL_SECONDS * 1000,
        });
      }
    }
  } catch {
    // cards fall back to per-photo minting
  }
}

/**
 * Resolve a stored photo value to a renderable URL. Cached per path for
 * the signed URL's lifetime; falls back to the stored value on failure
 * (worst case: the old broken URL, never a crash).
 */
export async function getSignedPhotoUrl(stored: string): Promise<string> {
  const path = storagePathFromUrl(stored);
  if (!path) return stored; // external image or local file URI

  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.url;

  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
    if (error || !data?.signedUrl) return stored;
    cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    return data.signedUrl;
  } catch {
    return stored;
  }
}
