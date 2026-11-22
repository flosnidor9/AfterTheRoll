import { ArchiveRequestError, archiveRequest, fileBase64 } from '@/lib/archiveApi';
import { ARCHIVE_PART_BYTES, type ArchivePart, type ArchiveTransfer } from '@/lib/archiveTransferProtocol';

export type DownloadTransfer = { parts: Array<{ url: string; size: number }>; envelope?: { salt: string; iv: string; authTag: string } };

export async function uploadArchiveFile(blob: Blob, kind: ArchivePart['kind']): Promise<ArchiveTransfer> {
  const uploadId = crypto.randomUUID();
  const parts: ArchivePart[] = [];
  for (let offset = 0; offset < blob.size; offset += ARCHIVE_PART_BYTES) {
    const content = await fileBase64(blob.slice(offset, offset + ARCHIVE_PART_BYTES));
    const input = { uploadId, index: parts.length, kind, content, totalBytes: blob.size, totalParts: Math.ceil(blob.size / ARCHIVE_PART_BYTES) };
    for (;;) {
      try { parts.push(await archiveRequest<ArchivePart>('/chunks', input, 'POST', true)); break; }
      catch (error) {
        if (!(error instanceof ArchiveRequestError) || error.status !== 429) throw error;
        await new Promise(resolve => window.setTimeout(resolve, error.retryAfter * 1000));
      }
    }
  }
  if (!parts.length) throw new Error('빈 파일은 업로드할 수 없습니다.');
  return { parts };
}

export async function downloadArchiveFile(transfer: DownloadTransfer, signal?: AbortSignal) {
  const pieces: Blob[] = [];
  for (const part of transfer.parts) {
    const url = new URL(part.url);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('파일 주소를 확인해 주세요.');
    const response = await fetch(url.href, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const blob = await response.blob();
    if (blob.size !== part.size) throw new Error('파일 전송이 완료되지 않았습니다. 다시 시도해 주세요.');
    pieces.push(blob);
  }
  return new Blob(pieces);
}
