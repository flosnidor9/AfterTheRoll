import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReplaySteps, compactFieldMotions, fieldFrame, isCinematicReplay, parseCinematicReplay, replayMediaSource, replayMessageHtml, replayMessageVisible, youtubeVideoId } from '../src/lib/cinematicReplay.ts';
import { createCinematicEntries, createReaderEntries } from '../src/lib/trpgLogPlayback.ts';
import { buildTrpgUploadFiles } from '../src/lib/trpgUpload.ts';

const replay = (overrides = {}) => ({ format: 'rollscene-studio-project-v1', assets: {}, messages: [{ id: 'one', body: 'first' }, { id: 'two', body: 'second' }], events: [], ...overrides });
const event = (layer, sequence, overrides = {}) => ({ layer, position: 0, sequence, ...overrides });
const object = { id: 'figure', kind: 'figure', imageUrl: 'https://example.test/figure.png', x: -20, y: 30, width: 100, height: 200, rotation: 0, zIndex: 5 };
const bounds = { x: -600, y: -360, width: 1200, height: 720 };

test('import rejects invalid payloads without running uploaded JavaScript', () => {
  const payload = Buffer.from(JSON.stringify(replay())).toString('base64');
  const html = `<script>throw new Error('must never run'); const B64="${payload}";</script>`;
  assert.equal(isCinematicReplay(html), true);
  assert.equal(parseCinematicReplay(html).messages.length, 2);
  assert.throws(() => parseCinematicReplay('no payload'));
  assert.throws(() => parseCinematicReplay(`const B64='${Buffer.from('{}').toString('base64')}';`));
});

test('repeated scene layers stay in separate steps and backward navigation restores prior music', () => {
  const data = replay({ events: [
    event('background', 1, { imageUrl: 'https://example.test/a.jpg' }),
    event('bgm', 2, { channel: 'bgm01', audioName: 'A', youtubeUrl: 'https://youtu.be/cFANezsSHFo' }),
    event('bgm', 3, { channel: 'bgm02', audioName: 'B' }),
    event('background', 4, { imageUrl: 'https://example.test/b.jpg' }),
    event('bgm', 5, { channel: 'bgm01', status: 'stop', position: 1 }),
    event('foreground', 6, { imageUrl: 'ccfolia:none', position: 2 }),
  ] });
  const steps = buildReplaySteps(data);
  assert.equal(steps[0].state.background, 'https://example.test/a.jpg');
  assert.equal(steps[1].state.background, 'https://example.test/b.jpg');
  assert.equal(steps[2].message.id, 'one');
  assert.equal(steps[3].state.bgm01, undefined);
  assert.equal(steps[3].state.bgm02.audioName, 'B');
  assert.equal(steps[0].state.bgm01.audioName, 'A');
  assert.equal(steps.at(-1).message, undefined);
  assert.equal(steps.at(-1).state.foreground, '');
});

test('inline music is applied with its own message and independent hidden tabs retain scene changes', () => {
  const data = replay({ messages: [{ id: 'one', sourceMessageId: 'source', tab: 'ooc' }, { id: 'two', tab: 'main' }], events: [event('bgm', 1, { channel: 'bgm01', inlineMessageId: 'source' })] });
  const steps = buildReplaySteps(data);
  assert.equal(steps[0].message.id, 'one');
  assert.equal(steps[0].events.length, 1);
  assert.equal(steps[1].state.bgm01, steps[0].state.bgm01);
  assert.equal(replayMessageVisible(data, data.messages[0]), false);
  assert.equal(replayMessageVisible({ ...data, tabVisibility: { ooc: true } }, data.messages[0]), true);
});

test('motion compaction retains the initial and final pose but never skips identity or size changes', () => {
  const fields = (sequence, overrides = {}) => event('fieldObjects', sequence, { bounds, objects: [{ ...object, x: sequence, rotation: sequence * 30, ...overrides }] });
  const events = [fields(1), fields(2), fields(3), fields(4, { width: 120 }), fields(5, { width: 120 })];
  assert.deepEqual(compactFieldMotions(events).map(event => event.sequence), [1, 3, 4, 5]);
  assert.deepEqual(fieldFrame(fields(1)), fieldFrame(fields(3)));
  assert.deepEqual(fieldFrame(fields(1)), { x: 0, y: 0, width: 1200, height: 720 });
  assert.equal(fieldFrame({ bounds: { width: 1200 }, objects: [] }), null);
});

test('media references and rich text cannot inject scripts or unsafe URLs', () => {
  const assets = { image: { src: 'https://example.test/image.png' } };
  assert.equal(replayMediaSource('asset:image', assets), assets.image.src);
  assert.equal(replayMediaSource('media/image.png', {}, 'https://example.test/log/source.html'), 'https://example.test/log/media/image.png');
  for (const url of ['javascript:alert(1)', ' data:text/html;base64,abc', '//evil.test/x']) assert.equal(replayMediaSource(url, {}, 'https://example.test/'), '');
  const html = replayMessageHtml({ content: [{ tag: 'script', children: ['<script>alert(1)</script>'] }, { tag: 'img', src: 'javascript:alert(1)' }, { tag: 'table', className: 'chat-roll-template', children: [{ tag: 'tr', children: [{ tag: 'td', children: ['1D6 → 6'] }] }] }] }, assets);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('<table'));
  assert.ok(html.includes('1D6 → 6'));
});

test('replay steps do not merge across dialogue or inherit an explicitly removed portrait', () => {
  const entries = [0, 1].map(index => ({ id: String(index), speaker: 'PC', avatarSrc: index ? null : 'https://example.test/a.png', contentHtml: 'line', kind: 'chat', isAside: false, isWhisper: false, replayStep: index }));
  assert.equal(createReaderEntries(entries).length, 2);
  assert.equal(createCinematicEntries(entries, { PC: 'https://example.test/fallback.png' })[1].avatarSrc, null);
});

test('scene changes remain playback events without appearing in the transcript', () => {
  const event = { id: 'scene', speaker: '', avatarSrc: null, contentHtml: 'BGM 1 / 전경 변경', kind: 'media', isAside: false, isWhisper: false, replayStep: 0, sceneOnly: true };
  const message = { ...event, id: 'message', contentHtml: '대사만 남깁니다.', kind: 'chat', replayStep: 1, sceneOnly: false };
  const transcript = createReaderEntries([event, message]);
  assert.equal(transcript.length, 1);
  assert.equal(transcript[0].id, 'message');
  assert.equal(createCinematicEntries([event, message], {}).length, 2);
});

test('upload metadata keeps the cinematic format and complete portable source', () => {
  const upload = buildTrpgUploadFiles({ title: 'Cinematic', date: '2026-11-11', calendarEventId: '', playId: '', gmName: '', description: '', tags: [], format: 'cinematic', locked: false, mainChannels: [], whisperChannels: [], sourceFileName: 'replay.html', sourceHtml: '<html>portable source</html>', cast: [] });
  assert.ok(upload.files.find(file => file.path.endsWith('.md')).content.includes('sourceFormat: "cinematic"'));
  assert.equal(upload.files.find(file => file.path.endsWith('.html')).content, '<html>portable source</html>');
});
