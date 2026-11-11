/** Data-only adapter for cinematic-log-editor's portable replay format.
 * Never evaluate the script or import the editor's UI from an uploaded HTML.
 */
export type ReplayMessage = {
  id?: string | number;
  sourceMessageId?: string;
  speaker?: string;
  body?: string;
  tab?: string;
  portrait?: string;
  color?: string;
  content?: RichNode[];
};
export type RichNode = string | {
  tag?: string; text?: string; src?: string; alt?: string; title?: string;
  className?: string; color?: string; style?: Record<string, string>; children?: RichNode[];
};
export type FieldObject = {
  id: string; imageUrl: string; x: number; y: number; width: number; height: number;
  rotation: number; zIndex: number; kind?: string;
};
export type ReplayEvent = {
  id?: string; position: number; sequence: number;
  layer: 'background' | 'foreground' | 'fieldObjects' | 'bgm';
  channel?: string; status?: string; assetId?: string; imageSrc?: string; imageUrl?: string;
  imageSize?: { width: number; height: number } | null;
  bounds?: { x: number; y: number; width: number; height: number };
  objects?: FieldObject[];
  audioUrl?: string; audioAssetId?: string; youtubeUrl?: string; audioName?: string;
  volume?: number; loop?: boolean; inlineMessageId?: string | number;
};
export type CinematicReplay = {
  format: 'rollscene-studio-project-v1'; title?: string;
  messages: ReplayMessage[]; events: ReplayEvent[];
  assets: Record<string, { src?: string }>;
  settings?: { cameraZoom?: number; showFieldObjects?: boolean; narrators?: string[] };
  tabVisibility?: Record<string, boolean>;
};
export type ReplaySceneState = {
  background: string; foreground: string; foregroundEvent?: ReplayEvent;
  fields?: ReplayEvent; bgm01?: ReplayEvent; bgm02?: ReplayEvent;
};
export type ReplayStep = {
  id: string; message?: ReplayMessage; messageIndex?: number;
  events: ReplayEvent[]; state: ReplaySceneState; label: string;
};
const PAYLOAD_PATTERN = /\bconst\s+B64\s*=\s*(['"])([A-Za-z0-9+/=\s]+)\1\s*;/;
const LAYERS = new Set(['background', 'foreground', 'fieldObjects', 'bgm']);
export const SCENE_TRANSITION_SECONDS = 0.4;
export const BOARD_UNIT_REM = 1 / 16;
export const BOARD_FIT = 0.88;
export const MIN_CAMERA_ZOOM = 0.25;
export const MAX_CAMERA_ZOOM = 3;

export function isCinematicReplay(html: string): boolean {
  return PAYLOAD_PATTERN.test(html);
}

export function parseCinematicReplay(html: string): CinematicReplay {
  const encoded = html.match(PAYLOAD_PATTERN)?.[2];
  if (!encoded) throw new Error('시네마틱 리플레이 데이터를 찾을 수 없습니다.');
  const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/\s/g, '')), c => c.charCodeAt(0)))) as CinematicReplay;
  if (value?.format !== 'rollscene-studio-project-v1' || !Array.isArray(value.messages) || !Array.isArray(value.events)) {
    throw new Error('지원하지 않는 시네마틱 리플레이 형식입니다.');
  }
  const validMessage = (message: ReplayMessage) => message && typeof message === 'object' && ['speaker', 'body', 'tab', 'portrait'].every(key => message[key as keyof ReplayMessage] === undefined || typeof message[key as keyof ReplayMessage] === 'string');
  const validField = (object: FieldObject) => object && typeof object.id === 'string' && typeof object.imageUrl === 'string' && [object.x, object.y, object.width, object.height, object.rotation, object.zIndex].every(Number.isFinite);
  if (!value.messages.every(validMessage) || !value.events.every(e => e && LAYERS.has(e.layer) && Number.isFinite(e.position) && Number.isFinite(e.sequence) && (e.layer !== 'fieldObjects' || (Array.isArray(e.objects) && e.objects.every(validField) && new Set(e.objects.map(object => object.id)).size === e.objects.length)))) {
    throw new Error('시네마틱 리플레이의 대사 또는 장면 데이터가 올바르지 않습니다.');
  }
  const assets = Object.fromEntries(Object.entries(value.assets ?? {}).filter(([, asset]) => asset && typeof asset.src === 'string'));
  const settings = value.settings ? {
    cameraZoom: Number.isFinite(value.settings.cameraZoom) ? value.settings.cameraZoom : undefined,
    showFieldObjects: value.settings.showFieldObjects !== false,
    narrators: Array.isArray(value.settings.narrators) ? value.settings.narrators.filter(name => typeof name === 'string') : undefined,
  } : undefined;
  const tabVisibility = Object.fromEntries(Object.entries(value.tabVisibility ?? {}).filter(([, visible]) => typeof visible === 'boolean'));
  return { ...value, assets, settings, tabVisibility };
}

