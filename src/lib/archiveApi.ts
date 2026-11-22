import { auth } from '@/lib/firebase';
import { PUBLIC_SITE_CONFIG } from '@/lib/config/public';
import type { GalleryAlbum } from '@/lib/data/gallery';
import type { TrpgArchivePostMeta } from '@/lib/data/trpg';

export const ARCHIVE_CHANGED = 'afterroll-archive-changed';
export type LiveLog = TrpgArchivePostMeta & { archiveId: string };
export type ArchiveCatalog = {
  revision: string | null;
  logs: LiveLog[];
  albums: GalleryAlbum[];
  deletedLogs: string[];
  deletedAlbums: string[];
};
export type LiveLogRecord = { post: LiveLog; source?: string; recovery?: string; transfer?: import('@/lib/archiveTransfers').DownloadTransfer };

export function archiveApiUrl(path: string) {
  const configured = process.env.NEXT_PUBLIC_ARCHIVE_API_URL?.trim() || PUBLIC_SITE_CONFIG.archiveApiUrl;
  if (!configured) throw new Error('업로드 서버가 아직 연결되지 않았습니다. 관리자 설정 안내를 확인해 주세요.');
  const base = new URL(configured);
  if ((base.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1'].includes(base.hostname)))
    || base.username || base.password || base.search || base.hash) throw new Error('업로드 서버 주소를 확인해 주세요.');
  return `${base.href.replace(/\/$/, '')}${path}`;
}

export function archiveConnected() { return Boolean(process.env.NEXT_PUBLIC_ARCHIVE_API_URL?.trim() || PUBLIC_SITE_CONFIG.archiveApiUrl); }

export class ArchiveRequestError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, status: number, retryAfter: number) { super(message); this.status = status; this.retryAfter = retryAfter; }
}

export async function archiveRequest<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', admin = false): Promise<T> {
  const headers: Record<string, string> = {};
  const user = auth.currentUser;
  if (admin) {
    if (!user) throw new Error('Google 관리자 로그인이 필요합니다.');
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
    if (auth.currentUser?.uid !== user.uid) throw new Error('로그인 계정이 변경되었습니다. 다시 시도해 주세요.');
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(archiveApiUrl(path), { method, headers, cache: 'no-store', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new ArchiveRequestError(result.error || '아카이브 서버에 연결하지 못했습니다.', response.status, Number(response.headers.get('Retry-After')) || 60);
  if (admin && auth.currentUser?.uid !== user?.uid) throw new Error('로그인 계정이 변경되었습니다.');
  return result as T;
}

export function archiveChanged() { window.dispatchEvent(new Event(ARCHIVE_CHANGED)); }
export function liveLogHref(id: string) { return `/archive/read/?id=${encodeURIComponent(id)}`; }

export async function fileBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}
