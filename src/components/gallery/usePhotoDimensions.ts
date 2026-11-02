'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GalleryPhoto } from '@/lib/data/gallery';
import type { PhotoDimensions } from '@/lib/galleryPages';

export function usePhotoDimensions(photos: GalleryPhoto[]) {
  const [loaded, setLoaded] = useState<PhotoDimensions>({});
  useEffect(() => {
    let cancelled = false;
    photos.forEach((photo) => {
      if ((photo.width && photo.height) || loaded[photo.id]) return;
      const image = new globalThis.Image();
      image.onload = () => {
        if (!cancelled && image.naturalWidth && image.naturalHeight) {
          setLoaded((current) => ({ ...current, [photo.id]: { width: image.naturalWidth, height: image.naturalHeight } }));
        }
      };
      image.src = photo.src;
    });
    return () => { cancelled = true; };
  }, [photos, loaded]);

  return useMemo(() => Object.fromEntries(photos.flatMap((photo) => {
    const size = photo.width && photo.height ? { width: photo.width, height: photo.height } : loaded[photo.id];
    return size ? [[photo.id, size]] : [];
  })) as PhotoDimensions, [photos, loaded]);
}
