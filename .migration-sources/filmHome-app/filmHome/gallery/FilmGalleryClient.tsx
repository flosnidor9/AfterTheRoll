'use client';

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from '@/components/ArchiveImage';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { FolderData, ImageOrientation } from '@/lib/data/folders';
import { toGalleryPath } from '@/lib/galleryPath';

function getSpan(orientation: ImageOrientation): 1 | 2 {
  return orientation === 'landscape' ? 2 : 1;
}

const HEIGHT_CONSTRAINTS: Record<ImageOrientation, { min: string; max: string }> = {
  landscape: { min: '12rem', max: '30rem' },
  portrait: { min: '18rem', max: '42rem' },
  square: { min: '14rem', max: '32rem' },
};

const FLOAT_DELAY = [0, 1.1, 0.5, 1.8, 0.3, 1.4];

type Props = {
  folders: FolderData[];
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  folderBaseHref?: string;
};

export default function FilmGalleryClient({
  folders,
  title,
  description,
  backHref,
  backLabel = 'Back',
  folderBaseHref = '/filmHome/gallery',
}: Props) {
  const cols = folders.length === 1 ? 1 : 2;

  return (
    <div className="min-h-screen px-[2rem] py-[5rem] md:py-[6rem]">
      <div className="mx-auto max-w-[64rem]">
        <header className="mb-[2rem] md:mb-[2.5rem]">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-[1rem] inline-flex items-center gap-[0.4rem] rounded-full border border-white/30 bg-white/5 px-[0.75rem] py-[0.45rem] text-[0.82rem] text-white/80 transition-colors hover:bg-white/10"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>{backLabel}</span>
            </Link>
          ) : null}
          <h1 className="font-serif text-[2rem] leading-tight text-white/95 md:text-[2.5rem]">{title}</h1>
          {description ? (
            <p className="mt-[0.5rem] font-sans text-[0.9rem] text-white/70 md:text-[1rem]">{description}</p>
          ) : null}
        </header>

        {folders.length === 0 ? (
          <div className="film-card rounded-[1.25rem] p-[3rem] text-center font-serif text-white/60">
            No folders found.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: '1.75rem',
            }}
          >
            {folders.map((folder, i) => {
              const span = getSpan(folder.orientation);
              const constraints = HEIGHT_CONSTRAINTS[folder.orientation];

              return (
                <motion.div
                  key={folder.slug}
                  style={{ gridColumn: `span ${span}` }}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                      duration: 5 + i * 0.4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: FLOAT_DELAY[i % FLOAT_DELAY.length],
                    }}
                  >
                    <FilmCard
                      folder={folder}
                      aspectRatio={folder.aspectRatio}
                      minHeight={constraints.min}
                      maxHeight={constraints.max}
                      folderBaseHref={folderBaseHref}
                    />
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type FilmCardProps = {
  folder: FolderData;
  aspectRatio: number;
  minHeight: string;
  maxHeight: string;
  folderBaseHref: string;
};

function FilmCard({ folder, aspectRatio, minHeight, maxHeight, folderBaseHref }: FilmCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const normX = useMotionValue(0);
  const normY = useMotionValue(0);
  const rotateY = useSpring(useTransform(normX, [-0.5, 0.5], [-5, 5]), {
    stiffness: 140,
    damping: 24,
  });
  const rotateX = useSpring(useTransform(normY, [-0.5, 0.5], [4, -4]), {
    stiffness: 140,
    damping: 24,
  });

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      normX.set((e.clientX - rect.left) / rect.width - 0.5);
      normY.set((e.clientY - rect.top) / rect.height - 0.5);
    },
    [normX, normY],
  );

  const onMouseLeave = useCallback(() => {
    normX.set(0);
    normY.set(0);
  }, [normX, normY]);

  const href = `${folderBaseHref}/${toGalleryPath(folder.slug)}`;
  const metaLabel = folder.isLeaf ? `${folder.count} items` : `${folder.childCount} folders`;

  return (
    <div style={{ perspective: '900px' }}>
      <Link href={href} className="block">
        <motion.div
          ref={cardRef}
          className="film-card relative overflow-hidden rounded-[0.5rem]"
          style={{
            aspectRatio: String(aspectRatio),
            minHeight,
            maxHeight,
            rotateX,
            rotateY,
          }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
        >
          {folder.thumbnail ? (
            <Image
              src={folder.thumbnail}
              alt={folder.title}
              fill
              className="film-card-img object-contain sepia-[0.15] contrast-[1.05]"
            />
          ) : (
            <div className="absolute inset-0 bg-amber-950/20" />
          )}

          <div className="film-blur-veil absolute inset-0 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-amber-950/70 via-amber-950/15 to-transparent" />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(145deg, rgba(255,248,230,0.08) 0%, rgba(255,248,230,0.02) 40%, transparent 60%)',
            }}
          />

          <div className="film-scratch absolute inset-0 pointer-events-none" />
          <div className="film-glow-ring absolute inset-0 rounded-[0.5rem] pointer-events-none" />

          <div className="absolute bottom-0 left-0 right-0 p-[1.5rem]">
            <h2 className="mb-[0.4rem] font-serif text-[1.4rem] leading-snug text-amber-50">{folder.title}</h2>
            <div className="flex flex-wrap gap-[0.35rem]">
              {folder.tags.map((tag) => (
                <span key={tag} className="film-tag">
                  {tag}
                </span>
              ))}
              <span className="film-tag opacity-50">{metaLabel}</span>
            </div>
          </div>
        </motion.div>
      </Link>
    </div>
  );
}
