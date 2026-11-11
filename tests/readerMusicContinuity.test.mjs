import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { replayMediaSource, youtubeVideoId } from '../src/lib/cinematicReplay.ts';

// Exercise the channel's real effects with media doubles; no network or audio
// device is needed to detect a player teardown or a playback-position reset.
function channelHarness(storage = new Map(), channel = 1) {
  const states = [], refs = [], effects = [], players = [];
  const listeners = new Map();
  class TestNode { contains(node) { return node === this; } }
  const root = new TestNode();
  let stateIndex, refIndex, effectIndex;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useId() { return 'bgm-controls'; },
    useEffect(fn, deps) {
      const index = effectIndex++;
      if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) {
        effects[index]?.cleanup?.();
        effects[index] = { fn, deps };
      }
    },
  };
  const audio = {
    currentTime: 0, plays: 0, pauses: 0,
    play() { this.plays++; return Promise.resolve(); },
    pause() { this.pauses++; },
  };
  const host = { replaceChildren() {} };
  const testModule = { exports: {} };
  const source = fs.readFileSync(new URL('../src/components/trpg/CinematicMusic.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, queueMicrotask, Node: TestNode,
    document: {
      createElement: () => ({}),
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    },
    window: {
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      location: { origin: 'https://example.test' },
      YT: { Player: function (element, options) {
        const player = {
          options, destroyed: false, plays: 0, pauses: 0, currentTime: 0,
          playVideo() { this.plays++; }, pauseVideo() { this.pauses++; },
          setVolume() {}, unMute() {}, destroy() { this.destroyed = true; },
        };
        players.push(player);
        return player;
      } },
    },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-dom') return { createPortal: (children, host) => ({ type: 'portal', props: { children, host } }) };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'framer-motion') return { motion: { div: 'motion.div' }, useReducedMotion: () => false };
      if (name === '@/lib/cinematicReplay') return { replayMediaSource, youtubeVideoId };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    audio, players,
    clickOutside() { listeners.get('pointerdown')?.forEach(fn => fn({ target: new TestNode() })); },
    async render(track, options = {}) {
      stateIndex = refIndex = effectIndex = 0;
      const tree = testModule.exports.MusicChannel({ track, channel, replay: { assets: {} }, compact: true, ...options });
      tree.props.ref.current = root;
      refs[0].current = track?.audioUrl ? audio : null;
      refs[1].current = host;
      for (const effect of effects) {
        if (!effect.fn) continue;
        const fn = effect.fn;
        effect.fn = null;
        effect.cleanup = fn();
      }
      await Promise.resolve();
      return tree;
    },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test('BGM volume survives remounts, including zero, independently for each channel', async () => {
  const storage = new Map();
  const track = { audioUrl: 'https://example.test/bgm.mp3', volume: 0.5 };
  for (const [channel, volume] of [[1, 0], [2, 27]]) {
    const h = channelHarness(storage, channel);
    try {
      const controls = await h.render(track);
      const slider = controls.props.children[1].props.children[1].props.children[1].props.children[1];
      slider.props.onChange({ target: { value: String(volume) } });
      await h.render(track);
      assert.equal(h.audio.volume, volume / 100);
    } finally { h.cleanup(); }
  }
  for (const [channel, volume] of [[1, 0], [2, 27]]) {
    const h = channelHarness(storage, channel);
    try {
      await h.render(track);
      assert.equal(h.audio.volume, volume / 100, 'Saved level applies before initial playback');
      await h.render({ ...track, volume: 0.9 });
      assert.equal(h.audio.volume, volume / 100);
    } finally { h.cleanup(); }
  }
});

test('invalid or unavailable BGM storage preserves the recorded volume and working controls', async () => {
  const track = { audioUrl: 'https://example.test/bgm.mp3', volume: 0.4 };
  const blocked = { get() { throw new Error('Storage blocked'); }, set() { throw new Error('Storage blocked'); } };
  for (const storage of [new Map(), ...['invalid', 'null', '"25"', '-1', '101'].map(value => new Map([['after-the-roll-bgm-volume-1', value]])), blocked]) {
    const h = channelHarness(storage);
    try {
      const controls = await h.render(track);
      assert.equal(h.audio.volume, 0.4);
      const slider = controls.props.children[1].props.children[1].props.children[1].props.children[1];
      slider.props.onChange({ target: { value: '15' } });
      await h.render(track);
      assert.equal(h.audio.volume, 0.15);
    } finally { h.cleanup(); }
  }
});

test('reader pages retain an audio recording and its paused position across repeated BGM events', async () => {
  const h = channelHarness();
  const track = { id: 'page-one', sequence: 1, audioUrl: 'https://example.test/bgm.mp3' };
  try {
    await h.render(track);
    h.audio.currentTime = 42;
    const playing = await h.render(track);
    playing.props.children[1].props.children[1].props.children[0].props.onClick(); // Pause in the volume panel.
    const plays = h.audio.plays, pauses = h.audio.pauses;
    await h.render({ ...track, id: 'page-two', sequence: 2, volume: 0.3 });
    assert.equal(h.audio.currentTime, 42);
    assert.equal(h.audio.plays, plays);
    assert.equal(h.audio.pauses, pauses);
    await h.render({ ...track, audioUrl: 'https://example.test/next.mp3' });
    assert.equal(h.audio.currentTime, 0);
    assert.equal(h.audio.plays, plays, 'Changing songs must preserve the user pause');
  } finally { h.cleanup(); }
});

test('reader pages reuse the YouTube player until the source changes or music stops', async () => {
  const h = channelHarness();
  const track = { id: 'page-one', sequence: 1, youtubeUrl: 'https://youtu.be/cFANezsSHFo' };
  try {
    await h.render(track);
    const player = h.players[0];
    player.options.events.onReady();
    player.options.events.onStateChange({ data: 1 });
    player.currentTime = 73;
    const controls = await h.render(track);
    controls.props.children[0].props.onClick();
    const expanded = await h.render(track);
    assert.equal(expanded.props.children[0].props['aria-expanded'], true);
    h.clickOutside();
    const collapsed = await h.render(track);
    assert.equal(collapsed.props.children[0].props['aria-expanded'], false);
    await h.render({ ...track, id: 'page-two', sequence: 2 });
    assert.equal(h.players.length, 1);
    assert.equal(player.destroyed, false);
    assert.equal(player.currentTime, 73);
    assert.equal(player.plays, 1);
    await h.render({ ...track, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    assert.equal(player.destroyed, true);
    assert.equal(h.players.length, 2);
    await h.render(undefined);
    assert.equal(h.players[1].destroyed, true);
  } finally { h.cleanup(); }
});

test('audio continues across cinematic controls opening and closing, including a user pause', async () => {
  const h = channelHarness();
  const track = { id: 'reader', audioUrl: 'https://example.test/bgm.mp3' };
  const controlsHost = {};
  try {
    await h.render(track);
    h.audio.currentTime = 42;
    const plays = h.audio.plays, pauses = h.audio.pauses;
    const cinematic = await h.render({ ...track, id: 'cinematic' }, { controlsHost });
    assert.equal(h.audio.currentTime, 42);
    assert.equal(h.audio.plays, plays);
    assert.equal(h.audio.pauses, pauses);
    const portal = cinematic.props.children.at(-1);
    assert.equal(portal.props.host, controlsHost);
    // The cinematic controls pause the same media instance used by the log.
    portal.props.children.props.children[2].props.children[0].props.children[0].props.onClick();
    const paused = h.audio.pauses;
    const reader = await h.render(track);
    assert.equal(Boolean(reader.props.children.at(-1)), false);
    assert.equal(h.audio.currentTime, 42);
    assert.equal(h.audio.plays, plays);
    assert.equal(h.audio.pauses, paused);
    await h.render(track, { controlsHost: {} });
    assert.equal(h.audio.plays, plays, 'Entering cinematic again preserves a user pause');
    await h.render({ ...track, audioUrl: 'https://example.test/next.mp3' }, { controlsHost });
    assert.equal(h.audio.currentTime, 0, 'A different recording starts from the beginning');
  } finally { h.cleanup(); }
});

test('YouTube keeps its player and position when switching between log and cinematic controls', async () => {
  const h = channelHarness();
  const track = { id: 'reader', youtubeUrl: 'https://youtu.be/cFANezsSHFo' };
  try {
    await h.render(track);
    const player = h.players[0];
    player.options.events.onReady();
    player.options.events.onStateChange({ data: 1 });
    player.currentTime = 73;
    for (const controlsHost of [{}, null, {}, null]) {
      await h.render({ ...track, id: controlsHost ? 'cinematic' : 'reader' }, { controlsHost });
      assert.equal(h.players.length, 1);
      assert.equal(player.destroyed, false);
      assert.equal(player.currentTime, 73);
      assert.equal(player.plays, 1);
      assert.equal(player.pauses, 0);
    }
    await h.render({ ...track, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }, { controlsHost: {} });
    assert.equal(player.destroyed, true);
    assert.equal(h.players.length, 2);
  } finally { h.cleanup(); }
});

test('music follows the cinematic entry and waits for the restored log position before following scroll again', async () => {
  const effects = [], states = [], frames = new Map();
  let stateIndex = 0, effectIndex = 0, frameId = 0, visibleIndex = 1;
  const jsx = (type, props) => ({ type, props });
  const source = fs.readFileSync(new URL('../src/components/trpg/ReaderMusic.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, queueMicrotask,
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { observe() {} disconnect() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './CinematicMusic') return { MusicChannel: 'MusicChannel' };
      if (name === 'react') return {
        useState(initial) {
          const i = stateIndex++;
          if (!(i in states)) states[i] = initial;
          return [states[i], value => { states[i] = value; }];
        },
        useEffect(fn, deps) {
          const i = effectIndex++;
          if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) {
            effects[i]?.cleanup?.();
            effects[i] = { fn, deps };
          }
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const tracks = [0, 1, 2].map(i => ({ audioUrl: `https://example.test/${i}.mp3` }));
  const props = {
    replay: { assets: {} }, steps: tracks.map(bgm01 => ({ state: { bgm01 } })),
    entries: tracks.map((_, replayStep) => ({ replayStep })),
    readerRef: { current: {} }, toolbarRef: { current: {} }, pageEntries: [],
    getStartIndex: () => visibleIndex, suspended: false, cinematicIndex: 0, controlsHost: null,
  };
  const render = async changes => {
    Object.assign(props, changes);
    stateIndex = effectIndex = 0;
    const tree = testModule.exports.default(props);
    for (const effect of effects) {
      if (!effect.fn) continue;
      const fn = effect.fn;
      effect.fn = null;
      effect.cleanup = fn();
    }
    await Promise.resolve();
    return tree.props.children[0].props;
  };
  try {
    await render();
    for (const [id, fn] of frames) { frames.delete(id); fn(); }
    assert.equal((await render()).track, tracks[1]);
    const controlsHost = {};
    assert.equal((await render({ suspended: true, cinematicIndex: 1, controlsHost })).track, tracks[1]);
    assert.equal(frames.size, 0, 'Background log scroll must not override cinematic music');
    assert.equal((await render({ cinematicIndex: 2 })).track, tracks[2]);
    assert.equal((await render({ controlsHost: null })).track, tracks[2], 'Closing keeps the current track while restoring the page');
    visibleIndex = 2;
    assert.equal((await render({ suspended: false })).track, tracks[2]);
    for (const [id, fn] of frames) { frames.delete(id); fn(); }
    assert.equal((await render()).track, tracks[2]);
  } finally { effects.forEach(effect => effect.cleanup?.()); }
});
