import { Buffer } from 'node:buffer';
import { imageSize } from 'image-size';
import { ArchiveError } from './store.mjs';

// JSON control requests are bounded independently of file size. File bytes
// travel in separate, automatically split requests.
export const BODY_BYTES = 8 * 1024 * 1024;
export const RECORD_BYTES = BODY_BYTES;
export const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
export function check(condition, message = '입력 형식과 용량을 확인해 주세요.') { if (!condition) throw new ArchiveError(400, message); }
export function text(value, max, required = false) { check(typeof value === 'string' && value.length <= max && (!required || value.trim())); return value; }
export function strings(value, maxItems = 60) { check(Array.isArray(value) && value.length <= maxItems); return value.map(item => text(item, 300)); }
export function encrypted(value) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).length === 4 && ['salt', 'iv', 'authTag', 'ciphertext'].every(key => typeof value[key] === 'string')
    && /^[a-f0-9]{32}$/.test(value.salt) && /^[a-f0-9]{24}$/.test(value.iv)
    && /^[a-f0-9]{32}$/.test(value.authTag) && /^(?:[a-f0-9]{2})+$/.test(value.ciphertext));
  return value;
}
export function safeImageUrl(value) {
  text(value, BODY_BYTES);
  if (!value) return value;
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)) return value;
  let url; try { url = new URL(value); } catch { check(false, '이미지 주소를 확인해 주세요.'); }
  check(url.protocol === 'https:' && !url.username && !url.password, '이미지 주소는 HTTPS만 사용할 수 있습니다.');
  return value;
}
export function logRecord(input, id) {
  check(input && typeof input === 'object');
  const draft = input.draft;
  check(draft && typeof draft === 'object' && typeof draft.locked === 'boolean');
  const source = input.transfer ? undefined : text(draft.sourceHtml, Infinity, true);
  if (draft.locked && !input.transfer) { try { encrypted(JSON.parse(source)); } catch { check(false, '잠긴 로그는 암호화된 파일만 저장할 수 있습니다.'); } }
  check(['roll20', 'ccfolia', 'cca', 'cinematic'].includes(draft.format));
  const format = draft.format === 'cinematic' ? draft.sourceFormat : draft.format;
  check(['', undefined, 'roll20', 'ccfolia', 'cca', 'cinematic'].includes(format));
  check(Array.isArray(draft.cast) && draft.cast.length <= 100);
  const cast = draft.cast.map(entry => ({ plName: text(entry.plName, 200), pcName: text(entry.pcName, 200), iconSrc: draft.locked ? '' : safeImageUrl(entry.iconSrc) }));
  const date = text(draft.date, 80, true);
  check(/^\d{4}[.-]\d{2}[.-]\d{2}/.test(date));
  const post = { archiveId: id, slug: id, fullSlug: `live/${id}`, folderSlug: 'live', year: date.slice(0, 4),
    title: text(draft.title, 200, true), scenarioTitle: draft.title,
    description: text(draft.description, 5000), date, tags: strings(draft.tags),
    calendarEventId: text(draft.calendarEventId, 500), playId: text(draft.playId, 200), gmName: text(draft.gmName, 200), gmIconSrc: '', cast,
    htmlPath: '', htmlUrl: '', sourceFormat: format || '', encrypted: draft.locked,
    mainChannels: strings(draft.mainChannels), whisperChannels: strings(draft.whisperChannels) };
  let recovery;
  if (draft.locked) {
    text(input.recovery, 20_000, true);
    try { encrypted(JSON.parse(input.recovery)); } catch { check(false, '암호화된 비밀번호 보관 정보를 확인해 주세요.'); }
    recovery = input.recovery;
  }
  return { post, ...(source === undefined ? {} : { source }), ...(recovery ? { recovery } : {}) };
}
export function photoFile(input, id) {
  check(input && ID.test(input.id) && typeof input.content === 'string');
  check(/^[a-zA-Z0-9+/]+={0,2}$/.test(input.content));
  const bytes = Buffer.from(input.content, 'base64');
  check(bytes.length > 0 && bytes.toString('base64') === input.content);
  let dimensions;
  try { dimensions = imageSize(bytes); } catch { check(false, '지원하는 이미지 파일이 아닙니다.'); }
  const extensions = { png: 'png', jpg: 'jpg', gif: 'gif', webp: 'webp' };
  const extension = extensions[dimensions.type];
  check(extension && dimensions.width > 0 && dimensions.height > 0, '이미지 파일 형식을 확인해 주세요.');
  const key = `${id}_${input.id}.${extension}`;
  return { path: `web-archive/photos/${key}`, content: input.content, base64: true, key, photoId: input.id, width: dimensions.width, height: dimensions.height };
}
export function albumRecord(input, previous, base, files, site) {
  check(input && ID.test(input.id));
  check(Array.isArray(input.photos) && input.photos.length > 0);
  const seen = new Set();
  const photos = input.photos.map(photo => {
    check(photo && ID.test(photo.id) && !seen.has(photo.id)); seen.add(photo.id);
    const uploaded = files.find(file => file.photoId === photo.id);
    const old = previous?.photos.find(entry => entry.id === photo.id);
    let src;
    if (uploaded) src = `${base}/photos/${uploaded.key}`;
    else if (old) src = old.src;
    else {
      // Initial editing of a pre-existing static album. Only its deployed
      // gallery paths may be imported; never proxy arbitrary URLs or repo paths.
      const candidate = text(photo.src, 2000, true);
      check(/^\/(?:AfterTheRoll\/|trpg-logs\/)?images\/gallery\/[a-zA-Z0-9_./% -]+$/.test(candidate)
        && !candidate.includes('..') && !/%(?:2e|2f|5c)/i.test(candidate), '기존 사진 주소를 확인해 주세요.');
      const path = candidate.replace(/^\/(?:AfterTheRoll\/|trpg-logs\/)?images\/gallery\//, '');
      src = `${site.origin}${site.basePath}/images/gallery/${path}`;
    }
    const copyright = { name: text(photo.copyright?.name, 200) };
    if (photo.copyright?.url) { const url = new URL(text(photo.copyright.url, 2000)); check(['http:', 'https:'].includes(url.protocol)); copyright.url = url.href; }
    const importedSize = Number.isSafeInteger(photo.width) && Number.isSafeInteger(photo.height)
      && photo.width > 0 && photo.height > 0 ? { width: photo.width, height: photo.height } : {};
    return { id: photo.id, src, alt: text(photo.alt, 1000), copyright, createdAt: text(photo.createdAt, 80),
      ...(uploaded ? { width: uploaded.width, height: uploaded.height } : old ? { width: old.width, height: old.height } : importedSize),
      ...(uploaded?.archiveTransfer ? { archiveTransfer: uploaded.archiveTransfer } : old?.archiveTransfer ? { archiveTransfer: old.archiveTransfer } : {}),
      layout: photo.layout === 'spread' ? 'spread' : 'single' };
  });
  const coverPhotoId = input.coverPhotoId || photos[0].id;
  check(photos.some(photo => photo.id === coverPhotoId));
  return { id: input.id, title: text(input.title, 200, true), description: text(input.description || '', 5000),
    themeColor: /^#[a-f0-9]{6}$/i.test(input.themeColor) ? input.themeColor : '#c87993', coverPhotoId, photos,
    createdAt: previous?.createdAt || text(input.createdAt, 80), updatedAt: new Date().toISOString() };
}