export function replayMediaSource(value: unknown, assets: CinematicReplay['assets'] = {}, baseUrl?: string): string {
  if (typeof value !== 'string') return '';
  const source = (value.startsWith('asset:') ? assets[value.slice('asset:'.length)]?.src ?? '' : value).trim();
  if (/^https?:\/\//i.test(source) || /^data:(?:image\/(?:png|jpe?g|webp|gif|avif)|audio\/[\w.+-]+);base64,/i.test(source)) return source;
  if (source && baseUrl && !/^[a-z][\w+.-]*:|^\/\//i.test(source)) {
    try { const url = new URL(source, baseUrl); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  return '';
}

export function fieldFrame(event?: ReplayEvent) {
  const bounds = event?.bounds;
  if (!bounds || !Array.isArray(event?.objects) || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) return null;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
}

export function replayMessageVisible(replay: CinematicReplay, message: ReplayMessage): boolean {
  const tab = String(message.tab || 'main');
  return replay.tabVisibility?.[tab] ?? !/^(잡담|ooc|out of character)$/i.test(tab);
}

// Match the editor's grouping: a repeated layer/channel is a distinct transition.
export function groupReplayEvents(events: ReplayEvent[]): ReplayEvent[][] {
  const groups: ReplayEvent[][] = [];
  let group: ReplayEvent[] = [], seen = new Set<string>();
  for (const event of events) {
    const key = event.layer === 'bgm' ? `bgm:${event.channel}` : event.layer;
    if (event.inlineMessageId || seen.has(key)) {
      if (group.length) groups.push(group);
      group = []; seen = new Set();
    }
    if (event.inlineMessageId) { groups.push([event]); continue; }
    group.push(event); seen.add(key);
  }
  if (group.length) groups.push(group);
  return groups;
}

export function compactFieldMotions(events: ReplayEvent[]): ReplayEvent[] {
  const omitted = new Set<number>();
  let run: number[] = [], signature = '', position = -1;
  const flush = () => { run.slice(1, -1).forEach(i => omitted.add(i)); run = []; signature = ''; };
  events.forEach((event, index) => {
    if (event.position !== position) { flush(); position = event.position; }
    if (event.layer !== 'fieldObjects') { if (event.layer !== 'bgm' || event.inlineMessageId) flush(); return; }
    if (!event.objects?.length) { flush(); return; }
    const objects = event.objects.map(object => ({ ...object, x: undefined, y: undefined, rotation: undefined })).sort((a, b) => a.id.localeCompare(b.id));
    const next = JSON.stringify({ bounds: event.bounds, objects });
    if (signature !== next) { flush(); signature = next; }
    run.push(index);
  });
  flush();
  return events.filter((_, index) => !omitted.has(index));
}

export function buildReplaySteps(replay: CinematicReplay, baseUrl?: string): ReplayStep[] {
  const byPosition = new Map<number, ReplayEvent[]>();
  const events = compactFieldMotions([...replay.events].sort((a, b) => a.position - b.position || a.sequence - b.sequence));
  for (const event of events) {
    const at = Math.max(0, Math.min(replay.messages.length, Math.trunc(event.position)));
    byPosition.set(at, [...(byPosition.get(at) ?? []), event]);
  }
  const steps: ReplayStep[] = [];
  let state: ReplaySceneState = { background: '', foreground: '' };
  const add = (changes: ReplayEvent[], message?: ReplayMessage, messageIndex?: number) => {
    state = { ...state };
    for (const event of changes) {
      if (event.layer === 'background' || event.layer === 'foreground') {
        const hidden = event.status === 'clear' || event.imageUrl === 'ccfolia:none' || (event.layer === 'foreground' && event.imageSize && (!event.imageSize.width || !event.imageSize.height));
        state[event.layer] = hidden ? '' : replayMediaSource(replay.assets[event.assetId ?? '']?.src || event.imageSrc || event.imageUrl, replay.assets, baseUrl);
        if (event.layer === 'foreground') state.foregroundEvent = event;
      } else if (event.layer === 'fieldObjects') state.fields = event;
      else if (event.channel === 'bgm01' || event.channel === 'bgm02') state[event.channel] = ['stop', 'clear'].includes(event.status ?? '') ? undefined : event;
    }
    const labels = changes.map(e => e.layer === 'bgm' ? `${e.channel === 'bgm02' ? 'BGM 2' : 'BGM 1'} · ${['stop', 'clear'].includes(e.status ?? '') ? '중지' : e.audioName || '음악 변경'}` : e.layer === 'background' ? '배경 변경' : e.layer === 'foreground' ? '전경 변경' : `스크린·마커·figure 변경 · ${e.objects?.length ?? 0}개`);
    steps.push({ id: `replay-step-${steps.length}`, events: changes, state, message, messageIndex, label: labels.join(' / ') });
  };
  for (let position = 0; position <= replay.messages.length; position++) {
    const changes = byPosition.get(position) ?? [];
    const message = replay.messages[position];
    let boundary = changes.length;
    while (message && boundary > 0 && changes[boundary - 1].layer === 'bgm' && changes[boundary - 1].inlineMessageId && changes[boundary - 1].inlineMessageId === (message.sourceMessageId || message.id)) boundary--;
    for (const group of groupReplayEvents(changes.slice(0, boundary))) add(group);
    if (message) add(changes.slice(boundary), message, position);
  }
  return steps;
}

export function escapeReplayText(text: unknown): string {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function replayMessageHtml(message: ReplayMessage, assets: CinematicReplay['assets'], baseUrl?: string): string {
  const render = (nodes: RichNode[], depth = 0): string => depth > 32 ? '' : nodes.map(node => {
    if (typeof node === 'string') return escapeReplayText(node);
    if (!node || typeof node !== 'object') return '';
    const tag = /^(?:span|div|p|br|strong|b|em|i|u|s|table|thead|tbody|tfoot|tr|td|th|caption|ul|ol|li|blockquote|hr|img)$/i.test(node.tag ?? '') ? node.tag!.toLowerCase() : 'span';
    if (tag === 'br' || tag === 'hr') return `<${tag}>`;
    if (tag === 'img') {
      const src = replayMediaSource(node.src, assets, baseUrl);
      return src ? `<img src="${escapeReplayText(src)}" alt="${escapeReplayText(node.alt || '로그 이미지')}">` : '';
    }
    const className = String(node.className ?? '').split(/\s+/).filter(c => /^chat-(?:roll|roll-critical|roll-failure|roll-success|roll-template|missing-image)$/.test(c)).join(' ');
    const color = /^#[\da-f]{3,8}$/i.test(node.color ?? '') ? `color:${node.color};` : '';
    const style = Object.entries(node.style ?? {}).filter(([key, value]) => /^(?:color|background-color|font-weight|font-style|text-decoration|text-align|white-space)$/.test(key) && typeof value === 'string' && !/url\s*\(|expression\s*\(|var\s*\(|[<>;"']/i.test(value)).map(([key, value]) => `${key}:${value};`).join('');
    return `<${tag} class="${className}" title="${escapeReplayText(node.title ?? '')}" style="${escapeReplayText(color + style)}">${escapeReplayText(node.text ?? '')}${Array.isArray(node.children) ? render(node.children, depth + 1) : ''}</${tag}>`;
  }).join('');
  return Array.isArray(message.content) ? render(message.content) : escapeReplayText(message.body);
}

export function youtubeVideoId(value: string): string {
  try {
    const url = new URL(value), path = url.pathname.split('/').filter(Boolean);
    const id = url.hostname === 'youtu.be' ? path[0] : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname) ? path[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(path[0]) ? path[1] : '' : '';
    return /^[\w-]{11}$/.test(id ?? '') ? id! : '';
  } catch { return ''; }
}
