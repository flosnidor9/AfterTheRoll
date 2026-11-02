import type { GalleryPhoto } from './data/gallery';

export type PhotoPlacement = 'before' | 'after';

/** Move one photo anywhere in the album without changing any photo metadata. */
export function reorderGalleryPhotos(photos: GalleryPhoto[], id: string, targetId: string, placement: PhotoPlacement) {
  if (id === targetId || !photos.some((photo) => photo.id === id) || !photos.some((photo) => photo.id === targetId)) return photos;
  const moving = photos.find((photo) => photo.id === id)!;
  const remaining = photos.filter((photo) => photo.id !== id);
  const destination = remaining.findIndex((photo) => photo.id === targetId) + (placement === 'after' ? 1 : 0);
  remaining.splice(destination, 0, moving);
  return remaining.every((photo, index) => photo === photos[index]) ? photos : remaining;
}
