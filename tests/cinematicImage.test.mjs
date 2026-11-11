import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createCinematicEntries } from '../src/lib/trpgLogPlayback.ts';

test('image scenes retain source order, replay state and original return anchors', () => {
  const source = [{ id: 'mixed', speaker: 'GM', avatarSrc: null, contentHtml: 'mixed', cinematicLines: ['mixed', 'Next line'], kind: 'chat', isAside: false, isWhisper: false, replayStep: 8 }];
  const before = structuredClone(source);
  const playback = createCinematicEntries(source, {}, html => html === 'mixed' ? [
    { contentHtml: '<p>Before</p>' },
    { contentHtml: '', cinematicImage: { src: '/scene.jpg', alt: 'A scene' } },
    { contentHtml: '<p>After</p>' },
  ] : [{ contentHtml: html }]);
  assert.deepEqual(playback.map(entry => entry.cinematicImage?.src || entry.contentHtml), ['<p>Before</p>', '/scene.jpg', '<p>After</p>', 'Next line']);
  assert.deepEqual(playback.map(entry => entry.sourceLineIndex), [0, 0, 0, 1]);
  assert.ok(playback.every(entry => entry.sourceEntryId === 'mixed' && entry.replayStep === 8));
  assert.equal(new Set(playback.map(entry => entry.id)).size, 4);
  assert.deepEqual(source, before);
});

function playerHarness(entries, index) {
  const states = [];
  let stateIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const i = stateIndex++;
      states[i] ??= i === 0 ? true : i === 1 ? { index, complete: false, reveal: false } : initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef: () => ({ current: null }), useEffect() {}, useCallback: fn => fn,
  };
  const testModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/components/trpg/CinematicLogPlayer.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, Element: class {}, document: { body: {} },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'react-dom') return { createPortal: x => x, flushSync: fn => fn() };
      if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => `motion.${key}` }), useReducedMotion: () => false, AnimatePresence: 'presence' };
      if (name.includes('cinematicReplay')) return { SCENE_TRANSITION_SECONDS: 0.2 };
      return { __esModule: true, default: name };
    },
  });
  return {
    states,
    render() { stateIndex = 0; return testModule.exports.default({ entries, fontFamily: 'sans-serif', getStartIndex: () => index, onClose() {} }); },
  };
}

function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
}

test('photographs render outside the dialogue and one click advances even while loading', () => {
  const photo = { id: 'photo', contentHtml: '', cinematicImage: { src: '/photo.jpg', alt: 'Photo' } };
  const harness = playerHarness([{ id: 'before' }, photo, { id: 'after', contentHtml: 'After the photo' }], 1);
  const nodes = descendants(harness.render());
  const image = nodes.find(node => node.type === './CinematicImage');
  assert.equal(image.props.src, '/photo.jpg');
  assert.ok(!nodes.some(node => node.type === './CinematicDialogue'));
  nodes.find(node => node.props?.role === 'dialog').props.onClick({ target: null });
  assert.equal(harness.states[1].index, 2);
  assert.ok(descendants(harness.render()).some(node => node.type === './CinematicDialogue'));
});

test('a loaded photograph becomes complete for autoplay and previous returns to dialogue', () => {
  const harness = playerHarness([{ id: 'before', contentHtml: 'Before' }, { id: 'photo', cinematicImage: { src: '/photo.jpg', alt: 'Photo' } }], 1);
  const nodes = descendants(harness.render());
  nodes.find(node => node.type === './CinematicImage').props.onComplete();
  assert.equal(harness.states[1].complete, true);
  nodes.find(node => node.type === 'button' && node.props.children === '이전').props.onClick();
  assert.equal(harness.states[1].index, 0);
});
