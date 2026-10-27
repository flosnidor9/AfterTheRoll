import assert from 'node:assert/strict';
import test from 'node:test';
import { createCinematicEntries, createReaderEntries, resolveRoll20Continuations, findPlaybackPage, findTopPlaybackIndex, mergeConsecutiveCharacterEntries, pinnedToolbarTop, playbackLineId } from '../src/lib/trpgLogPlayback.ts';

const message = (id, overrides = {}) => ({
  id,
  speaker: 'Character',
  avatarSrc: '/neutral.png',
  contentHtml: `Message ${id}`,
  kind: 'chat',
  isAside: false,
  isWhisper: false,
  ...overrides,
});

test('reading view grouping never changes or duplicates source playback messages', () => {
  const source = [message('one'), message('two'), message('three')].map(Object.freeze);
  const before = structuredClone(source);
  const first = mergeConsecutiveCharacterEntries(source);
  const second = mergeConsecutiveCharacterEntries(source);
  assert.equal(first.length, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.deepEqual(createCinematicEntries(source, {}).map((entry) => entry.contentHtml), before.map((entry) => entry.contentHtml));
});

test('same speaker with different expressions stays in separate reading view groups', () => {
  const source = [message('one'), message('two', { avatarSrc: '/smile.png' }), message('three', { avatarSrc: '/smile.png' })];
  const grouped = mergeConsecutiveCharacterEntries(source);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].contentHtml, 'Message one');
  assert.equal(grouped[1].avatarSrc, '/smile.png');
});

test('CCA original message lines play separately with their corresponding expression', () => {
  const source = [
    message('one', { cinematicLines: ['First line', 'Second<br>line'] }),
    message('two', { avatarSrc: '/smile.png', cinematicLines: ['Third line', 'Fourth line'] }),
  ];
  mergeConsecutiveCharacterEntries(source);
  const playback = createCinematicEntries(source, { Character: '/fallback.png' });
  assert.deepEqual(playback.map(({ contentHtml, avatarSrc }) => [contentHtml, avatarSrc]), [
    ['First line', '/neutral.png'],
    ['Second<br>line', '/neutral.png'],
    ['Third line', '/smile.png'],
    ['Fourth line', '/smile.png'],
  ]);
  assert.equal(new Set(playback.map((entry) => entry.id)).size, playback.length);
});

test('ordinary multi-line messages keep their line breaks and only missing portraits use a fallback', () => {
  const source = [message('one', { avatarSrc: null, contentHtml: 'First\nSecond<br>Third', preserveLineBreaks: true })];
  const playback = createCinematicEntries(source, { Character: '/fallback.png' });
  assert.equal(playback.length, 1);
  assert.equal(playback[0].contentHtml, source[0].contentHtml);
  assert.equal(playback[0].preserveLineBreaks, true);
  assert.equal(playback[0].avatarSrc, '/fallback.png');
});

test('aside and whisper messages stay outside cinematic playback', () => {
  assert.equal(createCinematicEntries([message('one', { isAside: true }), message('two', { isWhisper: true })], {}).length, 0);
});

test('playback returns to the page containing the original message inside a merged group', () => {
  const source = [message('one'), message('two'), message('three', { speaker: 'Other' })];
  const reading = createReaderEntries(source);
  const pages = [[reading[0]], [reading[1]]];
  assert.deepEqual(reading[0].sourceEntryIds, ['one', 'two']);
  assert.equal(findPlaybackPage(pages, 'two'), 0);
  assert.equal(findPlaybackPage(pages, 'three'), 1);
  assert.equal(findPlaybackPage(pages, 'missing'), -1);
  assert.match(reading[0].contentHtml, /data-trpg-source="two"/);
});

test('each original CCA line has an exact stable return anchor after pagination or filtering', () => {
  const source = [message('aside', { isAside: true }), message('speaker/"quoted"', { cinematicLines: ['First', 'Second', 'Third'] })];
  const playback = createCinematicEntries(source, {});
  const reading = createReaderEntries(source).filter((entry) => !entry.isAside);
  const middle = playback[1];
  assert.equal(middle.sourceEntryId, source[1].id);
  assert.equal(middle.sourceLineIndex, 1);
  assert.equal(findPlaybackPage([reading], middle.sourceEntryId), 0);
  assert.equal(playbackLineId(middle.sourceEntryId, middle.sourceLineIndex), 'trpg-line-speaker%2F%22quoted%22-1');
  assert.notEqual(playbackLineId(middle.sourceEntryId, 0), playbackLineId(middle.sourceEntryId, 1));
});

