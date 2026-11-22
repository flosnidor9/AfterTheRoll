// Transport chunk size, not a maximum file size. Files use as many parts as
// necessary; each Worker invocation only processes one part in memory.
export const ARCHIVE_PART_BYTES = 1024 * 1024;
export type ArchivePart = {
  uploadId: string;
  index: number;
  kind: 'photo' | 'log' | 'encrypted-log';
  sha: string;
  size: number;
  totalBytes: number;
  totalParts: number;
  signature: string;
  imageType?: string;
  width?: number;
  height?: number;
};
export type ArchiveTransfer = { parts: ArchivePart[]; envelope?: { salt: string; iv: string; authTag: string } };
