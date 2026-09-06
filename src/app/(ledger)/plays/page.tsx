import PlaysSection from '@/components/plays/PlaysSection';
import { getAllTrpgPosts } from '@/lib/data/trpg';
import { getCharacters } from '@/lib/data/characters';
import { toGalleryPath } from '@/lib/galleryPath';

export const dynamic = 'force-static';

export default function PlaysPage() {
  const logLinks = getAllTrpgPosts().map((post) => ({
    playId: post.playId,
    href: `/archive/read/${toGalleryPath(post.fullSlug)}`,
  }));

  return (
    <main className="afterroll-desk min-h-screen px-[1.1rem] pb-[4rem] pt-[5.4rem] md:px-[2rem]">
      <div className="mx-auto max-w-[52rem]">
        <header className="mb-[1.5rem] border-b border-[var(--atr-line)] pb-[0.85rem]">
          <p className="afterroll-meta text-[0.74rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">Play List</p>
          <h1 className="afterroll-title mt-[0.18rem] text-[2.4rem] leading-none text-[var(--ledger-ink)]">
            플레이 목록
          </h1>
        </header>
        <PlaysSection logLinks={logLinks} characters={getCharacters()} />
      </div>
    </main>
  );
}
