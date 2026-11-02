'use client';

import { motion } from 'framer-motion';
import { useId, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import Image from '@/components/ArchiveImage';
import type { GalleryPhoto } from '@/lib/data/gallery';
import { makeReaderPages } from '@/lib/galleryPages';
import type { PhotoPlacement } from '@/lib/galleryOrder';
import { usePhotoDimensions } from './usePhotoDimensions';
import { usePhotoSort } from './usePhotoSort';

type Props = {
  photos: GalleryPhoto[];
  newFiles: Array<{ photo: GalleryPhoto; previewSrc: string }>;
  coverPhotoId?: string;
  saving: boolean;
  onMove: (id: string, targetId: string, placement: PhotoPlacement) => void;
  onUpdate: (id: string, changes: Partial<GalleryPhoto>) => void;
  onRemove: (id: string) => void;
  onCover: (id: string) => void;
};

const INPUT_CLASS = 'mt-1 w-full min-w-0 rounded border border-[var(--atr-line)] bg-white/80 px-2 py-1 text-xs text-[var(--atr-text)]';
const ACTION_CLASS = 'rounded border border-[var(--atr-line)] bg-white/70 px-2 py-1 text-xs text-[var(--atr-muted)] hover:bg-white disabled:opacity-40';

export default function AlbumPhotoEditor({ photos, newFiles, coverPhotoId, saving, onMove, onUpdate, onRemove, onCover }: Props) {
  const dimensions = usePhotoDimensions(photos);
  const pages = makeReaderPages(photos, dimensions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyboardId, setKeyboardId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const instructionsId = useId();
  const source = (photo: GalleryPhoto) => newFiles.find((item) => item.photo.id === photo.id)?.previewSrc ?? photo.src;
  const { drag, destination, start } = usePhotoSort((id, targetId, placement) => {
    onMove(id, targetId, placement);
    setAnnouncement('사진 순서를 변경했습니다.');
  });
  const draggedPhoto = photos.find((photo) => photo.id === drag?.id);

  function sortWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, photo: GalleryPhoto) {
    const index = photos.findIndex((item) => item.id === photo.id);
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setKeyboardId(keyboardId === photo.id ? null : photo.id);
      setAnnouncement(keyboardId === photo.id ? '사진 배치를 마쳤습니다.' : '사진을 선택했습니다. 방향키로 이동한 뒤 Space를 누르세요.');
      return;
    }
    if (keyboardId !== photo.id) return;
    if (event.key === 'Escape') { event.preventDefault(); setKeyboardId(null); return; }
    const previous = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const target = event.key === 'Home' ? photos[0] : event.key === 'End' ? photos.at(-1) : photos[index + (previous ? -1 : 1)];
    if (!previous && !next && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    if (target && target.id !== photo.id) {
      onMove(photo.id, target.id, previous || event.key === 'Home' ? 'before' : 'after');
      setAnnouncement(`${photo.alt || '사진'} 순서를 변경했습니다.`);
    }
  }

  if (!photos.length) return <p className="mt-3 text-sm text-[var(--atr-muted)]">사진을 추가하면 이곳에 앨범 페이지가 펼쳐집니다.</p>;

  return <section className="mt-4" aria-label="앨범 페이지 편집">
    <h3 className="afterroll-title text-xl">페이지 구성</h3>
    <p id={instructionsId} className="mt-1 text-xs leading-relaxed text-[var(--atr-muted)]">사진을 드래그해 원하는 사진 앞이나 뒤에 놓으세요. 다른 페이지까지 자유롭게 이동할 수 있습니다. 키보드에서는 사진에 초점을 맞추고 Space로 선택한 뒤 방향키로 이동하세요.</p>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    <div className="mt-3 grid grid-cols-2 gap-y-4">
      {pages.map((page, pageIndex) => {
        if (page.wideHalf === 'right') return null;
        const photo = page.photo;
        const wide = page.wideHalf === 'left';
        const nextPhoto = pages.slice(pageIndex + 1).find((item) => item.photo)?.photo;
        if (!photo) return <div key={`blank-${pages[pageIndex - 1]?.photo?.id ?? pageIndex}`} data-sort-target={nextPhoto?.id ?? photos.at(-1)?.id} data-sort-placement={nextPhoto ? 'before' : 'after'} className="flex aspect-square flex-col rounded-r border border-l-0 border-[var(--atr-line)] bg-white/60 p-3 text-xs text-[var(--atr-soft)]">
          <span>{pageIndex + 1}페이지 · 오른쪽</span><span className="m-auto">빈 페이지</span>
        </div>;
        const selected = editingId === photo.id;
        const target = destination?.id === photo.id ? destination.placement : null;
        return <motion.article layout key={photo.id} transition={{ type: 'spring', stiffness: 350, damping: 35 }} data-sort-target={photo.id} className={`relative min-w-0 border border-[var(--atr-line)] bg-white/70 p-2 sm:p-3 ${wide ? 'col-span-2 rounded' : pageIndex % 2 === 0 ? 'rounded-l' : 'rounded-r border-l-0'} ${drag?.id === photo.id ? 'opacity-35' : ''}`}>
          {target ? <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 z-10 w-1 rounded bg-[var(--atr-accent)] ${target === 'before' ? 'left-0' : 'right-0'}`} /> : null}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-[var(--atr-muted)]">
            <span>{wide ? `${pageIndex + 1}–${pageIndex + 2}페이지 · 파노라마` : `${pageIndex + 1}페이지 · ${pageIndex % 2 === 0 ? '왼쪽' : '오른쪽'}`}</span>
            {coverPhotoId === photo.id ? <span className="text-[var(--atr-accent)]">표지</span> : null}
          </div>
          <motion.button type="button" layout="position" disabled={saving} onPointerDown={(event) => { if (!saving) { setKeyboardId(null); start(event, photo.id); } }} onKeyDown={(event) => sortWithKeyboard(event, photo)} aria-label={`${photo.alt || '앨범 사진'} 순서 변경`} aria-describedby={instructionsId} aria-pressed={keyboardId === photo.id} className={`relative block w-full touch-none select-none overflow-hidden rounded-sm bg-[rgba(200,121,147,0.05)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--atr-accent)] disabled:cursor-default ${wide ? 'aspect-[2/1]' : 'aspect-square'} ${drag ? 'cursor-grabbing' : 'cursor-grab'} ${keyboardId === photo.id ? 'ring-2 ring-[var(--atr-accent)]' : ''}`}>
            <Image src={source(photo)} alt={photo.alt || '앨범 사진'} fill sizes={wide ? '(max-width: 40rem) 90vw, 40rem' : '(max-width: 40rem) 44vw, 20rem'} draggable={false} className="pointer-events-none object-contain p-2" />
            <span aria-hidden="true" className="absolute bottom-1 right-1 rounded bg-white/80 px-2 py-1 text-xs text-[var(--atr-muted)]">⠿</span>
          </motion.button>
          <p className="mt-2 truncate text-xs text-[var(--atr-muted)]">{photo.copyright.name ? `© ${photo.copyright.name}` : photo.alt || '앨범 사진'}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button type="button" disabled={saving} onClick={() => setEditingId(selected ? null : photo.id)} aria-expanded={selected} className={ACTION_CLASS}>{selected ? '편집 닫기' : '정보 편집'}</button>
            <button type="button" disabled={saving || coverPhotoId === photo.id} onClick={() => onCover(photo.id)} className={ACTION_CLASS}>표지로</button>
            <button type="button" disabled={saving} onClick={() => onRemove(photo.id)} className={ACTION_CLASS}>제거</button>
          </div>
          {selected ? <div className="mt-3 space-y-2 border-t border-[var(--atr-line)] pt-2">
            <label className="block text-xs text-[var(--atr-muted)]">설명<input disabled={saving} value={photo.alt} onChange={(event) => onUpdate(photo.id, { alt: event.target.value })} className={INPUT_CLASS} /></label>
            <label className="block text-xs text-[var(--atr-muted)]">저작권자<input disabled={saving} value={photo.copyright.name} onChange={(event) => onUpdate(photo.id, { copyright: { ...photo.copyright, name: event.target.value } })} className={INPUT_CLASS} /></label>
            <label className="block text-xs text-[var(--atr-muted)]">출처 URL<input disabled={saving} type="url" value={photo.copyright.url ?? ''} onChange={(event) => onUpdate(photo.id, { copyright: { ...photo.copyright, url: event.target.value || undefined } })} className={INPUT_CLASS} /></label>
          </div> : null}
        </motion.article>;
      })}
      {pages.length % 2 !== 0 ? <div data-sort-target={photos.at(-1)?.id} data-sort-placement="after" className="flex aspect-square items-center justify-center rounded-r border border-l-0 border-[var(--atr-line)] bg-white/60 text-xs text-[var(--atr-soft)]">빈 페이지</div> : null}
    </div>
    {drag && draggedPhoto ? createPortal(<motion.div initial={{ opacity: 0.8, scale: 1.02 }} animate={{ opacity: 0.9, scale: 1.02 }} aria-hidden="true" className="pointer-events-none fixed z-[110] overflow-hidden rounded border border-[var(--atr-line)] bg-white/90 shadow-xl" style={{ left: `${drag.x}rem`, top: `${drag.y}rem`, width: `${drag.width}rem`, height: `${drag.height}rem` }}>
      <Image src={source(draggedPhoto)} alt="" fill sizes="40rem" draggable={false} className="object-contain p-2" />
    </motion.div>, document.body) : null}
  </section>;
}
