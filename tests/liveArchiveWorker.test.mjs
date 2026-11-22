import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { handleArchive } from '../worker/index.mjs';
import { ArchiveError, createStore } from '../worker/store.mjs';
import { requireAdmin } from '../worker/auth.mjs';
import { logRecord } from '../worker/validation.mjs';
import { ARCHIVE_PART_BYTES } from '../src/lib/archiveTransferProtocol.ts';
import { encryptTrpgLogContent, decryptWithMasterKey } from '../src/lib/trpgUpload.ts';
import { inlineLogMedia } from '../src/lib/liveLogMedia.ts';

const ORIGIN = 'https://archive.example';
const ID = 'ab123456-1234-1234-1234-123456789abc';
const PHOTO_ID = 'cd123456-1234-1234-1234-123456789abc';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=';
const allow = { limit: async () => ({ success: true }) };
const env = { SITE_ORIGIN: ORIGIN, READ_LIMITER: allow, WRITE_LIMITER: allow, UPLOAD_LIMITER: allow, GITHUB_TOKEN: 'test-only-token' };
const draft = () => ({ title: 'Test log', description: '', date: '2026.11.23', tags: [], calendarEventId: 'event', playId: 'play', gmName: '', cast: [],
  format: 'roll20', locked: false, mainChannels: [], whisperChannels: [], sourceHtml: '<p>test</p>' });
