/**
 * Drop-in replacement for expo-image's <Image> for photos stored in the
 * private memory-photos bucket. Resolves the stored URL to a signed URL
 * before rendering; non-storage URIs render directly.
 */
import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { getSignedPhotoUrl, storagePathFromUrl } from '@/lib/signedPhotos';

type Props = Omit<ImageProps, 'source'> & { uri: string };

export default function SignedImage({ uri, ...props }: Props) {
  // Non-storage URIs (local file://, external http) need no signing
  const needsSigning = storagePathFromUrl(uri) !== null;
  const [resolved, setResolved] = useState<string | null>(needsSigning ? null : uri);

  useEffect(() => {
    let live = true;
    if (storagePathFromUrl(uri) === null) {
      setResolved(uri);
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
  return <Image {...props} source={resolved ? { uri: resolved } : undefined} />;
}
