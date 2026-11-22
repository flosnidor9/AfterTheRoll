import fs from 'fs';
import path from 'path';
import bundledGalleryArchive from '@/content/gallery.json';
export { DEFAULT_GALLERY_ALBUM_THEME_COLOR, galleryAlbumThemeColor } from '@/lib/galleryTheme';
import { TRPG_ASSET_PREFIX, TRPG_PUBLIC_ROOT } from '@/lib/trpgSource';

export type GalleryCopyright = { name: string; url?: string };
export type GalleryPhoto = {
  id: string;
  src: string;
  alt: string;
  copyright: GalleryCopyright;
  createdAt: string;
  /** Stored at upload time so page layout never depends on image-load timing. */
  width?: number;
  height?: number;
  /** A spread is an intentional two-page panorama, not merely a wide photo. */
  layout?: 'single' | 'spread';
};
export type GalleryAlbum = {
  id: string;
  title: string;
  description?: string;
  themeColor?: string;
  coverPhotoId?: string;
  photos: GalleryPhoto[];
  createdAt: string;
  updatedAt: string;
};

type GalleryArchive = { albums?: GalleryAlbum[] };
const ARCHIVE_PATH = path.join(TRPG_PUBLIC_ROOT, 'gallery', 'gallery.json');
const IMAGE_PREFIX = '/images/gallery/';

function assetUrl(value: string) {
  return value.startsWith(IMAGE_PREFIX)
    ? `${TRPG_ASSET_PREFIX}/gallery/${value.slice(IMAGE_PREFIX.length)}`
    : value;
}

export function getGalleryAlbums(): GalleryAlbum[] {
  try {
    const archive: GalleryArchive = process.env.NODE_ENV === 'development'
      ? JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'))
      : bundledGalleryArchive;
    if (!Array.isArray(archive.albums)) return [];
    return archive.albums.map((album) => ({
      ...album,
      photos: Array.isArray(album.photos) ? album.photos.map((photo) => ({ ...photo, src: assetUrl(photo.src) })) : [],
    }));
  } catch { return []; }
}
