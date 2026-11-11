import assert from 'node:assert/strict';
import test from 'node:test';
import { paginateEntries } from '../src/lib/trpgLogPagination.ts';

const entry = (id, contentHtml) => ({ id, speaker: 'GM', contentHtml, kind: 'chat', isAside: false, isWhisper: false, avatarSrc: null });

test('embedded image size never pushes surrounding dialogue onto separate pages', () => {
  const source = [entry('before', 'Before the image'), entry('image', '<img src="small.png" alt="Scene">'), entry('after', 'After the image')];
  const embedded = source.map(item => item.id === 'image' ? { ...item, contentHtml: `<img src="data:image/png;base64,${'a'.repeat(300000)}" alt="Scene">` } : item);
  const ids = pages => pages.map(page => page.map(item => item.id));
  assert.deepEqual(ids(paginateEntries(embedded)), ids(paginateEntries(source)));
  assert.equal(paginateEntries(embedded).length, 1);
});

test('roll export attributes, styles and whitespace do not count as reading material', () => {
  const source = Array.from({ length: 40 }, (_, i) => entry(String(i), `<table><tr><td title="Formula > ${'x'.repeat(4000)}"><span>25</span>${'\n '.repeat(1000)}</td></tr></table>`));
  assert.equal(paginateEntries(source).length, 1);
});

test('long text and message count still bound pages without dropping or duplicating entries', () => {
  for (const source of [
    Array.from({ length: 170 }, (_, i) => entry(String(i), 'Short line')),
    Array.from({ length: 20 }, (_, i) => entry(String(i), 'Long dialogue. '.repeat(200))),
    [entry('large', 'x'.repeat(20000)), entry('next', 'Next line')],
  ]) {
    const before = structuredClone(source);
    const pages = paginateEntries(source);
    assert.ok(pages.length > 1);
    assert.ok(pages.every(page => page.length > 0 && page.length <= 80));
    assert.deepEqual(pages.flat(), source);
    assert.deepEqual(source, before);
  }
  assert.deepEqual(paginateEntries([]), []);
});
