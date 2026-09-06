import CharactersSection, { type SessionLogLink } from '@/components/characters/CharactersSection';
import { getCharacters } from '@/lib/data/characters';
import { getAllTrpgPosts } from '@/lib/data/trpg';
import { toGalleryPath } from '@/lib/galleryPath';

export const dynamic = 'force-static';

export default function CharactersPage() {
  const sessionLogLinks: SessionLogLink[] = getAllTrpgPosts().map((post) => ({
    playId: post.playId,
    sessionTitle: post.title,
    date: post.date,
    href: `/archive/read/${toGalleryPath(post.fullSlug)}`,
  }));

  return <CharactersSection characters={getCharacters()} sessionLogLinks={sessionLogLinks} />;
}
