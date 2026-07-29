/**
 * Drop-in replacement for expo-image's <Image> for photos stored in the
 * private memory-photos bucket. Resolves the stored URL to a signed URL
 * before rendering; non-storage URIs render directly.
 *
 * Speed matters here:
 * - `cacheKey` is the photo's storage path, which never changes — so the
 *   on-disk image cache survives across sessions even though every
 *   signed URL carries a fresh token. Each photo downloads ONCE per
 *   device, ever.
 * - The signed-URL cache is consulted synchronously first (it's warmed
 *   in one batched call when memories load), so in the common case the
 *   image renders on the first frame with no per-card round trip.
 */
import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { getSignedPhotoUrl, peekSignedPhotoUrl, storagePathFromUrl } from '@/lib/signedPhotos';

type Props = Omit<ImageProps, 'source'> & { uri: string };

export default function SignedImage({ uri, ...props }: Props) {
  const path = storagePathFromUrl(uri);
  const [resolved, setResolved] = useState<string | null>(() => peekSignedPhotoUrl(uri));

  useEffect(() => {
    let live = true;
    const immediate = peekSignedPhotoUrl(uri);
    if (immediate !== null) {
      setResolved(immediate);
      return;
    }
    setResolved(null);
    getSignedPhotoUrl(uri).then((url) => {
      if (live) setResolved(url);
    });
    return () => {
      live = false;
    };
  }, [uri]);

  // Render the frame immediately (styles apply); the image fades in when
  // the signed URL is ready.
  return (
    <Image
      cachePolicy="memory-disk"
      {...props}
      source={resolved ? { uri: resolved, cacheKey: path ?? undefined } : undefined}
    />
  );
}
