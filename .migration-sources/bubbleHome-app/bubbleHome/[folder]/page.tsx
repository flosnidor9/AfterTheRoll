import { notFound, redirect } from 'next/navigation';
import { getFolder, getFolders } from '@/lib/data/folders';
import { toGalleryPath } from '@/lib/galleryPath';
import { SITE_ORIGIN } from '@/lib/config/site';

type Props = {
  params: Promise<{ folder: string }>;
};

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const folders = getFolders(null);
  return folders.map((f) => ({ folder: f.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { folder: slug } = await params;
  const folder = getFolder(slug);
  if (!folder) return { metadataBase: SITE_ORIGIN, title: 'Not Found' };

  return {
    metadataBase: SITE_ORIGIN,
    title: `${folder.title} | Personal Archive`,
    description: `${folder.title} - ${folder.count} images`,
  };
}

export default async function FolderPage({ params }: Props) {
  const { folder: slug } = await params;
  const folder = getFolder(slug);

  if (!folder) {
    notFound();
  }

  redirect(`/bubbleHome/gallery/${toGalleryPath(folder.slug)}`);
}
