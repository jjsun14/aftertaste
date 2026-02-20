import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Decodes a base64 string to a Uint8Array without any external dependencies.
 * Works in React Native / Hermes where atob() may or may not be available.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Try using Buffer global first (available in most RN environments)
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  // Fallback: manual base64 decode (no dependencies needed)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  // Remove padding
  const b64 = base64.replace(/=/g, '');
  const len = b64.length;
  const outputLen = Math.floor((len * 3) / 4);
  const result = new Uint8Array(outputLen);

  let i = 0;
  let j = 0;
  while (i < len) {
    const e1 = lookup[b64.charCodeAt(i++)];
    const e2 = lookup[b64.charCodeAt(i++)];
    const e3 = lookup[b64.charCodeAt(i++)];
    const e4 = lookup[b64.charCodeAt(i++)];

    result[j++] = (e1 << 2) | (e2 >> 4);
    if (j < outputLen) result[j++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (j < outputLen) result[j++] = ((e3 & 3) << 6) | e4;
  }

  return result;
}

/**
 * Uploads a local photo URI to Supabase Storage bucket "memory-photos".
 * Reads the file as base64 via expo-file-system, decodes to bytes, uploads.
 * Returns the public URL.
 */
export async function uploadPhoto(localUri: string, userId: string): Promise<string> {
  if (!localUri) throw new Error('No photo URI provided');

  console.log('[uploadPhoto] Starting upload for URI:', localUri.substring(0, 80));

  // Normalize URI — on Android, content:// URIs need to be copied to a cache file first
  let fileUri = localUri;
  if (localUri.startsWith('content://')) {
    console.log('[uploadPhoto] Android content:// URI — copying to cache...');
    const destUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: localUri, to: destUri });
    fileUri = destUri;
    console.log('[uploadPhoto] Cached at:', destUri);
  }

  // Verify the file exists
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  console.log('[uploadPhoto] File info:', JSON.stringify(fileInfo));
  if (!fileInfo.exists) {
    throw new Error(`File does not exist at URI: ${fileUri}`);
  }

  // Derive extension (only allow known image types, default to jpg)
  const rawExt = fileUri.split('.').pop()?.toLowerCase().split('?')[0] ?? 'jpg';
  const ext = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(rawExt) ? rawExt : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  console.log('[uploadPhoto] ext:', ext, '| contentType:', contentType);

  // Unique storage path per user
  const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  console.log('[uploadPhoto] Storage path:', filename);

  // Read the file as a base64 string
  console.log('[uploadPhoto] Reading file as base64...');
  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (readErr: any) {
    throw new Error(`Failed to read file as base64: ${readErr.message}`);
  }

  if (!base64 || base64.length === 0) {
    throw new Error('File read returned empty base64 — the file may be missing or inaccessible');
  }
  console.log('[uploadPhoto] base64 string length:', base64.length);

  // Decode base64 → Uint8Array (no external dependencies)
  let bytes: Uint8Array;
  try {
    bytes = base64ToUint8Array(base64);
  } catch (decErr: any) {
    throw new Error(`base64 decode failed: ${decErr.message}`);
  }
  console.log('[uploadPhoto] Decoded bytes:', bytes.byteLength);

  if (bytes.byteLength === 0) {
    throw new Error('Decoded image has 0 bytes — file may be corrupt or unreadable');
  }

  // Upload raw bytes to Supabase Storage
  console.log('[uploadPhoto] Uploading to Supabase...');
  const { data, error } = await supabase.storage
    .from('memory-photos')
    .upload(filename, bytes, {
      contentType,
      upsert: false,
    });

  if (error) {
    console.error('[uploadPhoto] Supabase upload error:', error);
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  console.log('[uploadPhoto] Upload success! path:', data.path);

  // Return the public URL
  const { data: urlData } = supabase.storage
    .from('memory-photos')
    .getPublicUrl(data.path);

  console.log('[uploadPhoto] Public URL:', urlData.publicUrl);
  return urlData.publicUrl;
}
