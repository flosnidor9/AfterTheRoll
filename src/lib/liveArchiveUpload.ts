import { archiveChanged, archiveRequest, type ArchiveCatalog, type LiveLog } from '@/lib/archiveApi';
import type { TrpgUploadDraft } from '@/lib/trpgUpload';
import { encryptTrpgLogContent } from '@/lib/trpgUpload';
import type { GalleryAlbum, GalleryPhoto } from '@/lib/data/gallery';
import { inlineLogMedia } from '@/lib/liveLogMedia';
import { uploadArchiveFile } from '@/lib/archiveTransfers';

export async function uploadLiveLog(draft: TrpgUploadDraft, password: string, masterKey: string) {
  const portable = inlineLogMedia(draft);
  const payload = JSON.stringify({ version: 1, html: portable.sourceHtml, cast: portable.cast });
  const encrypted = portable.locked ? JSON.parse(await encryptTrpgLogContent(payload, password)) : null;
  const transfer = await uploadArchiveFile(new Blob([encrypted ? encrypted.ciphertext : payload]), portable.locked ? 'encrypted-log' : 'log');
  if (encrypted) transfer.envelope = { salt: encrypted.salt, iv: encrypted.iv, authTag: encrypted.authTag };
  const recovery = portable.locked ? await encryptTrpgLogContent(JSON.stringify({ password }), masterKey) : undefined;
  const input = { draft: { ...portable, sourceHtml: '', cast: portable.cast.map(entry => ({ ...entry, iconSrc: '' })) }, transfer, recovery };
  const result = await archiveRequest<{ post: LiveLog }>('/logs', input, 'POST', true);
  archiveChanged();
  return result.post;
}

export async function saveLiveAlbum(album: GalleryAlbum, photos: Array<{ photo: GalleryPhoto; file: File }>) {
  const catalog = await archiveRequest<ArchiveCatalog>('/catalog');
  const previous = catalog.albums.find(entry => entry.id === album.id);
  // Compare the version the editor opened, rather than silently overwriting
  // another tab's edit with an out-of-date draft.
  if (previous && previous.updatedAt !== album.updatedAt) throw new Error('앨범이 변경됐습니다. 새로고침한 뒤 다시 편집해 주세요.');
  const files = [];
  for (const { photo, file } of photos) files.push({ id: photo.id, width: photo.width, height: photo.height, transfer: await uploadArchiveFile(file, 'photo') });
  const input = { album, files, expectedUpdatedAt: previous?.updatedAt ?? null };
  await archiveRequest(`/albums/${encodeURIComponent(album.id)}`, input, 'PUT', true);
  archiveChanged();
}

export async function deleteLiveAlbum(album: GalleryAlbum) {
  await archiveRequest(`/albums/${encodeURIComponent(album.id)}`, undefined, 'DELETE', true);
  archiveChanged();
}
