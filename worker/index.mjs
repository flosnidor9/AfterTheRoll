import { Buffer } from 'node:buffer';
import { createStore, ArchiveError } from './store.mjs';
import { requireAdmin } from './auth.mjs';
import { BODY_BYTES, RECORD_BYTES, ID, check, logRecord, photoFile, albumRecord } from './validation.mjs';
import { receivePart, verifyTransfer, transferFiles, transferRemovals } from './transfers.mjs';

const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };
const FILE = /^[a-zA-Z0-9_-]+\.(png|jpg|gif|webp)$/;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const MAX_ITEMS = 2000;

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ArchiveError(415, 'JSON 요청이 필요합니다.');
  if (!request.body) throw new ArchiveError(400, '입력 내용이 없습니다.');
  let size = 0; const chunks = [];
  for await (const chunk of request.body) { size += chunk.byteLength; if (size > BODY_BYTES) throw new ArchiveError(413, '전송 요청이 너무 큽니다. 파일을 나눠 보내는 최신 업로더에서 다시 시도해 주세요.'); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks)); } catch { throw new ArchiveError(400, '입력 형식을 확인해 주세요.'); }
}

export async function handleArchive(request, env, dependencies = {}) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', Vary: 'Origin' };
  const reply = (status, value) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...JSON_TYPE } });
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.LOCAL_ORIGIN || '') ? env.LOCAL_ORIGIN : null;
    if (origin && origin !== env.SITE_ORIGIN && origin !== local) throw new ArchiveError(403, '허용되지 않은 요청입니다.');
    if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Access-Control-Expose-Headers'] = 'Retry-After'; }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
    if (url.search || !['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) throw new ArchiveError(405, '지원하지 않는 요청입니다.');
    const writing = request.method !== 'GET';
    if (writing && !origin) throw new ArchiveError(403, '사이트에서 다시 시도해 주세요.');
    const limit = url.pathname === '/chunks' ? env.UPLOAD_LIMITER : writing ? env.WRITE_LIMITER : env.READ_LIMITER;
    if (!limit) throw new ArchiveError(503, '요청 제한 설정을 확인해 주세요.');
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.headers.get('CF-Connecting-IP') || 'unknown'))).toString('hex');
    if (!(await limit.limit({ key: hash })).success) throw new ArchiveError(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    const authenticate = dependencies.requireAdmin || requireAdmin;
    if (writing || /\/recovery$/.test(url.pathname)) await authenticate(request, env, dependencies.fetcher);
    const store = dependencies.store || createStore(env, dependencies.fetcher);
    if (url.pathname === '/chunks' && request.method === 'POST') return reply(201, await receivePart(await readBody(request), env, store));
    const snapshot = await store.snapshot(writing);
    const catalog = snapshot.catalog;
    if (url.pathname === '/catalog' && !writing) return reply(200, { ...catalog, revision: snapshot.revision });
    const log = /^\/logs\/([a-f0-9-]+)(\/recovery|\/parts\/(\d+))?$/.exec(url.pathname);
    if (log && UUID.test(log[1])) {
      const post = catalog.logs.find(post => post.archiveId === log[1]);
      if (!post) throw new ArchiveError(404, '로그를 찾을 수 없습니다.');
      if (!writing) {
        const file = await store.file(`web-archive/logs/${log[1]}.json`, snapshot.revision, RECORD_BYTES);
        if (!file) throw new ArchiveError(404, '로그를 찾을 수 없습니다.');
        const record = JSON.parse(file.toString('utf8'));
        if (log[3] !== undefined) {
          const part = record.transfer?.parts[Number(log[3])];
          if (!part) throw new ArchiveError(404, '로그 조각을 찾을 수 없습니다.');
          const response = await store.blob(part.sha);
          if (!response) throw new ArchiveError(404, '로그 조각을 찾을 수 없습니다.');
          return new Response(response.body, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
        }
        return reply(200, log[2] ? { recovery: record.recovery } : { post: record.post, source: record.source,
          ...(record.transfer ? { transfer: { parts: record.transfer.parts.map((part, index) => ({ url: `${url.origin}/logs/${log[1]}/parts/${index}`, size: part.size })), envelope: record.transfer.envelope } } : {}) });
      }
      if (request.method === 'DELETE' && !log[2]) {
        catalog.logs = catalog.logs.filter(entry => entry.archiveId !== log[1]);
        const previous = await store.file(`web-archive/logs/${log[1]}.json`, snapshot.revision, RECORD_BYTES);
        const removals = previous ? transferRemovals(JSON.parse(previous.toString('utf8')).transfer) : [];
        await store.commit(snapshot, [{ path: `web-archive/logs/${log[1]}.json`, remove: true }, ...removals], 'Remove live log'); return reply(200, { ok: true });
      }
    }
    if (url.pathname === '/logs' && request.method === 'POST') {
      check(catalog.logs.length < MAX_ITEMS, '로그 개수 제한을 초과했습니다.');
      const input = await readBody(request);
      const record = logRecord(input, crypto.randomUUID());
      if (input.transfer) record.transfer = await verifyTransfer(input.transfer, record.post.encrypted ? 'encrypted-log' : 'log', env);
      if (Buffer.byteLength(JSON.stringify(record)) > RECORD_BYTES) throw new ArchiveError(413, '로그 저장 용량 제한을 초과했습니다.');
      catalog.logs.unshift({ ...record.post, cast: record.post.cast.map(entry => ({ ...entry, iconSrc: '' })) });
      await store.commit(snapshot, [{ path: `web-archive/logs/${record.post.archiveId}.json`, content: JSON.stringify(record) }, ...(record.transfer ? transferFiles(record.transfer) : [])], 'Add live log');
      return reply(201, { post: record.post });
    }
    if (url.pathname === '/legacy-logs/delete' && request.method === 'POST') {
      const input = await readBody(request);
      check(typeof input.fullSlug === 'string' && input.fullSlug.length <= 1000 && input.fullSlug.split('/').length >= 2
        && !/[\\\u0000-\u001f]/.test(input.fullSlug) && !input.fullSlug.split('/').some(part => !part || part === '.' || part === '..'));
      check(catalog.deletedLogs.length < MAX_ITEMS);
      if (!catalog.deletedLogs.includes(input.fullSlug)) catalog.deletedLogs.push(input.fullSlug);
      await store.commit(snapshot, [], 'Hide legacy log'); return reply(200, { ok: true });
    }
    const albumRoute = /^\/albums\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
    if (albumRoute && ID.test(albumRoute[1]) && ['PUT', 'DELETE'].includes(request.method)) {
      const id = albumRoute[1];
      const previous = catalog.albums.find(album => album.id === id);
      const ownedPhotos = (album) => (album?.photos || []).flatMap(photo => {
        const prefix = `${url.origin}/photos/`;
        const key = photo.src.startsWith(prefix) ? photo.src.slice(prefix.length) : '';
        if (!FILE.test(key) || !key.startsWith(`${id}_`)) return [];
        if (!photo.archiveTransfer) return [{ path: `web-archive/photos/${key}`, remove: true }];
        return [{ path: `web-archive/photos/${key}.json`, remove: true }, ...Array.from({ length: photo.archiveTransfer.partCount }, (_, index) => ({ path: `web-archive/parts/${photo.archiveTransfer.uploadId}/${index}`, remove: true }))];
      });
      if (request.method === 'DELETE') {
        check(catalog.deletedAlbums.length < MAX_ITEMS);
        catalog.albums = catalog.albums.filter(album => album.id !== id);
        if (!catalog.deletedAlbums.includes(id)) catalog.deletedAlbums.push(id);
        await store.commit(snapshot, ownedPhotos(previous), 'Remove gallery album'); return reply(200, { ok: true });
      }
      const input = await readBody(request);
      check(input.album?.id === id && Array.isArray(input.files));
      if ((previous?.updatedAt || null) !== input.expectedUpdatedAt) throw new ArchiveError(409, '앨범이 변경됐습니다. 새로고침한 뒤 다시 편집해 주세요.');
      check(previous || catalog.albums.length < MAX_ITEMS);
      const files = [];
      for (const file of input.files) {
        if (!file.transfer) { files.push(photoFile(file, id)); continue; }
        check(ID.test(file.id));
        const transfer = await verifyTransfer(file.transfer, 'photo', env);
        const first = transfer.parts[0];
        check(['png', 'jpg', 'gif', 'webp'].includes(first.imageType));
        const width = first.width || file.width;
        const height = first.height || file.height;
        check(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0, '이미지 파일을 읽을 수 없습니다.');
        const key = `${id}_${file.id}_${first.uploadId}.${first.imageType}`;
        files.push({ key, photoId: file.id, width, height, path: `web-archive/photos/${key}.json`, content: JSON.stringify({ transfer, width, height }),
          archiveTransfer: { uploadId: first.uploadId, partCount: transfer.parts.length }, changes: transferFiles(transfer) });
      }
      check(new Set(files.map(file => file.key)).size === files.length);
      const album = albumRecord(input.album, previous, url.origin, files, { origin: env.SITE_ORIGIN, basePath: env.SITE_BASE_PATH || '' });
      check(files.every(file => album.photos.some(photo => file.photoId === photo.id)));
      catalog.albums = previous ? catalog.albums.map(entry => entry.id === id ? album : entry) : [album, ...catalog.albums];
      catalog.deletedAlbums = catalog.deletedAlbums.filter(entry => entry !== id);
      const retained = new Set(ownedPhotos(album).map(file => file.path));
      const removals = ownedPhotos(previous).filter(file => !retained.has(file.path));
      await store.commit(snapshot, [...files.flatMap(file => [file, ...(file.changes || [])]), ...removals], 'Save gallery album'); return reply(200, { album });
    }
    const photo = /^\/photos\/([^/]+)(?:\/(manifest|parts\/(\d+)))?$/.exec(url.pathname);
    if (photo && FILE.test(photo[1]) && !writing) {
      const available = catalog.albums.flatMap(album => album.photos).find(entry => entry.src === `${url.origin}/photos/${photo[1]}`);
      if (!available) throw new ArchiveError(404, '사진을 찾을 수 없습니다.');
      const types = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
      const imageHeaders = { ...headers, 'Content-Type': types[photo[1].split('.').at(-1)], 'Content-Security-Policy': "default-src 'none'; sandbox" };
      if (!available.archiveTransfer) {
        if (photo[2]) throw new ArchiveError(404, '분할 이미지가 아닙니다.');
        const bytes = await store.file(`web-archive/photos/${photo[1]}`, snapshot.revision, Infinity);
        if (!bytes) throw new ArchiveError(404, '사진을 찾을 수 없습니다.');
        return new Response(bytes, { headers: imageHeaders });
      }
      const file = await store.file(`web-archive/photos/${photo[1]}.json`, snapshot.revision, RECORD_BYTES);
      if (!file) throw new ArchiveError(404, '사진을 찾을 수 없습니다.');
      const manifest = JSON.parse(file.toString('utf8'));
      if (photo[2] === 'manifest') return reply(200, { mime: imageHeaders['Content-Type'], parts: manifest.transfer.parts.map((part, index) => ({ url: `${url.origin}/photos/${photo[1]}/parts/${index}`, size: part.size })) });
      if (photo[3] !== undefined) {
        const part = manifest.transfer.parts[Number(photo[3])];
        if (!part) throw new ArchiveError(404, '사진 조각을 찾을 수 없습니다.');
        const response = await store.blob(part.sha);
        if (!response) throw new ArchiveError(404, '사진 조각을 찾을 수 없습니다.');
        return new Response(response.body, { headers: { ...headers, 'Content-Type': 'application/octet-stream' } });
      }
      // Direct image URLs stream without buffering the complete file. The
      // gallery uses per-part browser requests to avoid Worker subrequest caps.
      async function* stream() {
        for (const part of manifest.transfer.parts) {
          const response = await store.blob(part.sha);
          if (!response) throw new Error('missing part');
          for await (const chunk of response.body) yield chunk;
        }
      }
      const iterator = stream();
      return new Response(new ReadableStream({ async pull(controller) {
        try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(next.value); }
        catch (error) { controller.error(error); }
      }, async cancel() { await iterator.return(); } }), { headers: imageHeaders });
    }
    throw new ArchiveError(404, '자료를 찾을 수 없습니다.');
  } catch (error) {
    if (error instanceof ArchiveError && error.status === 429) headers['Retry-After'] = String(error.retryAfter || 60);
    return reply(error instanceof ArchiveError ? error.status : 500, { error: error instanceof ArchiveError ? error.message : '자료 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}
const worker = { fetch: handleArchive };
export default worker;
