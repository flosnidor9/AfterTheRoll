import { Buffer } from 'node:buffer';
import { imageSize } from 'image-size';
import { ARCHIVE_PART_BYTES } from '../src/lib/archiveTransferProtocol.ts';
import { check, encrypted } from './validation.mjs';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const encode = value => new TextEncoder().encode(value);
function receipt(part) {
  return { uploadId: part.uploadId, index: part.index, kind: part.kind, sha: part.sha, size: part.size, totalBytes: part.totalBytes, totalParts: part.totalParts,
    ...(part.imageType ? { imageType: part.imageType, width: part.width, height: part.height } : {}) };
}
async function signingKey(env) {
  return crypto.subtle.importKey('raw', encode(`afterroll-upload-v1:${env.GITHUB_TOKEN}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export function partPath(part) { return `web-archive/parts/${part.uploadId}/${part.index}`; }

export async function receivePart(input, env, store) {
  check(input && UUID.test(input.uploadId) && Number.isSafeInteger(input.index) && input.index >= 0
    && ['photo', 'log', 'encrypted-log'].includes(input.kind) && typeof input.content === 'string');
  check(Number.isSafeInteger(input.totalBytes) && input.totalBytes > 0 && input.totalParts === Math.ceil(input.totalBytes / ARCHIVE_PART_BYTES) && input.index < input.totalParts);
  check(input.content.length <= Math.ceil(ARCHIVE_PART_BYTES / 3) * 4 && /^[a-zA-Z0-9+/]+={0,2}$/.test(input.content), '전송 조각 형식을 확인해 주세요.');
  const bytes = Buffer.from(input.content, 'base64');
  check(bytes.length > 0 && bytes.length <= ARCHIVE_PART_BYTES && bytes.toString('base64') === input.content);
  check(bytes.length === Math.min(ARCHIVE_PART_BYTES, input.totalBytes - input.index * ARCHIVE_PART_BYTES));
  const part = { uploadId: input.uploadId, index: input.index, kind: input.kind, size: bytes.length, totalBytes: input.totalBytes, totalParts: input.totalParts };
  if (input.kind === 'encrypted-log') check(/^[a-f0-9]+$/.test(bytes.toString('utf8')), '잠긴 로그는 암호화한 조각만 전송할 수 있습니다.');
  if (input.kind === 'photo' && input.index === 0) {
    let imageType;
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) imageType = 'png';
    else if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) imageType = 'gif';
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) imageType = 'jpg';
    else if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') imageType = 'webp';
    check(imageType, 'PNG/JPEG/GIF/WebP 이미지 파일을 선택해 주세요.');
    part.imageType = imageType;
    // Very large metadata blocks can put JPEG dimensions in a later part.
    // File format is verified here; dimensions may fall back to browser decode.
    try { const size = imageSize(bytes); part.width = size.width; part.height = size.height; } catch { /* Header continues in another part. */ }
  }
  part.sha = await store.putBlob(input.content);
  part.signature = Buffer.from(await crypto.subtle.sign('HMAC', await signingKey(env), encode(JSON.stringify(receipt(part))))).toString('hex');
  return part;
}

export async function verifyTransfer(input, kind, env) {
  check(input && Array.isArray(input.parts) && input.parts.length > 0);
  const key = await signingKey(env);
  const uploadId = input.parts[0].uploadId;
  check(Number.isSafeInteger(input.parts[0].totalBytes) && input.parts[0].totalBytes > 0 && input.parts.length === Math.ceil(input.parts[0].totalBytes / ARCHIVE_PART_BYTES), '전송 조각이 누락됐습니다.');
  for (const [index, part] of input.parts.entries()) {
    check(part && UUID.test(part.uploadId) && part.uploadId === uploadId && part.index === index && part.kind === kind
      && SHA.test(part.sha) && Number.isSafeInteger(part.size) && part.size > 0 && part.size <= ARCHIVE_PART_BYTES
      && part.totalParts === input.parts.length && part.totalBytes === input.parts[0].totalBytes
      && part.size === Math.min(ARCHIVE_PART_BYTES, part.totalBytes - index * ARCHIVE_PART_BYTES)
      && /^[a-f0-9]{64}$/.test(part.signature), '전송 조각이 누락됐거나 변경됐습니다. 다시 업로드해 주세요.');
    check(await crypto.subtle.verify('HMAC', key, Buffer.from(part.signature, 'hex'), encode(JSON.stringify(receipt(part)))), '전송 조각을 확인할 수 없습니다. 다시 업로드해 주세요.');
  }
  if (kind === 'encrypted-log') encrypted({ ...input.envelope, ciphertext: '00' });
  const parts = input.parts.map(part => receipt(part));
  return { parts, ...(kind === 'encrypted-log' ? { envelope: { salt: input.envelope.salt, iv: input.envelope.iv, authTag: input.envelope.authTag } } : {}) };
}
export function transferFiles(transfer) { return transfer.parts.map(part => ({ path: partPath(part), sha: part.sha })); }
export function transferRemovals(transfer) { return transfer?.parts?.map(part => ({ path: partPath(part), remove: true })) || []; }
