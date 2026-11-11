'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { replayMediaSource, youtubeVideoId, type CinematicReplay, type ReplayEvent, type ReplaySceneState } from '@/lib/cinematicReplay';

type YouTubePlayer = {
  destroy: () => void; playVideo: () => void; pauseVideo: () => void;
  unMute: () => void;
  setVolume: (value: number) => void; seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};
type YouTubeApi = {
  Player: new (host: HTMLElement, options: {
    width: string; height: string; videoId: string; playerVars: Record<string, string | number>;
    events: { onReady: () => void; onError: () => void; onAutoplayBlocked: () => void; onStateChange: (event: { data: number }) => void };
  }) => YouTubePlayer;
};
type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeApi> | undefined;
function youtubeApi(): Promise<YouTubeApi> {
  // The site's older music widget declares a narrower global YT constructor.
  const target = window as unknown as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = target.onYouTubeIframeAPIReady;
    target.onYouTubeIframeAPIReady = () => { previous?.(); if (target.YT) resolve(target.YT); };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement('script');
    script.addEventListener('error', () => { apiPromise = undefined; script.remove(); reject(new Error('YouTube에 연결할 수 없습니다.')); }, { once: true });
    if (!existing) { script.src = 'https://www.youtube.com/iframe_api'; script.async = true; document.head.append(script); }
  });
  return apiPromise;
}
const recordedVolume = (track?: ReplayEvent) => {
  const volume = track?.volume;
  return typeof volume === 'number' && Number.isFinite(volume) ? Math.max(0, Math.min(100, volume <= 1 ? volume * 100 : volume)) : 50;
};
const CONTROLS_TRANSITION_SECONDS = 0.15;
const CONTROLS_OFFSET_REM = 0.5;
const VOLUME_STORAGE_KEY = 'after-the-roll-bgm-volume';
const MAX_VOLUME = 100;