const request = (path, method = 'GET', body, token = 'admin') => new Request(`https://worker.example${path}`, {
  method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
function memoryStore() {
  let catalog = { logs: [], albums: [], deletedLogs: [], deletedAlbums: [] };
  let revision = 0;
  const files = new Map();
  const blobs = new Map();
  const commits = [];
  return {
    commits, files,
    async putBlob(content) {
      const bytes = Buffer.from(content, 'base64');
      const sha = Buffer.from(await crypto.subtle.digest('SHA-1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))).toString('hex');
      blobs.set(sha, bytes);
      return sha;
    },
    async blob(sha) { return blobs.has(sha) ? new Response(blobs.get(sha)) : null; },
    async snapshot() { return { revision: String(revision), catalog: structuredClone(catalog) }; },
    async file(path) { return files.get(path) ?? null; },
    async commit(snapshot, changes, message) {
      if (snapshot.revision !== String(revision)) throw new ArchiveError(409, 'conflict');
      for (const change of changes) {
        if (change.remove) files.delete(change.path);
        else files.set(change.path, change.sha ? blobs.get(change.sha) : Buffer.from(change.content, change.base64 ? 'base64' : 'utf8'));
      }
      catalog = structuredClone(snapshot.catalog); revision++;
      commits.push({ changes, message });
    },
  };
}
function context() {
  const store = memoryStore();
  const dependencies = { store, requireAdmin: async request => {
    if (request.headers.get('Authorization') !== 'Bearer admin') throw new ArchiveError(401, 'unauthorized');
    return 'admin';
  } };
  return { store, call: (req, bindings = env) => handleArchive(req, bindings, dependencies) };
}

async function stage(call, bytes, kind) {
  const uploadId = crypto.randomUUID();
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += ARCHIVE_PART_BYTES) {
    const response = await call(request('/chunks', 'POST', { uploadId, index: parts.length, kind,
      content: bytes.subarray(offset, offset + ARCHIVE_PART_BYTES).toString('base64'),
      totalBytes: bytes.length, totalParts: Math.ceil(bytes.length / ARCHIVE_PART_BYTES) }));
    assert.equal(response.status, 201, await response.clone().text());
    parts.push(await response.json());
  }
  return { parts };
}

test('anonymous and ordinary accounts cannot write or obtain password recovery', async () => {
  const { call, store } = context();
  for (const token of ['', 'reader']) {
    for (const req of [request('/logs', 'POST', { draft: draft() }, token), request(`/logs/${ID}`, 'DELETE', undefined, token),
      request(`/albums/${ID}`, 'PUT', { album: {} }, token), request(`/logs/${ID}/recovery`, 'GET', undefined, token)]) {
      assert.equal((await call(req)).status, 401);
    }
  }
  assert.equal(store.commits.length, 0);
});

test('locked source and recovery stay encrypted; recovery is never in the public API', async () => {
  const { call, store } = context();
  const source = await encryptTrpgLogContent(JSON.stringify({ version: 1, html: 'PRIVATE CONTENT', cast: [{ iconSrc: 'PRIVATE IMAGE' }] }), 'test password');
  const recovery = await encryptTrpgLogContent(JSON.stringify({ password: 'test password' }), 'master password');
  const added = await call(request('/logs', 'POST', { draft: { ...draft(), locked: true, sourceHtml: source, cast: [{ plName: '', pcName: '', iconSrc: 'https://private.example/image.png' }] }, recovery }));
  assert.equal(added.status, 201);
  const { post } = await added.json();
  assert.equal(post.cast[0].iconSrc, '');
  for (const path of ['/catalog', `/logs/${post.archiveId}`]) {
    const response = await call(request(path, 'GET', undefined, ''));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const content = await response.text();
    assert.ok(!content.includes('PRIVATE CONTENT') && !content.includes('PRIVATE IMAGE') && !content.includes('test password') && !content.includes('recovery'));
  }
  const recovered = await call(request(`/logs/${post.archiveId}/recovery`));
  assert.deepEqual(await recovered.json(), { recovery });
  assert.equal(store.commits.length, 1);
  assert.ok(store.commits.every(commit => !commit.changes.some(file => /passwords\.enc|public\//.test(file.path))));
});

test('locked log refuses plaintext or invalid encryption envelopes', async () => {
  const { call } = context();
  for (const sourceHtml of ['<p>private</p>', JSON.stringify({ salt: 'fake' })]) {
    assert.equal((await call(request('/logs', 'POST', { draft: { ...draft(), locked: true, sourceHtml } }))).status, 400);
  }
});

test('deleted live logs cannot be read and their current file is removed', async () => {
  const { call, store } = context();
  const { post } = await (await call(request('/logs', 'POST', { draft: draft() }))).json();
  assert.equal((await call(request(`/logs/${post.archiveId}`, 'DELETE'))).status, 200);
  assert.equal((await call(request(`/logs/${post.archiveId}`, 'GET', undefined, ''))).status, 404);
  assert.equal((await call(request(`/logs/${post.archiveId}/recovery`))).status, 404);
  assert.equal(store.files.has(`web-archive/logs/${post.archiveId}.json`), false);
});

test('gallery stores real images, rejects stale editing and revokes deleted image URLs', async () => {
  const { call, store } = context();
  const album = { id: ID, title: 'Album', photos: [{ id: PHOTO_ID, src: '/images/gallery/unused.png', alt: 'Photo', copyright: { name: '' }, createdAt: '2026-11-23' }], createdAt: '2026-11-23' };
  const input = { album, files: [{ id: PHOTO_ID, content: PNG }], expectedUpdatedAt: null };
  const response = await call(request(`/albums/${ID}`, 'PUT', input));
  assert.equal(response.status, 200);
  const saved = (await response.json()).album;
  assert.equal(saved.photos[0].width, 1);
  const imagePath = new URL(saved.photos[0].src).pathname;
  const image = await call(request(imagePath));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.equal((await call(request(`/albums/${ID}`, 'PUT', input))).status, 409);
  assert.equal((await call(request(`/albums/${ID}`, 'DELETE'))).status, 200);
  assert.equal((await call(request(imagePath))).status, 404);
  assert.equal([...store.files.keys()].some(path => path.includes('/photos/')), false);
});

test('gallery rejects disguised HTML, arbitrary import paths and duplicate IDs', async () => {
  const { call } = context();
  const album = { id: ID, title: 'Album', photos: [{ id: PHOTO_ID, src: 'https://outside.example/secret', alt: '', copyright: { name: '' }, createdAt: '' }], createdAt: '' };
  for (const content of [Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')]) {
    assert.equal((await call(request(`/albums/${ID}`, 'PUT', { album, expectedUpdatedAt: null, files: [{ id: PHOTO_ID, content }] }))).status, 400);
  }
  assert.equal((await call(request(`/albums/${ID}`, 'PUT', { album, expectedUpdatedAt: null, files: [] }))).status, 400);
  assert.equal((await call(request(`/albums/${ID}`, 'PUT', { album: { ...album, photos: [album.photos[0], album.photos[0]] }, expectedUpdatedAt: null, files: [{ id: PHOTO_ID, content: PNG }] }))).status, 400);
});

test('editing legacy albums from development preserves the deployed image address', async () => {
  const { call } = context();
  const album = { id: ID, title: 'Legacy', createdAt: '', photos: [{ id: PHOTO_ID, src: '/trpg-logs/images/gallery/album/photo.png', alt: '', copyright: { name: '' }, createdAt: '', width: 640, height: 480 }] };
  const response = await call(request(`/albums/${ID}`, 'PUT', { album, expectedUpdatedAt: null, files: [] }), { ...env, SITE_BASE_PATH: '/AfterTheRoll' });
  assert.equal(response.status, 200);
  const saved = (await response.json()).album.photos[0];
  assert.equal(saved.src, `${ORIGIN}/AfterTheRoll/images/gallery/album/photo.png`);
  assert.equal(saved.width, 640);
  assert.equal(saved.height, 480);
});

test('cross-origin requests, invalid repo paths and missing limit bindings fail closed', async () => {
  const { call, store } = context();
  const foreign = request('/logs', 'POST', { draft: draft() }); foreign.headers.set('Origin', 'https://evil.example');
  assert.equal((await call(foreign)).status, 403);
  assert.equal((await call(request('/catalog'), { ...env, READ_LIMITER: undefined })).status, 503);
  assert.equal((await call(request('/catalog'), { ...env, READ_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
  for (const path of ['/files/passwords.enc.json', '/logs/not-an-id', '/photos/unknown.png']) assert.equal((await call(request(path))).status, 404);
  assert.equal(store.commits.length, 0);
});

test('real GitHub adapter writes only the independent content branch and rejects concurrent updates', async () => {
  const requests = [];
  const fetcher = async (url, init) => {
    assert.equal(init.redirect, 'manual', 'Workers supports manual/follow redirects; credentials must not follow redirects');
    requests.push({ url, init });
    const path = new URL(url).pathname;
    if (path.endsWith('/git/ref/heads/web-archive')) return Response.json({ object: { sha: 'parent' } });
    if (path.includes('/contents/')) return new Response(null, { status: 404 });
    if (path.endsWith('/git/commits/parent')) return Response.json({ tree: { sha: 'tree' } });
    if (path.endsWith('/git/blobs')) return Response.json({ sha: 'blob' });
    if (path.endsWith('/git/trees')) return Response.json({ sha: 'tree2' });
    if (path.endsWith('/git/commits')) return Response.json({ sha: 'commit' });
    if (path.endsWith('/git/refs/heads/web-archive')) return new Response(JSON.stringify({ message: 'SECRET GITHUB ERROR' }), { status: 422 });
    throw new Error(`Unexpected test path ${path}`);
  };
  const store = createStore({ GITHUB_REPOSITORY: 'owner/content', GITHUB_TOKEN: 'test-only-secret' }, fetcher);
  const snapshot = await store.snapshot(true);
  await assert.rejects(store.commit(snapshot, [], 'Save'), error => error.status === 409 && !error.message.includes('SECRET'));
  const update = requests.find(request => request.init.method === 'PATCH');
  assert.ok(update.url.endsWith('/git/refs/heads/web-archive'));
  assert.equal(JSON.parse(update.init.body).force, false);
  assert.ok(!requests.some(request => /dispatch|refs\/heads\/(main|incoming)$/.test(request.url)));
});

test('Firebase verification checks signature, project, admin UID, expiry and revocation', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'archive-test-key' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: 'project', iss: 'https://securetoken.google.com/project', sub: 'admin-uid', exp: now + 3600, iat: now, auth_time: now,
    email_verified: true, firebase: { sign_in_provider: 'google.com' } };
  const bindings = { FIREBASE_PROJECT_ID: 'project', ADMIN_UID: 'admin-uid', FIREBASE_API_KEY: 'test-key' };
  const signed = async value => {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(`${head}.${payload}`));
    return `${head}.${payload}.${Buffer.from(signature).toString('base64url')}`;
  };
  let revoked = false;
  const fetcher = async url => url.includes('service_accounts') ? Response.json({ keys: [jwk] })
    : Response.json({ users: [{ localId: 'admin-uid', emailVerified: true, validSince: String(revoked ? now + 1 : now - 1) }] });
  const verify = async token => requireAdmin(request('/logs', 'POST', {}, token), bindings, fetcher);
  assert.equal(await verify(await signed(claims)), 'admin-uid');
  for (const changes of [{ aud: 'another-project' }, { sub: 'reader' }, { exp: now - 1 }, { email_verified: false }, { firebase: { sign_in_provider: 'password' } }]) {
    await assert.rejects(verify(await signed({ ...claims, ...changes })), error => error.status === 401);
  }
  const valid = await signed(claims);
  const segments = valid.split('.');
  const changedSignature = Buffer.from(segments[2], 'base64url'); changedSignature[0] ^= 1;
  await assert.rejects(verify(`${segments[0]}.${segments[1]}.${changedSignature.toString('base64url')}`), error => error.status === 401);
  revoked = true;
  await assert.rejects(verify(valid), error => error.status === 401);
});

test('an absent live branch verifies access to main and does not conceal inaccessible private repositories', async () => {
  const bindings = { GITHUB_REPOSITORY: 'owner/content', GITHUB_TOKEN: 'test-only' };
  const requests = [];
  const store = createStore(bindings, async (url, init) => {
    requests.push({ url, init });
    return url.endsWith('/git/ref/heads/main') ? Response.json({ object: { sha: 'main-head' } }) : new Response(null, { status: 404 });
  });
  assert.equal((await store.snapshot()).revision, null);
  assert.ok(requests.every(request => request.init.method === 'GET'));
  const inaccessible = createStore(bindings, async () => new Response(null, { status: 404 }));
  await assert.rejects(inaccessible.snapshot(), error => error.status === 503);
  const redirect = createStore(bindings, async () => new Response(null, { status: 302, headers: { Location: 'https://outside.example' } }));
  await assert.rejects(redirect.snapshot(), error => error.status === 502);
});

test('source format and metadata cannot inject arbitrary fields into stored records', () => {
  const record = logRecord({ draft: { ...draft(), format: 'cinematic', sourceFormat: 'ccfolia', arbitraryToken: 'never-store' } }, ID);
  assert.equal(record.post.sourceFormat, 'ccfolia');
  assert.ok(!JSON.stringify(record).includes('never-store'));
});

test('local attachments and cast pictures survive encrypted upload without separate public files', async () => {
  const portable = inlineLogMedia({ ...draft(), locked: true, sourceHtml: '<img src="media/portrait.png">',
    mediaFiles: [{ name: 'portrait.png', content: PNG }], cast: [{ plName: 'Player', pcName: 'Character', iconSrc: 'media/portrait.png' }] });
  assert.equal(portable.mediaFiles, undefined);
  assert.ok(portable.sourceHtml.includes(`data:image/png;base64,${PNG}`));
  assert.equal(portable.cast[0].iconSrc, `data:image/png;base64,${PNG}`);
  const source = await encryptTrpgLogContent(JSON.stringify({ version: 1, html: portable.sourceHtml, cast: portable.cast }), 'secret');
  assert.ok(!source.includes(PNG) && !source.includes('portrait.png'));
  const unpacked = JSON.parse(await decryptWithMasterKey(JSON.parse(source), 'secret'));
  assert.equal(unpacked.html, portable.sourceHtml);
  assert.deepEqual(unpacked.cast, portable.cast);
  await assert.rejects(decryptWithMasterKey(JSON.parse(source), 'wrong password'));
});

test('logs larger than the former 16MiB limit publish and download through authenticated chunks', async () => {
  const { call, store } = context();
  const bytes = Buffer.from(JSON.stringify({ version: 1, html: '가'.repeat(6 * 1024 * 1024), cast: [] }));
  assert.ok(bytes.length > 16 * 1024 * 1024);
  const transfer = await stage(call, bytes, 'log');
  const added = await call(request('/logs', 'POST', { draft: { ...draft(), sourceHtml: '' }, transfer }));
  assert.equal(added.status, 201);
  const { post } = await added.json();
  const record = await (await call(request(`/logs/${post.archiveId}`, 'GET', undefined, ''))).json();
  assert.equal(record.source, undefined);
  const chunks = [];
  for (const part of record.transfer.parts) {
    const response = await call(request(new URL(part.url).pathname, 'GET', undefined, ''));
    assert.equal(response.status, 200);
    chunks.push(Buffer.from(await response.arrayBuffer()));
  }
  assert.deepEqual(Buffer.concat(chunks), bytes);
  assert.equal(store.commits.length, 1, 'chunks do not publish or trigger commits individually');
  await call(request(`/logs/${post.archiveId}`, 'DELETE'));
  assert.equal((await call(request(new URL(record.transfer.parts[0].url).pathname))).status, 404);
  assert.ok(![...store.files.keys()].some(path => path.includes('/parts/')));
});

test('images larger than the former 5MiB limit publish, stream and revoke all chunks on deletion', async () => {
  const { call, store } = context();
  const bytes = Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(6 * 1024 * 1024)]);
  const transfer = await stage(call, bytes, 'photo');
  const album = { id: ID, title: 'Large photo', createdAt: '', photos: [{ id: PHOTO_ID, src: '', alt: '', copyright: { name: '' }, createdAt: '' }] };
  const saved = await call(request(`/albums/${ID}`, 'PUT', { album, files: [{ id: PHOTO_ID, transfer }], expectedUpdatedAt: null }));
  assert.equal(saved.status, 200, await saved.clone().text());
  const path = new URL((await saved.json()).album.photos[0].src).pathname;
  const manifest = await (await call(request(`${path}/manifest`))).json();
  const pieces = [];
  for (const part of manifest.parts) {
    const response = await call(request(new URL(part.url).pathname));
    assert.equal(response.status, 200);
    pieces.push(Buffer.from(await response.arrayBuffer()));
  }
  assert.deepEqual(Buffer.concat(pieces), bytes);
  assert.deepEqual(Buffer.from(await (await call(request(path))).arrayBuffer()), bytes);
  await call(request(`/albums/${ID}`, 'DELETE'));
  assert.equal((await call(request(new URL(manifest.parts[0].url).pathname))).status, 404);
  assert.ok(![...store.files.keys()].some(path => /\/(parts|photos)\//.test(path)));
});

test('unpublished, missing, reordered, altered and mismatched chunks cannot expose private blobs', async () => {
  const { call, store } = context();
  const bytes = Buffer.from('x'.repeat(ARCHIVE_PART_BYTES + 10));
  const transfer = await stage(call, bytes, 'log');
  assert.equal(store.commits.length, 0);
  assert.equal((await call(request(`/blobs/${transfer.parts[0].sha}`))).status, 404);
  const cases = [
    { parts: transfer.parts.slice(0, -1) },
    { parts: [...transfer.parts].reverse() },
    { parts: transfer.parts.map((part, index) => index ? part : { ...part, sha: 'a'.repeat(40) }) },
    { parts: transfer.parts.map(part => ({ ...part, kind: 'encrypted-log' })) },
  ];
  for (const invalid of cases) assert.equal((await call(request('/logs', 'POST', { draft: draft(), transfer: invalid }))).status, 400);
  assert.equal((await call(request('/chunks', 'POST', {}, 'reader'))).status, 401);
  assert.equal(store.commits.length, 0);
});

test('encrypted multi-part logs preserve browser decryption and do not publish recovery data', async () => {
  const { call } = context();
  const payload = JSON.stringify({ version: 1, html: 'secret '.repeat(ARCHIVE_PART_BYTES / 2), cast: [] });
  const encrypted = JSON.parse(await encryptTrpgLogContent(payload, 'password'));
  const transfer = await stage(call, Buffer.from(encrypted.ciphertext), 'encrypted-log');
  transfer.envelope = { salt: encrypted.salt, iv: encrypted.iv, authTag: encrypted.authTag };
  const recovery = await encryptTrpgLogContent(JSON.stringify({ password: 'password' }), 'master');
  const response = await call(request('/logs', 'POST', { draft: { ...draft(), locked: true, sourceHtml: '' }, transfer, recovery }));
  assert.equal(response.status, 201, await response.clone().text());
  const { post } = await response.json();
  const record = await (await call(request(`/logs/${post.archiveId}`))).json();
  assert.equal(record.recovery, undefined);
  const chunks = [];
  for (const part of record.transfer.parts) chunks.push(await (await call(request(new URL(part.url).pathname))).text());
  const decrypted = await decryptWithMasterKey({ ...record.transfer.envelope, ciphertext: chunks.join('') }, 'password');
  assert.equal(decrypted, payload);
});
