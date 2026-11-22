'use client';

import Image from '@/components/ArchiveImage';
import AlbumReader from '@/components/gallery/AlbumReader';
import GalleryManagementActions from '@/components/gallery/GalleryManagementActions';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { galleryAlbumThemeColor } from '@/lib/galleryTheme';
import type { GalleryAlbum } from '@/lib/data/gallery';

const coverOf = (album: GalleryAlbum) => album.photos.find((photo) => photo.id === album.coverPhotoId) ?? album.photos[0];

export default function GallerySection({ albums }: { albums: GalleryAlbum[] }) {
  const { isAdmin, loading } = useAuth();
  const [selected, setSelected] = useState<GalleryAlbum | null>(null);

  return (
    <section className="afterroll-desk mx-auto min-h-full max-w-[72rem] px-[1.1rem] py-[0.7rem] sm:py-[1.1rem] md:px-[2rem]">
      <header className="mb-[1.4rem] flex flex-wrap items-end justify-between gap-[0.75rem] border-b border-[var(--atr-line)] pb-[0.85rem]">
        <div>
          <p className="afterroll-meta text-[0.74rem] uppercase tracking-[0.14em] text-[var(--atr-soft)]">Photo Archive</p>
          <h1 className="afterroll-title mt-[0.18rem] text-[2.4rem] leading-none text-[var(--atr-text)]">갤러리</h1>
        </div>
        {isAdmin && !loading ? <GalleryManagementActions /> : null}
      </header>
      {albums.length ? (
        <div className="grid grid-cols-2 gap-[0.9rem] sm:grid-cols-3 lg:grid-cols-4">
          {albums.map((album) => {
            const cover = coverOf(album);
            return (
              <motion.article key={album.id} layout style={{ '--album-theme': galleryAlbumThemeColor(album.themeColor) } as React.CSSProperties} className="group relative overflow-hidden rounded-[0.55rem] border border-[var(--atr-line)] bg-white/20" whileHover={{ y: '-0.2rem' }}>
                <button type="button" className="block w-full text-left" onClick={() => setSelected(album)} aria-label={`${album.title} 앨범 열기`}>
                  <div className="album-cover relative aspect-[4/3] bg-[rgba(200,121,147,0.1)]">
                    {cover ? <Image src={cover.src} alt={`${album.title} 앨범 표지`} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 18rem" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <span className="grid h-full place-items-center afterroll-meta text-[0.72rem] text-[var(--atr-soft)]">사진 없음</span>}
                  </div>
                  <div className="p-[0.65rem]"><h2 className="afterroll-title truncate text-[1.2rem] text-[var(--atr-text)]">{album.title}</h2><p className="afterroll-meta mt-[0.2rem] text-[0.68rem] text-[var(--atr-soft)]">{album.photos.length}장의 사진</p></div>
                </button>
                {isAdmin && !loading ? <div className="absolute bottom-[0.5rem] right-[0.5rem] z-[1]"><GalleryManagementActions album={album} /></div> : null}
              </motion.article>
            );
          })}
        </div>
      ) : <p className="py-[4rem] text-center afterroll-meta text-[0.78rem] text-[var(--atr-muted)]">아직 등록된 앨범이 없습니다.</p>}
      {selected ? <AlbumReader album={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
