import GallerySection from '@/components/gallery/GallerySection';
import { getGalleryAlbums } from '@/lib/data/gallery';

export const dynamic = 'force-static';

export default function GalleryPage() { return <GallerySection albums={getGalleryAlbums()} />; }
