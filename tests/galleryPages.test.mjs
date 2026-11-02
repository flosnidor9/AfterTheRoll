import assert from 'node:assert/strict';
import test from 'node:test';
import { makeReaderPages } from '../src/lib/galleryPages.ts';
import { createGalleryAlbum } from '../src/lib/galleryUpload.ts';

const photo = (id, extra = {}) => ({ id, src: `/images/gallery/${id}.png`, alt: id, copyright: { name: '' }, createdAt: '', width: 900, height: 1200, ...extra });

test('panoramas keep the chosen order and begin on a left page', () => {
  const photos = [photo('first'), photo('wide', { layout: 'spread' }), photo('last')];
  const before = structuredClone(photos);
  const pages = makeReaderPages(photos);
  assert.deepEqual(pages.map((page) => [page.photo?.id, page.wideHalf]), [
    ['first', undefined], [undefined, undefined], ['wide', 'left'], ['wide', 'right'], ['last', undefined],
  ]);
  assert.deepEqual(photos, before);
  const reordered = makeReaderPages([photos[1], photos[0], photos[2]]);
  assert.deepEqual(reordered.map((page) => page.photo?.id), ['wide', 'wide', 'first', 'last']);
});

test('legacy dimensions, consecutive panoramas, and empty albums share the reader layout', () => {
  assert.deepEqual(makeReaderPages([]), []);
  const wide = photo('wide', { width: undefined, height: undefined });
  const pages = makeReaderPages([wide, photo('wide2', { width: 2000, height: 900 })], { wide: { width: 1800, height: 900 } });
  assert.deepEqual(pages.map((page) => page.wideHalf), ['left', 'right', 'left', 'right']);
  assert.equal(makeReaderPages([photo('single', { width: 2000, height: 900, layout: 'single' })]).length, 1);
});

test('creating a reordered album keeps each uploaded file at its own photo path', async (context) => {
  const first = photo('first');
  const second = photo('second');
  const blobs = new Map();
  let tree;
  context.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    let result;
    if (url.includes('/contents/')) result = { content: btoa('{"albums":[]}') };
    else if (url.includes('/git/ref/heads/')) result = { object: { sha: 'head' } };
    else if (url.includes('/git/commits/head')) result = { tree: { sha: 'base' } };
    else if (url.endsWith('/git/blobs')) {
      const sha = `blob-${blobs.size}`;
      blobs.set(sha, body);
      result = { sha };
    } else if (url.endsWith('/git/trees')) {
      tree = body.tree;
      result = { sha: 'tree' };
    } else result = { sha: 'commit' };
    return Response.json(result);
  });
  await createGalleryAlbum('test-token', { id: 'album', title: 'Album', photos: [second, first], createdAt: '', updatedAt: '' }, [
    { photo: first, file: new File(['first-image'], 'first.png') },
    { photo: second, file: new File(['second-image'], 'second.png') },
  ]);
  const stored = (path) => blobs.get(tree.find((entry) => entry.path === path).sha).content;
  assert.equal(atob(stored(`public${first.src}`)), 'first-image');
  assert.equal(atob(stored(`public${second.src}`)), 'second-image');
  assert.deepEqual(JSON.parse(stored('public/gallery/gallery.json')).albums[0].photos.map((item) => item.id), ['second', 'first']);
});