test('grouping tracks sources without modifying caller-owned source lists', () => {
  const source = [message('one', { sourceEntryIds: Object.freeze(['one']) }), message('two', { sourceEntryIds: Object.freeze(['two']) })];
  assert.deepEqual(mergeConsecutiveCharacterEntries(source)[0].sourceEntryIds, ['one', 'two']);
  assert.deepEqual(source[0].sourceEntryIds, ['one']);
});

test('sticky toolbar starts at the first line visible below it, skipping covered lines', () => {
  const lines = [
    { top: -100, bottom: 20, index: 10 },
    { top: 20, bottom: 80, index: 11 },
    { top: 80, bottom: 140, index: 12 },
    { top: 140, bottom: 200, index: 13 },
  ];
  assert.equal(findTopPlaybackIndex(lines, 80, 800), 12);
  assert.equal(findTopPlaybackIndex(lines, 110, 800), 12);
  assert.equal(findTopPlaybackIndex(lines, 150, 800), 13);
});

test('a wrapped mobile toolbar uses its actual height to select the top dialogue', () => {
  const lines = [{ top: 70, bottom: 130, index: 30 }, { top: 130, bottom: 190, index: 31 }];
  assert.equal(findTopPlaybackIndex(lines, 70, 600), 30);
  assert.equal(findTopPlaybackIndex(lines, 140, 600), 31);
});

test('gaps before or after dialogue keep a nearby page position instead of restarting', () => {
  const lines = [{ top: 900, bottom: 1000, index: 70 }, { top: 1000, bottom: 1100, index: 71 }];
  assert.equal(findTopPlaybackIndex(lines, 80, 800), 70);
  assert.equal(findTopPlaybackIndex(lines.map((line) => ({ ...line, top: line.top - 1200, bottom: line.bottom - 1200 })), 80, 800), 71);
  assert.equal(findTopPlaybackIndex([], 80, 800), 0);
});

test('toolbar stays in its original slot before scrolling and pins at the viewport top afterward', () => {
  assert.equal(pinnedToolbarTop(300, 1800, 64), 300);
  assert.equal(pinnedToolbarTop(-300, 1200, 64), 0);
  assert.equal(pinnedToolbarTop(-800, 40, 64), -24);
});

test('wrapped mobile toolbar stays within the reader at the end of the log', () => {
  assert.equal(pinnedToolbarTop(-100, 120, 100), 0);
  assert.equal(pinnedToolbarTop(-100, 60, 100), -40);
});


test('Roll20 retains the last expression when the name, portrait, or both are omitted', () => {
  const source = [message('one'), message('two', { avatarSrc: null }),
    message('three', { speaker: '', avatarSrc: null }),
    message('four', { avatarSrc: '/smile.png' }), message('five', { avatarSrc: null })];
  const before = structuredClone(source);
  const restored = resolveRoll20Continuations(source);
  const playback = createCinematicEntries(restored, { Character: '/fallback.png' });
  assert.deepEqual(playback.map((entry) => entry.avatarSrc),
    ['/neutral.png', '/neutral.png', '/neutral.png', '/smile.png', '/smile.png']);
  assert.ok(playback.every((entry) => entry.speaker === 'Character'));
  assert.deepEqual(source, before);
});

test('portrait inheritance stops at another speaker, narration, or a different channel', () => {
  for (const boundary of [
    { speaker: 'Other', avatarSrc: null },
    { kind: 'media', speaker: '', avatarSrc: null },
    { isNarrator: true, avatarSrc: null },
    { isAside: true, avatarSrc: null },
    { isWhisper: true, whisperTo: 'GM', avatarSrc: null },
  ]) {
    const restored = resolveRoll20Continuations([message('one'), message('two', boundary)]);
    assert.equal(restored[1].avatarSrc, null);
    assert.equal(createCinematicEntries(restored, {}).at(-1)?.avatarSrc,
      boundary.isAside || boundary.isWhisper ? '/neutral.png' : null);
  }
});

test('cinematic playback keeps Roll20 dice tables intact and inherits consecutive portraits', () => {
  const table = '<div class="sheet-rolltemplate-coc"><table><caption>Dice roll</caption><tbody><tr><td>1d100</td><td class="inlinerollresult fullcrit">5</td></tr></tbody></table></div>';
  const source = [message('one'), message('two', { contentHtml: table, avatarSrc: null }), message('three', { avatarSrc: null })];
  const playback = createCinematicEntries(source, {});
  assert.equal(playback[1].contentHtml, table);
  assert.deepEqual(playback.map((entry) => entry.avatarSrc), ['/neutral.png', '/neutral.png', '/neutral.png']);
});
