'use client';

import Image from '@/components/ArchiveImage';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { GalleryAlbum, GalleryPhoto } from '@/lib/data/gallery';
import { makeReaderPages, type PhotoDimensions, type ReaderPage } from '@/lib/galleryPages';
import { INITIAL_READER_NAVIGATION, readerNavigationReducer } from '@/lib/galleryReaderNavigation';
import { usePhotoDimensions } from './usePhotoDimensions';

type Props = { album: GalleryAlbum; onClose: () => void };
const PAGE_TURN_DURATION = 0.96;
const PAGE_TURN_EASING = [0.16, 0.72, 0.22, 1] as const;

function PhotoPage({ album, dimensions, page, side }: { album: GalleryAlbum; dimensions: PhotoDimensions; page?: ReaderPage; side: 'left' | 'right' }) {
  const photo = page?.photo;
  const wideHalf = page?.wideHalf;
  const size = photo ? dimensions[photo.id] : undefined;
  const photoWidth = size?.width ?? 1600;
  const photoHeight = size?.height ?? 1200;
  const photoAreaRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const area = photoAreaRef.current;
    if (!area) return;

    const fitFrame = () => {
      const { width, height } = area.getBoundingClientRect();
      if (!width || !height) return;
      const framePhotoWidth = wideHalf ? photoWidth / 2 : photoWidth;
      const scale = Math.min(width / framePhotoWidth, height / photoHeight);
      setFrameSize({ width: (framePhotoWidth * scale / width) * 100, height: (photoHeight * scale / height) * 100 });
    };

    fitFrame();
    const observer = new ResizeObserver(fitFrame);
    observer.observe(area);
    return () => observer.disconnect();
  }, [photoHeight, photoWidth, wideHalf]);

  return (
    <div className={`album-reader-page album-reader-page-${side}${wideHalf ? ' album-reader-page-wide' : ''}`}>
      {photo ? <>
        <div ref={photoAreaRef} className={`album-reader-photo${wideHalf ? ` album-reader-photo-wide album-reader-photo-wide-${wideHalf}` : ''}`}>
          {wideHalf ? (
            <div className={`album-reader-photo-frame album-reader-photo-wide-frame album-reader-photo-wide-frame-${wideHalf}`} style={frameSize ? { width: `${frameSize.width}%`, height: `${frameSize.height}%` } : undefined}>
              <Image src={photo.src} alt={photo.alt || `${album.title} 사진`} fill sizes="(max-width: 640px) 44vw, 34rem" className="object-contain" />
            </div>
          ) : (
            <div className="album-reader-photo-frame" style={frameSize ? { width: `${frameSize.width}%`, height: `${frameSize.height}%` } : undefined}>
              <Image src={photo.src} alt={photo.alt || `${album.title} 사진`} fill sizes="(max-width: 640px) 44vw, 34rem" className="object-contain" />
            </div>
          )}
        </div>
        <p className="album-reader-credit">
          {photo.copyright.url ? <a href={photo.copyright.url} target="_blank" rel="noreferrer">© {photo.copyright.name}</a> : `© ${photo.copyright.name}`}
        </p>
      </> : <span className="album-reader-empty">The end</span>}
    </div>
  );
}

function Panorama({ album, dimensions, photo }: { album: GalleryAlbum; dimensions: PhotoDimensions; photo: GalleryPhoto }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const size = dimensions[photo.id];
  const photoWidth = size?.width ?? 1600;
  const photoHeight = size?.height ?? 900;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fitFrame = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(width / photoWidth, height / photoHeight);
      setFrameSize({ width: (photoWidth * scale / width) * 100, height: (photoHeight * scale / height) * 100 });
    };
    fitFrame();
    const observer = new ResizeObserver(fitFrame);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [photoHeight, photoWidth]);

  return (
    <div ref={stageRef} className="album-reader-panorama">
      <div className="album-reader-photo-frame" style={frameSize ? { width: `${frameSize.width}%`, height: `${frameSize.height}%` } : undefined}>
        <Image src={photo.src} alt={photo.alt || `${album.title} 사진`} fill sizes="(max-width: 640px) 88vw, 68rem" className="object-contain" />
      </div>
    </div>
  );
}

