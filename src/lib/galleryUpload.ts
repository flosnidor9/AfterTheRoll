import type { GalleryAlbum, GalleryPhoto } from '@/lib/data/gallery';

const REPOSITORY = 'flosnidor9/Trpg-Logs';
const BRANCH = 'incoming';
const MAIN_BRANCH = 'main';
const ARCHIVE_PATH = 'public/gallery/gallery.json';
const RETRIES = 3;
type UploadFile = { path: string; content: string; encoding: 'base64' | 'utf-8' };

const api = (path: string) => `https://api.github.com/repos/${REPOSITORY}${path}`;
const headers = (token: string) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` });
const encoded = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\n/g, '')), (char) => char.charCodeAt(0)));
async function base64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function ref(token: string, branch: string) {
  const response = await fetch(api(`/git/ref/heads/${branch}`), { headers: headers(token) });
  if (response.status === 404) return null;
  const body = await response.json() as { object?: { sha?: string } };
  if (!response.ok || !body.object?.sha) throw new Error('GitHub 브랜치를 불러오지 못했습니다.');
  return body.object.sha;
}
async function head(token: string) {
  const existing = await ref(token, BRANCH); if (existing) return existing;
  const main = await ref(token, MAIN_BRANCH); if (!main) throw new Error('main 브랜치를 찾을 수 없습니다.');
  const response = await fetch(api('/git/refs'), { method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: main }) });
  if (response.ok) return main;
  const concurrent = await ref(token, BRANCH); if (concurrent) return concurrent;
  throw new Error('업로드 브랜치를 만들지 못했습니다.');
}
async function readArchive(token: string): Promise<GalleryAlbum[]> {
  const response = await fetch(api(`/contents/${ARCHIVE_PATH}`), { headers: headers(token) });
  if (response.status === 404) return [];
  const body = await response.json() as { content?: string };
  if (!response.ok || !body.content) throw new Error('기존 갤러리를 불러오지 못했습니다.');
  const archive = JSON.parse(encoded(body.content)) as { albums?: GalleryAlbum[] };
  return Array.isArray(archive.albums) ? archive.albums : [];
}
async function commit(token: string, files: UploadFile[], message: string, removals: string[] = []) {
  const parentSha = await head(token); const requestHeaders = { ...headers(token), 'Content-Type': 'application/json' };
  const parentResponse = await fetch(api(`/git/commits/${parentSha}`), { headers: requestHeaders });
  const parent = await parentResponse.json() as { tree?: { sha?: string } };
  if (!parentResponse.ok || !parent.tree?.sha) throw new Error('업로드 기준 커밋을 불러오지 못했습니다.');
  const tree = [] as Array<{ path: string; mode: string; type: string; sha: string | null }>;
  for (const file of files) {
    const response = await fetch(api('/git/blobs'), { method: 'POST', headers: requestHeaders, body: JSON.stringify({ content: file.content, encoding: file.encoding }) });
    const blob = await response.json() as { sha?: string }; if (!response.ok || !blob.sha) throw new Error(`파일을 저장하지 못했습니다: ${file.path}`);
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  removals.forEach((path) => tree.push({ path, mode: '100644', type: 'blob', sha: null }));
  const treeResponse = await fetch(api('/git/trees'), { method: 'POST', headers: requestHeaders, body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
  const nextTree = await treeResponse.json() as { sha?: string }; if (!treeResponse.ok || !nextTree.sha) throw new Error('업로드 트리를 만들지 못했습니다.');
  const commitResponse = await fetch(api('/git/commits'), { method: 'POST', headers: requestHeaders, body: JSON.stringify({ message, tree: nextTree.sha, parents: [parentSha] }) });
  const next = await commitResponse.json() as { sha?: string }; if (!commitResponse.ok || !next.sha) throw new Error('업로드 커밋을 만들지 못했습니다.');
  const update = await fetch(api(`/git/refs/heads/${BRANCH}`), { method: 'PATCH', headers: requestHeaders, body: JSON.stringify({ sha: next.sha, force: false }) });
  return update.ok && update.status !== 422;
}
async function persist(token: string, albums: GalleryAlbum[], files: UploadFile[], message: string, removals: string[] = []) {
  const all = [...files, { path: ARCHIVE_PATH, content: JSON.stringify({ albums }, null, 2), encoding: 'utf-8' as const }];
  for (let attempt = 0; attempt < RETRIES; attempt += 1) if (await commit(token, all, message, removals)) return;
  throw new Error('다른 저장 작업과 충돌했습니다. 잠시 후 다시 시도해 주세요.');
}
export async function createGalleryAlbum(token: string, album: GalleryAlbum, files: Array<{ photo: GalleryPhoto; file: File }>) {
  const albums = await readArchive(token); if (albums.some((entry) => entry.id === album.id)) throw new Error('같은 앨범 ID가 이미 있습니다.');
  const uploadFiles = await Promise.all(files.map(async ({ photo, file }) => ({ path: `public${photo.src}`, content: await base64(file), encoding: 'base64' as const })));
  await persist(token, [album, ...albums], uploadFiles, `Add gallery album: ${album.title}`);
}
export async function updateGalleryAlbum(token: string, album: GalleryAlbum, newPhotos: Array<{ photo: GalleryPhoto; file: File }>) {
  const albums = await readArchive(token); const previous = albums.find((entry) => entry.id === album.id);
  if (!previous) throw new Error('수정할 앨범을 찾을 수 없습니다.');
  // Development reads assets through /trpg-logs/images, while the archive must
  // always retain the portable /images/gallery path.
  const storedAlbum: GalleryAlbum = {
    ...album,
    photos: album.photos.map((photo) => ({
      ...photo,
      src: previous.photos.find((existing) => existing.id === photo.id)?.src ?? photo.src,
    })),
  };
  const uploadFiles = await Promise.all(newPhotos.map(async ({ photo, file }) => ({ path: `public${photo.src}`, content: await base64(file), encoding: 'base64' as const })));
  const photoIds = new Set(storedAlbum.photos.map((photo) => photo.id));
  const removals = previous.photos.filter((photo) => !photoIds.has(photo.id)).map((photo) => `public${photo.src}`);
  await persist(token, albums.map((entry) => entry.id === album.id ? storedAlbum : entry), uploadFiles, `Update gallery album: ${album.title}`, removals);
}
export async function deleteGalleryAlbum(token: string, album: GalleryAlbum) {
  const albums = await readArchive(token); const previous = albums.find((entry) => entry.id === album.id);
  if (!previous) throw new Error('삭제할 앨범을 찾을 수 없습니다.');
  await persist(token, albums.filter((entry) => entry.id !== album.id), [], `Delete gallery album: ${album.title}`, previous.photos.map((photo) => `public${photo.src}`));
}
export function galleryPhotoPath(albumId: string, photoId: string, file: File) {
  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.webp';
  return `/images/gallery/${albumId}/${photoId}${extension}`;
}
