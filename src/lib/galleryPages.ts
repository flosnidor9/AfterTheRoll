import type { GalleryPhoto } from './data/gallery';

export type PhotoDimensions = Record<string, { width: number; height: number }>;
export type ReaderPage = { photo?: GalleryPhoto; wideHalf?: 'left' | 'right' };
export const PANORAMA_ASPECT_RATIO = 1.65;

export function makeReaderPages(photos: GalleryPhoto[], dimensions: PhotoDimensions = {}): ReaderPage[] {
  const pages: ReaderPage[] = [];
  for (const photo of photos) {
    const size = dimensions[photo.id] ?? photo;
    const wide = photo.layout ? photo.layout === 'spread'
      : !!(size.width && size.height && size.width / size.height >= PANORAMA_ASPECT_RATIO);
    if (!wide) {
      pages.push({ photo });
      continue;
    }
    // Keep the chosen photo order, leaving a blank leaf before a panorama.
    if (pages.length % 2 !== 0) pages.push({});
    pages.push({ photo, wideHalf: 'left' }, { photo, wideHalf: 'right' });
  }
  return pages;
}