export default function AlbumReader({ album, onClose }: Props) {
  const [{ page, fromPage, direction, turnId, turning, targetSpreadRevealed }, dispatch] = useReducer(readerNavigationReducer, INITIAL_READER_NAVIGATION);
  const dimensions = usePhotoDimensions(album.photos);
  const readerPages = useMemo(() => makeReaderPages(album.photos, dimensions), [album.photos, dimensions]);
  const maxPage = Math.max(0, Math.ceil(readerPages.length / 2) - 1);
  const currentPage = Math.min(page, maxPage);
  const sourcePage = Math.min(fromPage, maxPage);
  const currentFirstPhotoIndex = sourcePage * 2;
  const spreadPage = turning && !targetSpreadRevealed ? sourcePage : currentPage;
  const firstPhotoIndex = spreadPage * 2;
  const leftPage = readerPages[firstPhotoIndex];
  const rightPage = readerPages[firstPhotoIndex + 1];
  const isWideSpread = leftPage?.wideHalf === 'left'
    && rightPage?.wideHalf === 'right'
    && leftPage.photo?.id === rightPage.photo?.id;

  const turnPage = useCallback((offset: number) => {
    dispatch({ type: 'move', offset, maxPage });
  }, [maxPage]);

  const revealTargetSpreadAtFold = (latest: Record<string, string | number>) => {
    const rotation = latest.rotateY;
    if (typeof rotation === 'number' && Math.abs(rotation) >= 90) dispatch({ type: 'reveal', turnId });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') turnPage(1);
      if (event.key === 'ArrowLeft') turnPage(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, turnPage]);

  return (
    <AnimatePresence>
      <motion.div className="album-reader-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.section className="album-reader" initial={{ opacity: 0, scale: 0.9, rotateX: 8 }} animate={{ opacity: 1, scale: 1, rotateX: 0 }} exit={{ opacity: 0, scale: 0.92, rotateX: 6 }} transition={{ type: 'spring', stiffness: 230, damping: 25 }} aria-label={`${album.title} 앨범`} onClick={(event) => event.stopPropagation()}>
          <div className={`album-reader-book${isWideSpread ? ' album-reader-book-wide-spread' : ''}`}>
            <div className="album-reader-spread">
              <PhotoPage album={album} dimensions={dimensions} page={leftPage} side="left" />
              <PhotoPage album={album} dimensions={dimensions} page={rightPage} side="right" />
              {isWideSpread && leftPage.photo ? <Panorama album={album} dimensions={dimensions} photo={leftPage.photo} /> : null}
            </div>
            {turning ? <motion.div key={turnId} className={`album-reader-flip ${direction > 0 ? 'album-reader-flip-forward' : 'album-reader-flip-backward'}`} initial={{ rotateY: 0 }} animate={{ rotateY: direction > 0 ? -180 : 180 }} transition={{ duration: PAGE_TURN_DURATION, ease: PAGE_TURN_EASING }} onUpdate={revealTargetSpreadAtFold} onAnimationComplete={() => dispatch({ type: 'finish', turnId })}>
              <div className="album-reader-flip-face album-reader-flip-front"><PhotoPage album={album} dimensions={dimensions} page={readerPages[direction > 0 ? currentFirstPhotoIndex + 1 : currentFirstPhotoIndex]} side={direction > 0 ? 'right' : 'left'} /></div>
              <div className="album-reader-flip-face album-reader-flip-back"><PhotoPage album={album} dimensions={dimensions} page={readerPages[direction > 0 ? currentFirstPhotoIndex + 2 : currentFirstPhotoIndex - 1]} side={direction > 0 ? 'left' : 'right'} /></div>
            </motion.div> : null}
            <button type="button" className="album-reader-turn album-reader-turn-previous" onClick={() => turnPage(-1)} disabled={currentPage === 0} aria-label="이전 페이지" />
            <button type="button" className="album-reader-turn album-reader-turn-next" onClick={() => turnPage(1)} disabled={currentPage === maxPage} aria-label="다음 페이지" />
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}
