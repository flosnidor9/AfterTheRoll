'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AlbumPhotoEditor from './AlbumPhotoEditor';
import { PANORAMA_ASPECT_RATIO } from '@/lib/galleryPages';
import { reorderGalleryPhotos, type PhotoPlacement } from '@/lib/galleryOrder';
import { useAuth } from '@/contexts/AuthContext';
import {
  createGalleryAlbum,
  deleteGalleryAlbum,
  galleryPhotoPath,
  updateGalleryAlbum,
} from '@/lib/galleryUpload';
import { DEFAULT_GALLERY_ALBUM_THEME_COLOR, galleryAlbumThemeColor } from '@/lib/galleryTheme';
import type { GalleryAlbum, GalleryPhoto } from '@/lib/data/gallery';

const FIELD_CLASS = 'mt-[0.3rem] w-full rounded-[0.3rem] border border-[var(--atr-line)] bg-white px-[0.65rem] py-[0.45rem] text-[0.86rem] text-[var(--atr-text)]';
const EMPTY_ALBUM: GalleryAlbum = { id: '', title: '', description: '', themeColor: DEFAULT_GALLERY_ALBUM_THEME_COLOR, photos: [], createdAt: '', updatedAt: '' };

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

export default function GalleryManagementActions({ album }: { album?: GalleryAlbum }) {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<GalleryAlbum>(EMPTY_ALBUM);
  const [newFiles, setNewFiles] = useState<Array<{ photo: GalleryPhoto; file: File; previewSrc: string }>>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = mode === 'edit';

  function beginCreate() {
    setMode('create');
    setDraft({ ...EMPTY_ALBUM, id: makeId(), createdAt: now(), updatedAt: now() });
    setNewFiles([]); setToken(''); setStatus(''); setOpen(true);
  }
  function beginEdit(target: GalleryAlbum) {
    setMode('edit');
    setDraft({ ...target, description: target.description ?? '', themeColor: galleryAlbumThemeColor(target.themeColor) });
    setNewFiles([]); setToken(''); setStatus(''); setOpen(true);
  }
  function close() { if (!saving) setOpen(false); }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const additions = await Promise.all(Array.from(files).map(async (file) => {
      const photoId = makeId();
      const previewSrc = URL.createObjectURL(file);
      const dimensions = await new Promise<{ width?: number; height?: number }>((resolve) => {
        const image = new globalThis.Image();
        image.onload = () => resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined });
        image.onerror = () => resolve({});
        image.src = previewSrc;
      });
      const layout: GalleryPhoto['layout'] = dimensions.width && dimensions.height && dimensions.width / dimensions.height >= PANORAMA_ASPECT_RATIO ? 'spread' : 'single';
      return {
        file,
        previewSrc,
        photo: {
          id: photoId,
          src: galleryPhotoPath(draft.id, photoId, file),
          alt: draft.title || file.name,
          copyright: { name: '' },
          createdAt: now(),
          layout,
          ...dimensions,
        },
      };
    }));
    setNewFiles((current) => [...current, ...additions]);
    setDraft((current) => ({ ...current, photos: [...current.photos, ...additions.map(({ photo }) => photo)] }));
  }
  function removePhoto(photoId: string) {
    setDraft((current) => ({ ...current, photos: current.photos.filter((photo) => photo.id !== photoId), coverPhotoId: current.coverPhotoId === photoId ? undefined : current.coverPhotoId }));
    setNewFiles((current) => current.filter(({ photo }) => photo.id !== photoId));
  }
  function movePhoto(photoId: string, targetId: string, placement: PhotoPlacement) {
    setDraft((current) => ({ ...current, photos: reorderGalleryPhotos(current.photos, photoId, targetId, placement) }));
  }
  function updatePhoto(photoId: string, changes: Partial<GalleryPhoto>) {
    setDraft((current) => ({
      ...current,
      photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, ...changes } : photo),
    }));
  }
  async function save() {
    if (!draft.title.trim() || !draft.photos.length || !token.trim()) { setStatus('앨범 제목, 사진, GitHub access token을 입력해 주세요.'); return; }
    setSaving(true); setStatus('앨범을 저장하고 있습니다.');
    const album = { ...draft, title: draft.title.trim(), description: draft.description?.trim() || undefined, themeColor: galleryAlbumThemeColor(draft.themeColor), updatedAt: now(), coverPhotoId: draft.coverPhotoId ?? draft.photos[0]?.id };
    try {
      if (editing) await updateGalleryAlbum(token, album, newFiles);
      else await createGalleryAlbum(token, album, newFiles);
      setStatus('저장했습니다. 배포 반영 후 갤러리에 표시됩니다.');
      router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : '앨범 저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  }
  async function removeAlbum() {
    if (!window.confirm(`“${draft.title}” 앨범과 사진을 삭제할까요?`)) return;
    if (!token.trim()) { setStatus('GitHub access token을 입력해 주세요.'); return; }
    setSaving(true); setStatus('앨범을 삭제하고 있습니다.');
    try { await deleteGalleryAlbum(token, draft); setOpen(false); router.refresh(); }
    catch (error) { setStatus(error instanceof Error ? error.message : '앨범 삭제 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  }

  if (loading || !isAdmin) return null;
  return <>
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={album ? () => beginEdit(album) : beginCreate} className={album ? 'rounded-[0.22rem] border border-[var(--atr-line)] bg-white/75 px-[0.48rem] py-[0.25rem] text-[0.66rem] text-[var(--atr-muted)] shadow-sm hover:bg-white' : 'ledger-stamp rounded-[0.2rem] px-[0.7rem] py-[0.38rem] text-[0.72rem]'}>{album ? '편집' : '+ 앨범 추가'}</motion.button>
    {open ? createPortal(<div className="fixed inset-0 z-[100] overflow-y-auto bg-[rgba(76,51,61,0.38)] p-[1rem]" role="dialog" aria-modal="true" aria-label={editing ? '앨범 편집' : '앨범 추가'}>
      <div className="ledger-paper-sheet mx-auto my-[2rem] max-w-[44rem] p-[1rem] md:p-[1.4rem]">
        <div className="flex items-start justify-between gap-[1rem] border-b border-[var(--atr-line)] pb-[0.8rem]"><div><p className="afterroll-meta text-[0.72rem] uppercase tracking-[0.12em] text-[var(--atr-accent)]">Photo archive</p><h2 className="afterroll-title mt-[0.2rem] text-[1.8rem]">{editing ? '앨범 편집' : '앨범 추가'}</h2></div><button type="button" onClick={close} className="text-[0.78rem] text-[var(--atr-muted)]">닫기</button></div>
        <div className="mt-[0.8rem] flex items-end gap-[0.55rem]"><label className="min-w-0 flex-1 text-[0.78rem] text-[var(--atr-muted)]">앨범 제목<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={FIELD_CLASS} /></label><div className="shrink-0 text-[0.78rem] text-[var(--atr-muted)]"><span>메인 색상</span><div className="mt-[0.3rem] flex items-center gap-[0.35rem]"><input type="color" value={galleryAlbumThemeColor(draft.themeColor)} onChange={(event) => setDraft({ ...draft, themeColor: event.target.value })} className="album-theme-color-picker block h-[2.25rem] w-[2.25rem] cursor-pointer appearance-none rounded-full border border-[var(--atr-line)] bg-white p-[0.12rem]" aria-label="앨범 메인 색상 선택" /><input type="text" value={draft.themeColor ?? DEFAULT_GALLERY_ALBUM_THEME_COLOR} onChange={(event) => setDraft({ ...draft, themeColor: event.target.value })} onBlur={() => setDraft((current) => ({ ...current, themeColor: galleryAlbumThemeColor(current.themeColor) }))} maxLength={7} spellCheck={false} inputMode="text" placeholder="#c87993" className="h-[2.25rem] w-[7rem] rounded-[0.3rem] border border-[var(--atr-line)] bg-white px-[0.5rem] font-mono text-[0.76rem] uppercase text-[var(--atr-text)]" aria-label="앨범 메인 색상 HEX 코드" /></div></div></div>
        <label className="mt-[0.75rem] block text-[0.78rem] text-[var(--atr-muted)]">설명 (선택)<textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className={FIELD_CLASS} /></label>
        <div className="mt-[0.75rem]"><input ref={photoInputRef} type="file" accept="image/*" multiple onChange={(event) => addFiles(event.target.files)} className="sr-only" /><motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => photoInputRef.current?.click()} className="rounded-[0.25rem] border border-[var(--atr-line)] bg-white/60 px-[0.7rem] py-[0.42rem] text-[0.78rem] text-[var(--atr-muted)] hover:bg-white">사진 추가</motion.button></div>
        <AlbumPhotoEditor photos={draft.photos} newFiles={newFiles} coverPhotoId={draft.coverPhotoId ?? draft.photos[0]?.id} saving={saving} onMove={movePhoto} onUpdate={updatePhoto} onRemove={removePhoto} onCover={(id) => setDraft((current) => ({ ...current, coverPhotoId: id }))} />
        <label className="mt-[0.75rem] block text-[0.78rem] text-[var(--atr-muted)]">GitHub access token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" className={FIELD_CLASS} /></label>
        {status ? <p className="mt-[0.8rem] whitespace-pre-wrap text-[0.82rem] text-[var(--atr-muted)]" role="status">{status}</p> : null}
        <div className="mt-[1rem] flex items-center justify-between gap-[0.5rem]"><div>{editing ? <button type="button" onClick={removeAlbum} disabled={saving} className="rounded-[0.25rem] border border-[rgba(166,75,75,0.48)] bg-[rgba(166,75,75,0.08)] px-[0.75rem] py-[0.45rem] text-[0.78rem] text-[rgb(145,62,62)] hover:bg-[rgba(166,75,75,0.15)] disabled:opacity-50">앨범 삭제</button> : null}</div><div className="flex gap-[0.5rem]"><button type="button" onClick={close} className="rounded-[0.25rem] border border-[var(--atr-line)] bg-white/70 px-[0.75rem] py-[0.45rem] text-[0.78rem] text-[var(--atr-muted)] hover:bg-white">취소</button><motion.button type="button" whileTap={{ scale: 0.98 }} onClick={save} disabled={saving} className="ledger-stamp rounded-[0.25rem] px-[0.8rem] py-[0.45rem] text-[0.78rem] disabled:opacity-50">{saving ? '저장 중' : '저장'}</motion.button></div></div>
      </div>
    </div>, document.body) : null}
  </>;
}
