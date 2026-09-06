import { notFound } from 'next/navigation';
import {
  getAllFolderSlugs,
  getFolder,
  getFolderContent,
  getFolderPosts,
  getFolders,
} from '@/lib/data/folders';
import { fromGallerySegments, toGalleryPath } from '@/lib/galleryPath';
import GalleryClient from '../GalleryClient';
import FolderDetailScene from '@/components/folder/FolderDetailScene';
import { SITE_ORIGIN } from '@/lib/config/site';

type Props = {
  params: Promise<{ folderPath?: string[] }>;
};

function toParentHref(slug: string): string {
  const segments = slug.split('/').filter(Boolean);
  if (segments.length <= 1) return '/bubbleHome/gallery';
  return `/bubbleHome/gallery/${toGalleryPath(segments.slice(0, -1).join('/'))}`;
}

function toParentSlug(slug: string): string | null {
  const segments = slug.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  return segments.slice(0, -1).join('/');
}

export async function generateStaticParams() {
  const params = getAllFolderSlugs('bubble').map((slug) => ({
    folderPath: slug.split('/'),
  }));

  return [{ folderPath: [] }, ...params];
}

export async function generateMetadata({ params }: Props) {
  const { folderPath = [] } = await params;
  if (folderPath.length === 0) {
    return {
      metadataBase: SITE_ORIGIN,
      title: 'Gallery | Personal Archive',
      description: 'Top-level categories',
    };
  }

  const slug = fromGallerySegments(folderPath);
  if (!slug) return { metadataBase: SITE_ORIGIN, title: 'Not Found' };

  const folder = getFolder(slug, 'bubble');
  if (!folder) return { metadataBase: SITE_ORIGIN, title: 'Not Found' };

  return {
    metadataBase: SITE_ORIGIN,
    title: `${folder.title} | Personal Archive`,
    description: folder.isLeaf
      ? `${folder.title} - ${folder.count} images`
      : `${folder.title} - ${folder.childCount} folders`,
  };
}

export default async function GalleryRoutePage({ params }: Props) {
  const { folderPath = [] } = await params;

  if (folderPath.length === 0) {
    const folders = getFolders(null, 'bubble');
    return (
      <main className="relative min-h-screen pt-[3.5rem]">
        <GalleryClient folders={folders} title="Gallery" description="Top-level categories" />
      </main>
    );
  }

  const slug = fromGallerySegments(folderPath);
  if (!slug) {
    notFound();
  }

  const folder = getFolder(slug, 'bubble');
  if (!folder) {
    notFound();
  }

  const backHref = toParentHref(slug);
  const parentSlug = toParentSlug(slug);
  const parentFolder = parentSlug ? getFolder(parentSlug, 'bubble') : null;
  const backLabel = parentFolder ? `Back to ${parentFolder.title}` : 'Back';

  if (!folder.isLeaf) {
    const children = getFolders(slug, 'bubble');
    return (
      <main className="relative min-h-screen pt-[3.5rem]">
        <GalleryClient
          folders={children}
          title={folder.title}
          description={`${folder.childCount} sub-folders`}
          backHref={backHref}
          backLabel={backLabel}
        />
      </main>
    );
  }

  const posts = getFolderPosts(slug, 'bubble');
  const content = getFolderContent(slug, 'bubble');

  return (
    <main>
      <FolderDetailScene folder={folder} posts={posts} content={content} backHref={backHref} backLabel={backLabel} />
    </main>
  );
}
