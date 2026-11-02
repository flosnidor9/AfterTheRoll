import assert from 'node:assert/strict';
import test from 'node:test';
import { reorderGalleryPhotos } from '../src/lib/galleryOrder.ts';
import { makeReaderPages } from '../src/lib/galleryPages.ts';

const photo = (id, layout = 'single') => Object.freeze({ id, layout, alt: id, src: `/${id}.png`, copyright: { name: 'Author' } });

test('dragging can insert a photo before or after photos on any other spread', () => {
  const photos = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => photo(id)));
  assert.deepEqual(reorderGalleryPhotos(photos, 'a', 'f', 'after').map((item) => item.id), ['b', 'c', 'd', 'e', 'f', 'a']);
  assert.deepEqual(reorderGalleryPhotos(photos, 'f', 'a', 'before').map((item) => item.id), ['f', 'a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(reorderGalleryPhotos(photos, 'a', 'e', 'before').map((item) => item.id), ['b', 'c', 'd', 'a', 'e', 'f']);
  assert.deepEqual(reorderGalleryPhotos(photos, 'f', 'b', 'after').map((item) => item.id), ['a', 'b', 'f', 'c', 'd', 'e']);
  assert.deepEqual(photos.map((item) => item.id), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('panoramas move as one photo and the page layout follows the new order', () => {
  const photos = [photo('first'), photo('wide', 'spread'), photo('last')];
  const reordered = reorderGalleryPhotos(photos, 'wide', 'last', 'after');
  assert.deepEqual(makeReaderPages(reordered).map((page) => [page.photo?.id, page.wideHalf]), [
    ['first', undefined], ['last', undefined], ['wide', 'left'], ['wide', 'right'],
  ]);
  assert.strictEqual(reordered.at(-1), photos[1]);
  assert.equal(new Set(reordered.map((item) => item.id)).size, photos.length);
});

test('cancelled or unchanged placements preserve the original order', () => {
  const photos = [photo('a'), photo('b'), photo('c')];
  for (const args of [['a', 'a', 'after'], ['missing', 'b', 'before'], ['a', 'missing', 'after'], ['a', 'b', 'before'], ['b', 'a', 'after']]) {
    assert.strictEqual(reorderGalleryPhotos(photos, ...args), photos);
  }
});
