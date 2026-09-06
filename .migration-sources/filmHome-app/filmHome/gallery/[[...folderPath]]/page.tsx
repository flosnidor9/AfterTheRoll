import { notFound } from 'next/navigation';
import {
  getAllFolderSlugs,
  getFolder,
  getFolderContent,
  getFolderPosts,
  getFolders,
} from '@/lib/data/folders';
import { fromGallerySegments, toGalleryPath } from '@/lib/galleryPath';
import FilmGalleryClient from '../FilmGalleryClient';
import FolderDetailScene from '@/components/folder/FolderDetailScene';
import { SITE_ORIGIN } from '@/lib/config/site';

type Props = {
  params: Promise<{ folderPath?: string[] }>;
};

function toParentHref(slug: string): string {
  const segments = slug.split('/').filter(Boolean);
  if (segments.length <= 1) return '/filmHome/gallery';
  return `/filmHome/gallery/${toGalleryPath(segments.slice(0, -1).join('/'))}`;
}

function toParentSlug(slug: string): string | null {
  const segments = slug.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  return segments.slice(0, -1).join('/');
}

export async function generateStaticParams() {
  const params = getAllFolderSlugs('film').map((slug) => ({
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
    };
  }

  const slug = fromGallerySegments(folderPath);
  if (!slug) return { metadataBase: SITE_ORIGIN, title: 'Not Found' };

  const folder = getFolder(slug, 'film');
  if (!folder) return { metadataBase: SITE_ORIGIN, title: 'Not Found' };

  return {
    metadataBase: SITE_ORIGIN,
    title: `${folder.title} | Film Archive`,
    description: folder.isLeaf
      ? `${folder.title} - ${folder.count} images`
      : `${folder.title} - ${folder.childCount} folders`,
  };
}

export default async function FilmGalleryRoutePage({ params }: Props) {
  const { folderPath = [] } = await params;

  if (folderPath.length === 0) {
    const folders = getFolders(null, 'film');
    return (
      <main className="relative min-h-screen pt-[3.5rem]">
        <FilmGalleryClient folders={folders} title="Gallery" />
      </main>
    );
  }

  const slug = fromGallerySegments(folderPath);
  if (!slug) {
    notFound();
  }

  const folder = getFolder(slug, 'film');
  if (!folder) {
    notFound();
  }

  const backHref = toParentHref(slug);
  const parentSlug = toParentSlug(slug);
  const parentFolder = parentSlug ? getFolder(parentSlug, 'film') : null;
  const backLabel = parentFolder ? `Back to ${parentFolder.title}` : 'Back';

  if (!folder.isLeaf) {
    const children = getFolders(slug, 'film');
    return (
      <main className="relative min-h-screen pt-[3.5rem]">
        <FilmGalleryClient
          folders={children}
          title={folder.title}
          description={`${folder.childCount} sub-folders`}
          backHref={backHref}
          backLabel={backLabel}
        />
      </main>
    );
  }

  const posts = getFolderPosts(slug, 'film');
  const content = getFolderContent(slug, 'film');

  return (
    <main>
      <FolderDetailScene
        folder={folder}
        posts={posts}
        content={content}
        backHref={backHref}
        backLabel={backLabel}
        theme="film"
      />
    </main>
  );
}