export function MusicChannel({ track, channel, replay, baseUrl, compact = false, enabled = true, controlsHost }: { track?: ReplayEvent; channel: number; replay: CinematicReplay; baseUrl?: string; compact?: boolean; enabled?: boolean; controlsHost?: HTMLDivElement | null }) {
  const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const wantsPlayback = useRef(true);
  const playingRef = useRef(false);
  const startupPending = useRef(true);
  const requestPlay = useRef<(() => void) | null>(null);
  const volume = muted ? 0 : volumeOverride ?? recordedVolume(track);
  const volumeRef = useRef(volume);
  const trackRef = useRef(track);
  const id = youtubeVideoId(track?.youtubeUrl ?? '');
  const audioSource = replayMediaSource(replay.assets[track?.audioAssetId ?? '']?.src || track?.audioUrl, replay.assets, baseUrl);
  // Reader pagination can reach another event for the same recording. Keep its
  // media instance (and playback position) until the actual source changes.
  const trackKey = track ? (audioSource ? `audio:${audioSource}` : `youtube:${id}`) : '';
  const controlsRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const reducedMotion = useReducedMotion();
  const playable = Boolean(track && (audioSource || id));

  useEffect(() => {
    if (!compact || !expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlsRef.current?.contains(event.target)) setExpanded(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExpanded(false);
      controlsRef.current?.querySelector<HTMLButtonElement>('[aria-controls]')?.focus();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', keydown);
    };
  }, [compact, expanded]);

  useEffect(() => { volumeRef.current = volume; if (audioRef.current) audioRef.current.volume = volume / 100; playerRef.current?.setVolume(volume); }, [volume]);
  useEffect(() => {
    let cancelled = false;
    let savedVolume: number | null = null;
    try {
      const raw = window.localStorage.getItem(`${VOLUME_STORAGE_KEY}-${channel}`);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_VOLUME) savedVolume = parsed;
    } catch { /* Keep playback available when browser storage is blocked. */ }
    // Restore the media level before the playback effect starts a recording.
    const restoredVolume = savedVolume ?? recordedVolume(trackRef.current);
    volumeRef.current = restoredVolume;
    if (audioRef.current) audioRef.current.volume = restoredVolume / MAX_VOLUME;
    playerRef.current?.setVolume(restoredVolume);
    queueMicrotask(() => { if (!cancelled) setVolumeOverride(savedVolume); });
    return () => { cancelled = true; };
  }, [channel]);
  useEffect(() => { trackRef.current = track; }, [track]);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    const audio = audioRef.current;
    const host = hostRef.current;
    playingRef.current = false;
    startupPending.current = true;
    const reportPlaying = (value: boolean) => {
      if (cancelled) return;
      playingRef.current = value;
      if (value) startupPending.current = false;
      setPlaying(value);
    };
    queueMicrotask(() => reportPlaying(false));
    const blocked = () => {
      if (cancelled) return;
      setStatus('음악 재생 버튼을 눌러 주세요.');
    };
    const playAudio = () => {
      void audio?.play().then(() => {
        if (cancelled) return;
        reportPlaying(true);
        setStatus('재생 중');
      }).catch(blocked);
    };
    // Retry only blocked startup playback, within the next user gesture.
    const retryBlocked = () => {
      if (!enabled || !wantsPlayback.current || !startupPending.current || playingRef.current) return;
      requestPlay.current?.();
    };
    requestPlay.current = () => {
      if (!enabled || !wantsPlayback.current) return;
      if (audioSource) playAudio();
      else { playerRef.current?.unMute(); playerRef.current?.playVideo(); }
    };
    // Click carries user activation for touch as well as mouse input.
    document.addEventListener('click', retryBlocked);
    document.addEventListener('keydown', retryBlocked);
    if (audio) {
      audio.pause();
      if (audioSource && enabled) {
        audio.currentTime = 0; audio.volume = volumeRef.current / 100;
        requestPlay.current();
      }
    }
    if (id && !audioSource && host && enabled) {
      void youtubeApi().then(api => {
        if (cancelled) return;
        const element = document.createElement('iframe');
        element.title = `BGM ${channel}: ${trackRef.current?.audioName || '배경 음악'}`;
        element.allow = 'autoplay; encrypted-media';
        element.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=${wantsPlayback.current ? 1 : 0}&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`;
        host.replaceChildren(element);
        player = new api.Player(element, {
          width: '100%', height: '200', videoId: id,
          playerVars: { autoplay: wantsPlayback.current ? 1 : 0, playsinline: 1, controls: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => { if (cancelled) return; playerRef.current = player; player?.setVolume(volumeRef.current); requestPlay.current?.(); setStatus(''); },
            onError: () => { if (!cancelled) setStatus('이 영상은 재생할 수 없습니다. YouTube 링크를 확인해 주세요.'); },
            onAutoplayBlocked: blocked,
            onStateChange: event => {
              if (cancelled) return;
              reportPlaying(event.data === 1);
              if (event.data === 1) setStatus('재생 중');
              if (event.data === 0 && wantsPlayback.current && trackRef.current?.loop !== false) { player?.seekTo(0, true); player?.playVideo(); }
            },
          },
        });
      }).catch(() => { if (!cancelled) setStatus('YouTube에 연결할 수 없습니다. 링크를 직접 열어 주세요.'); });
    }
    return () => {
      cancelled = true;
      document.removeEventListener('click', retryBlocked);
      document.removeEventListener('keydown', retryBlocked);
      audio?.pause(); player?.destroy(); playerRef.current = null; host?.replaceChildren();
      requestPlay.current = null;
    };
  }, [trackKey, id, audioSource, enabled, channel]);

  const changeVolume = (value: number) => {
    volumeRef.current = muted ? 0 : value;
    if (audioRef.current) audioRef.current.volume = volumeRef.current / MAX_VOLUME;
    playerRef.current?.setVolume(volumeRef.current);
    setVolumeOverride(value);
    try {
      window.localStorage.setItem(`${VOLUME_STORAGE_KEY}-${channel}`, JSON.stringify(value));
    } catch { /* Keep the session selection even without storage. */ }
  };
  const resume = () => {
    wantsPlayback.current = true;
    requestPlay.current?.();
  };
  const toggle = () => {
    if (playingRef.current) {
      wantsPlayback.current = false;
      audioRef.current?.pause(); playerRef.current?.pauseVideo();
      playingRef.current = false;
      setPlaying(false);
    } else resume();
  };
  const media = <>
    {audioSource && <audio ref={audioRef} src={audioSource} loop={track?.loop !== false} controls preload="auto" className="w-full" onVolumeChange={event => {
      const nextVolume = event.currentTarget.volume * MAX_VOLUME;
      if (Math.abs(nextVolume - volumeRef.current) > Number.EPSILON * MAX_VOLUME) changeVolume(nextVolume);
    }} onPlay={() => { playingRef.current = true; startupPending.current = false; setPlaying(true); }} onPause={() => { playingRef.current = false; setPlaying(false); }} onEnded={() => { playingRef.current = false; setPlaying(false); }} onError={() => setStatus('음악을 불러올 수 없습니다. 원본 주소를 확인해 주세요.')} />}
    {id && !audioSource && <div ref={hostRef} className="min-h-[12.5rem] w-full [&_iframe]:h-[12.5rem] [&_iframe]:w-full" />}
  </>;
  const fullControls = <section className="min-w-0 space-y-2 border-t border-white/15 py-3 text-sm">
    <p className="text-xs text-stone-400">BGM {channel}</p>
    <p className="break-words">{track?.audioName || (track ? '배경 음악' : '재생할 곡 없음')}</p>
    {track && <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggle} className="rounded border border-white/20 px-2 py-1">{playing ? '음악 일시정지' : '음악 재생'}</button>
        <button type="button" aria-pressed={muted} onClick={() => setMuted(value => !value)} className="rounded border border-white/20 px-2 py-1">{muted ? '음소거 해제' : '음소거'}</button>
        <label className="flex items-center gap-2">볼륨 <input aria-label={`BGM ${channel} 볼륨`} type="range" min="0" max="100" value={volumeOverride ?? recordedVolume(track)} onChange={event => changeVolume(Number(event.target.value))} className="w-24" /></label>
      </div>
      {!compact && media}
      <p role="status" className="text-xs text-stone-400">{!audioSource && !id ? '이 곡에는 재생 주소가 연결되어 있지 않습니다.' : status}</p>
      {id && <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noreferrer" className="text-xs underline">YouTube에서 열기</a>}
    </>}
  </section>;
  if (compact) return <div ref={controlsRef} className="relative min-w-0" onClick={event => event.stopPropagation()}>
    <button type="button" disabled={!enabled} onClick={() => setExpanded(value => !value)} aria-label={`BGM ${channel} 조절`} aria-expanded={expanded} aria-controls={panelId} title={track?.audioName || `BGM ${channel}`} className="inline-flex items-center gap-2 rounded border border-[var(--atr-line)] px-3 py-2 text-xs text-[var(--ledger-muted)] disabled:opacity-40">
      <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span><span>BGM {channel}</span>
    </button>
    <motion.div id={panelId} role="group" aria-label={`BGM ${channel} 조절`} inert={!expanded || !enabled} initial={false}
      animate={{ opacity: expanded && enabled ? 1 : 0, y: expanded && enabled ? 0 : reducedMotion ? 0 : -CONTROLS_OFFSET_REM + 'rem' }}
      transition={{ duration: reducedMotion ? 0 : CONTROLS_TRANSITION_SECONDS }}
      className={`${expanded && enabled ? 'visible' : 'invisible pointer-events-none'} absolute left-0 top-full z-40 mt-2 w-[min(18rem,65vw)] space-y-3 rounded-lg border border-[var(--atr-line)] bg-[var(--atr-bg)] p-4 text-sm text-[var(--atr-text)] shadow-lg`}>
      <p className="break-words text-xs text-[var(--ledger-muted)]">{track?.audioName || (track ? '배경 음악' : '재생할 곡 없음')}</p>
      <div className="flex items-center gap-3">
        <button type="button" disabled={!playable} onClick={toggle} aria-label={`BGM ${channel} ${playing ? '일시정지' : '재생'}`} className="shrink-0 rounded border border-[var(--atr-line)] px-3 py-2 text-xs disabled:opacity-40">{playing ? '일시정지' : '재생'}</button>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">볼륨
          <input aria-label={`BGM ${channel} 볼륨`} type="range" min="0" max="100" disabled={!playable} value={volumeOverride ?? recordedVolume(track)} onChange={event => changeVolume(Number(event.target.value))} className="min-w-0 flex-1 accent-[var(--ledger-muted)]" />
          <span className="w-8 text-right tabular-nums">{volumeOverride ?? recordedVolume(track)}</span>
        </label>
      </div>
    </motion.div>
    <div inert className="invisible pointer-events-none absolute right-0 top-full w-[20rem]" aria-hidden="true">{media}</div>
    <span className="sr-only" role="status">{status}</span>
    {controlsHost && createPortal(fullControls, controlsHost)}
  </div>;
  return fullControls;
}

export default function CinematicMusic({ scene, replay, baseUrl, onControlsHost }: { scene: ReplaySceneState; replay: CinematicReplay; baseUrl?: string; onControlsHost?: (host: HTMLDivElement | null) => void }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  // Keep media laid out even when the controls are closed so the first iframe loads.
  return <div className="shrink-0 text-stone-200 md:relative" onClick={event => event.stopPropagation()}>
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)} className="cursor-pointer whitespace-nowrap rounded border border-white/20 bg-white/5 px-2 py-2 text-xs md:px-4 md:text-sm">BGM</button>
    <div id={panelId} inert={!expanded} className={`${expanded ? 'visible' : 'invisible pointer-events-none'} absolute inset-x-0 top-full z-50 mx-3 mt-2 max-h-[65vh] overflow-y-auto rounded-lg border border-white/20 bg-[#17191c] p-4 shadow-xl md:left-auto md:right-0 md:mx-0 md:w-[min(24rem,85vw)]`}>
      {onControlsHost ? <div ref={onControlsHost} /> : <>
        <MusicChannel channel={1} track={scene.bgm01} replay={replay} baseUrl={baseUrl} />
        <MusicChannel channel={2} track={scene.bgm02} replay={replay} baseUrl={baseUrl} />
      </>}
    </div>
  </div>;
}
