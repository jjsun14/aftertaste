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
