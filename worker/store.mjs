import { Buffer } from 'node:buffer';

const ROOT = 'web-archive';
const BRANCH = 'web-archive';
const INDEX = `${ROOT}/index.json`;
const INDEX_BYTES = 4 * 1024 * 1024;
const EMPTY = () => ({ logs: [], albums: [], deletedLogs: [], deletedAlbums: [] });

export class ArchiveError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// The branch is deliberately separate from main/incoming: content changes must
// not trigger the existing log-processing and Pages deployment workflows.
export function createStore(env, fetcher = fetch) {
  const repository = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !env.GITHUB_TOKEN) throw new ArchiveError(503, '저장소 연결을 확인해 주세요.');
  async function api(path, body, method = body === undefined ? 'GET' : 'POST', raw = false) {
    const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, {
      method, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'afterroll-archive', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000), redirect: 'manual',
    });
    if (response.status === 404 && method === 'GET') return null;
    if (response.status === 429 || response.status === 403 && (response.headers.has('Retry-After') || response.headers.get('X-RateLimit-Remaining') === '0')) {
      const error = new ArchiveError(429, 'GitHub 요청 한도로 잠시 기다리고 있습니다.');
      const untilReset = Number(response.headers.get('X-RateLimit-Reset')) - Math.floor(Date.now() / 1000);
      error.retryAfter = Math.max(1, Number(response.headers.get('Retry-After')) || untilReset || 60);
      throw error;
    }
    if (response.status === 409 || response.status === 422) throw new ArchiveError(409, '다른 저장 작업이 먼저 반영됐습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.');
    if (!response.ok) throw new ArchiveError(502, 'GitHub 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return response;
  }
  async function json(path, body, method) { const response = await api(path, body, method); return response ? response.json() : null; }
  async function head(create = false) {
    let ref = await json(`/git/ref/heads/${BRANCH}`);
    if (!ref) {
      const main = await json('/git/ref/heads/main');
      if (!main?.object?.sha) throw new ArchiveError(503, '로그 저장소의 접근 권한과 main 브랜치를 확인해 주세요.');
      if (create) ref = await json('/git/refs', { ref: `refs/heads/${BRANCH}`, sha: main.object.sha });
    }
    return ref?.object?.sha ?? null;
  }
  async function file(path, ref = BRANCH, maxBytes = INDEX_BYTES) {
    const response = await api(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, undefined, 'GET', true);
    if (!response) return null;
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new ArchiveError(413, '저장된 자료의 용량 제한을 초과했습니다.');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  async function snapshot(create = false) {
    const revision = await head(create);
    const data = revision ? await file(INDEX, revision) : null;
    const catalog = data ? JSON.parse(data.toString('utf8')) : EMPTY();
    if (!catalog || !['logs', 'albums', 'deletedLogs', 'deletedAlbums'].every(key => Array.isArray(catalog[key]))) throw new ArchiveError(502, '저장된 목록 형식을 확인해 주세요.');
    return { revision, catalog };
  }
  async function commit(snapshot, files, message) {
    if (!snapshot.revision) throw new ArchiveError(503, '저장 브랜치가 준비되지 않았습니다.');
    const serialized = JSON.stringify(snapshot.catalog);
    if (Buffer.byteLength(serialized) > INDEX_BYTES) throw new ArchiveError(413, '목록 저장 한도를 초과했습니다.');
    const parent = await json(`/git/commits/${snapshot.revision}`);
    const tree = [];
    for (const file of [...files, { path: INDEX, content: serialized }]) {
      if (file.remove) { tree.push({ path: file.path, mode: '100644', type: 'blob', sha: null }); continue; }
      if (file.sha) { tree.push({ path: file.path, mode: '100644', type: 'blob', sha: file.sha }); continue; }
      const blob = await json('/git/blobs', { content: file.content, encoding: file.base64 ? 'base64' : 'utf-8' });
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const nextTree = await json('/git/trees', { base_tree: parent.tree.sha, tree });
    const next = await json('/git/commits', { message, tree: nextTree.sha, parents: [snapshot.revision] });
    await json(`/git/refs/heads/${BRANCH}`, { sha: next.sha, force: false }, 'PATCH');
    return next.sha;
  }
  async function putBlob(content) { return (await json('/git/blobs', { content, encoding: 'base64' })).sha; }
  async function blob(sha) { return api(`/git/blobs/${sha}`, undefined, 'GET', true); }
  return { snapshot, commit, file, putBlob, blob };
}
