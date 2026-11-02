import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_READER_NAVIGATION, readerNavigationReducer } from '../src/lib/galleryReaderNavigation.ts';

const move = (state, offset, maxPage = 5) => readerNavigationReducer(state, { type: 'move', offset, maxPage });

test('rapid inputs advance every requested spread without completing an animation or loading images', () => {
  let state = INITIAL_READER_NAVIGATION;
  for (let page = 1; page <= 3; page++) {
    state = move(state, 1);
    assert.equal(state.page, page);
    assert.equal(state.fromPage, page - 1);
    assert.equal(state.turnId, page);
    assert.equal(state.turning, true);
    assert.equal(state.targetSpreadRevealed, false);
  }
  state = readerNavigationReducer(state, { type: 'finish', turnId: state.turnId });
  assert.equal(state.page, 3);
  assert.equal(state.turning, false);
});

test('reversing an unfinished turn uses the last requested spread and ignores obsolete callbacks', () => {
  const first = move(INITIAL_READER_NAVIGATION, 1);
  const revealed = readerNavigationReducer(first, { type: 'reveal', turnId: first.turnId });
  assert.equal(revealed.targetSpreadRevealed, true);
  const reversed = move(revealed, -1);
  assert.equal(reversed.page, 0);
  assert.equal(reversed.fromPage, 1);
  assert.equal(reversed.direction, -1);
  assert.equal(reversed.targetSpreadRevealed, false);
  for (const type of ['reveal', 'finish']) {
    assert.equal(readerNavigationReducer(reversed, { type, turnId: first.turnId }), reversed);
  }
  const finished = readerNavigationReducer(reversed, { type: 'finish', turnId: reversed.turnId });
  assert.equal(finished.page, 0);
  assert.equal(finished.turning, false);
  assert.equal(readerNavigationReducer(finished, { type: 'reveal', turnId: reversed.turnId }), finished);
});

test('rapid navigation stays within album boundaries, including empty and single-spread albums', () => {
  assert.equal(move(INITIAL_READER_NAVIGATION, -1), INITIAL_READER_NAVIGATION);
  assert.equal(move(INITIAL_READER_NAVIGATION, 1, 0), INITIAL_READER_NAVIGATION);
  const last = move(move(INITIAL_READER_NAVIGATION, 1, 2), 1, 2);
  assert.equal(last.page, 2);
  assert.equal(move(last, 1, 2), last);
  assert.equal(move(last, -1, 2).page, 1);
});
