'use client';

import Image from 'next/image';
import { createPortal, flushSync } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry } from './TrpgLogReader';
import CinematicDialogue from './CinematicDialogue';
import CinematicScene from './CinematicScene';
import CinematicMusic from './CinematicMusic';
import { SCENE_TRANSITION_SECONDS, type CinematicReplay, type ReplayStep } from '@/lib/cinematicReplay';

type Props = {
  entries: LogEntry[];
  fontFamily: string;
  getStartIndex: () => number;
  onClose: (entry: LogEntry) => void;
  onOpenChange?: (open: boolean) => void;
  onPlaybackIndexChange?: (index: number) => void;
  onMusicControlsHost?: (host: HTMLDivElement | null) => void;
  replay?: CinematicReplay;
  replaySteps?: ReplayStep[];
  replayBaseUrl?: string;
};
const TRANSITION_SECONDS = 0.2;
const PLAYBACK_SPEEDS = [
  { value: 0, label: '0 · 즉시 표시' },
  { value: 1, label: '1 · 가장 빠르게' },
  { value: 2, label: '2 · 보통' },
  { value: 3, label: '3 · 느리게' },
  { value: 4, label: '4 · 더 느리게' },
  { value: 5, label: '5 · 가장 느리게' },
] as const;
const DEFAULT_PLAYBACK_SPEED = 2;
const AUTO_ADVANCE_BASE_MS = 1800;
const AUTO_ADVANCE_CHARACTER_MS = 30;
const AUTO_ADVANCE_MAX_MS = 10000;
const INITIAL_POSITION = { index: 0, complete: false, reveal: false };
const CONTROL_CLASS = 'shrink-0 whitespace-nowrap rounded border border-white/20 bg-[#17191c]/85 px-2 py-2 text-xs text-stone-200 hover:bg-[#242629] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-300 disabled:opacity-30 md:px-4 md:text-sm';

export default function CinematicLogPlayer({ entries, fontFamily, getStartIndex, onClose, onOpenChange, onPlaybackIndexChange, onMusicControlsHost, replay, replaySteps, replayBaseUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(INITIAL_POSITION);
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_PLAYBACK_SPEED);
  const [autoPlay, setAutoPlay] = useState(false);
  const [scenePending, setScenePending] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const enteredFullscreen = useRef(false);
  const closingRef = useRef(false);
  const activeEntryRef = useRef<LogEntry | undefined>(undefined);
  const reducedMotion = useReducedMotion();
  const entry = entries[position.index];
  const scene = entry?.replayStep !== undefined ? replaySteps?.[entry.replayStep]?.state : undefined;
  const lastEntry = position.index === entries.length - 1;
  const isNarration = entry?.isNarrator || entry?.kind === 'media' || !entry?.speaker;

  useEffect(() => { if (entry && !entry.sceneOnly) activeEntryRef.current = entry; }, [entry]);
  useEffect(() => {
    if (open) onPlaybackIndexChange?.(position.index);
  }, [open, position.index, onPlaybackIndexChange]);

  const close = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const lastViewed = activeEntryRef.current;
    setOpen(false);
    onOpenChange?.(false);
    if (lastViewed) onClose(lastViewed);
    if (document.fullscreenElement === dialogRef.current) await document.exitFullscreen().catch(() => {});
  }, [onClose, onOpenChange]);

  const complete = useCallback(() => {
    setPosition((current) => current.complete ? current : { ...current, complete: true });
  }, []);

  const advance = useCallback(() => {
    setPosition((current) => {
      if (!current.complete && !entries[current.index]?.sceneOnly) return { ...current, reveal: true };
      if (current.index >= entries.length - 1) return current;
      return { index: current.index + 1, complete: false, reveal: false };
    });
  }, [entries]);

  const previous = useCallback(() => {
    setPosition((current) => {
      let index = Math.max(0, current.index - 1);
      while (index > 0 && entries[index]?.sceneOnly) index--;
      return { index, complete: false, reveal: false };
    });
  }, [entries]);

  // Scene-only steps wait for input just like dialogue, unless autoplay is on.
  useEffect(() => {
    if (!open || !entry?.sceneOnly || scenePending) return;
    let frame: number;
    let started: number | undefined;
    const tick = (time: number) => {
      if (document.hidden) started = undefined;
      else started ??= time;
      if (started !== undefined && time - started >= SCENE_TRANSITION_SECONDS * 1000) {
        setPosition(current => current.index !== position.index || current.complete ? current : { ...current, complete: true });
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, entry?.sceneOnly, position.index, scenePending, entries.length]);

  useEffect(() => {
    if (!open || !autoPlay || !position.complete || lastEntry || scenePending) return;
    const characterCount = Array.from(textRef.current?.textContent ?? '').length;
    const delay = entry?.sceneOnly ? SCENE_TRANSITION_SECONDS * 1000 + TRANSITION_SECONDS * 1000 : Math.min(AUTO_ADVANCE_MAX_MS, AUTO_ADVANCE_BASE_MS + characterCount * AUTO_ADVANCE_CHARACTER_MS);
    let elapsed = 0;
    let previousTime: number | undefined;
    let frame: number;
    const tick = (time: number) => {
      // Pause the reading delay while another tab is active or embedded media plays.
      const mediaPlaying = Array.from(textRef.current?.querySelectorAll('audio, video') ?? [])
        .some((media) => media instanceof HTMLMediaElement && !media.paused && !media.ended);
      if (!document.hidden && !mediaPlaying) elapsed += time - (previousTime ?? time);
      previousTime = document.hidden || mediaPlaying ? undefined : time;
      if (elapsed >= delay) advance();
      else frame = requestAnimationFrame(tick);
    };
    const resetClock = () => { previousTime = undefined; };
    document.addEventListener('visibilitychange', resetClock);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', resetClock);
    };
  }, [open, autoPlay, position, lastEntry, advance, entry?.sceneOnly, scenePending]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const background = Array.from(document.body.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child !== dialogRef.current);
    const inertStates = background.map((element) => ({ element, inert: element.inert }));
    for (const { element } of inertStates) element.inert = true;
    const trigger = triggerRef.current;
    const fullscreenChange = () => {
      if (document.fullscreenElement === dialogRef.current) enteredFullscreen.current = true;
      else if (enteredFullscreen.current) close();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]') ?? []).filter(element => !element.closest('[inert]') && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      } else if (event.target instanceof Element && (
        event.target.closest('input, select, textarea') ||
        (event.target.closest('button, a, summary') && [' ', 'Enter'].includes(event.key))
      )) {
        return;
      } else if (!event.repeat && [' ', 'Enter', 'ArrowRight', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'ArrowLeft') previous();
        else advance();
      }
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('fullscreenchange', fullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const { element, inert } of inertStates) element.inert = inert;
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('fullscreenchange', fullscreenChange);
      trigger?.focus({ preventScroll: true });
    };
  }, [open, close, advance, previous]);

  const startAt = useCallback((index: number) => {
    if (!entries.length) return;
    enteredFullscreen.current = false;
    closingRef.current = false;
    flushSync(() => {
      const startIndex = Math.max(0, Math.min(index, entries.length - 1));
      setPosition({ ...INITIAL_POSITION, index: startIndex });
      onPlaybackIndexChange?.(startIndex);
      setOpen(true);
      onOpenChange?.(true);
    });
    // Mobile browsers without Fullscreen API still get a viewport-filling player.
    if (dialogRef.current?.requestFullscreen) void dialogRef.current.requestFullscreen().catch(() => {});
  }, [entries.length, onOpenChange, onPlaybackIndexChange]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => startAt(getStartIndex())} disabled={!entries.length} className="rounded border border-[var(--atr-line)] bg-transparent px-3 py-2 text-sm text-[var(--ledger-muted)] hover:bg-[var(--atr-bg-soft)] disabled:opacity-40">
        시네마틱 보기
      </button>
      {open && entry && createPortal(
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="로그 시네마틱 보기"
          aria-describedby="cinematic-help"
          tabIndex={-1}
          style={{ '--trpg-log-font-family': fontFamily } as CSSProperties}
          className="trpg-cinematic-player fixed inset-0 z-[9999] flex h-[100dvh] w-full select-none flex-col overflow-hidden bg-[#242629] text-[#e4e0da] outline-none"
          onDragStart={(event) => event.preventDefault()}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('button, a, audio, video, input, select, textarea, label, details')) return;
            dialogRef.current?.focus();
            advance();
          }}
        >
          <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end p-3 md:px-8 md:py-6">
            <div className="pointer-events-auto flex min-w-0 flex-nowrap items-center justify-end gap-1 md:gap-2">
              {replay && scene && <CinematicMusic scene={scene} replay={replay} baseUrl={replayBaseUrl} onControlsHost={onMusicControlsHost} />}
              <label className="flex shrink-0 items-center gap-1 text-xs text-stone-400 md:gap-2 md:text-sm">
                <span>속도</span>
                <select value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.target.value))} className={`${CONTROL_CLASS} w-12 md:w-auto`}>
                  {PLAYBACK_SPEEDS.map(({ value, label }) => <option key={value} value={value} className="bg-[#242629] text-stone-200">{label}</option>)}
                </select>
              </label>
              <button type="button" aria-pressed={autoPlay} onClick={() => setAutoPlay((current) => !current)} className={`${CONTROL_CLASS} aria-pressed:border-stone-300`}>
                자동재생
              </button>
              <button type="button" onClick={close} className={CONTROL_CLASS}>닫기 <span className="hidden md:inline">· Esc</span></button>
            </div>
          </header>
          <div className="absolute inset-0 isolate flex min-h-0 flex-col justify-end px-4 pb-4 md:px-[8vw] md:pb-8">
            {replay && scene && <CinematicScene scene={scene} replay={replay} baseUrl={replayBaseUrl} onPendingChange={setScenePending} />}
            {!entry.sceneOnly && <div className="pointer-events-none relative z-10 min-h-0 w-full max-w-6xl self-center">
              <div className="relative h-[clamp(0rem,calc(100dvh-22rem),40vh)] md:h-[clamp(0rem,calc(100dvh-24rem),40vh)]" aria-hidden="true">
                <AnimatePresence initial={false}>
                  {!isNarration && entry.avatarSrc && (
                    <motion.div
                      key={entry.speaker}
                      initial={{ opacity: 0, y: reducedMotion ? 0 : '0.75rem' }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reducedMotion ? 0 : TRANSITION_SECONDS }}
                      className="absolute inset-y-0 inset-x-0 mx-auto w-[72vw] max-w-md md:inset-x-auto md:left-8 md:mx-0 md:w-[28vw] md:max-w-sm"
                    >
                      <Image key={entry.avatarSrc} src={entry.avatarSrc} alt="" fill sizes="(min-width: 48rem) 28vw, 72vw" unoptimized className="object-contain object-bottom" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <section className={`pointer-events-auto relative flex flex-col rounded-lg border border-white/15 bg-[#17191c]/85 p-5 md:p-8 ${replay ? 'max-h-[36vh] min-h-[8rem] md:min-h-[10rem]' : 'max-h-[46vh] min-h-[12rem] md:min-h-[14rem]'}`}>
                <button type="button" onClick={previous} disabled={!entries.slice(0, position.index).some(previousEntry => !previousEntry.sceneOnly)} className={`${CONTROL_CLASS} absolute bottom-full right-0 mb-2`}>이전</button>
                {!isNarration && (
                  <p className="mb-3 shrink-0 text-sm font-medium tracking-wide text-[#c4b7a8] md:text-base">{entry.speaker}</p>
                )}
                <motion.div
                  key={entry.id}
                  ref={textRef}
                  initial={{ opacity: reducedMotion ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: TRANSITION_SECONDS }}
                  onAnimationStart={() => { if (textRef.current) textRef.current.scrollTop = 0; }}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
                  tabIndex={0}
                  aria-label="현재 대사"
                >
                  <CinematicDialogue html={entry.contentHtml} reveal={position.reveal} playbackSpeed={entry.sceneOnly ? 0 : playbackSpeed} preserveLineBreaks={entry.preserveLineBreaks} onComplete={complete} />
                </motion.div>
              </section>
            </div>}
          </div>
          <p id="cinematic-help" className="sr-only">
              <span className="md:hidden">터치로 다음</span>
              <span className="hidden md:inline">클릭·터치 / Space·Enter 다음 · ← 이전</span>
          </p>
        </div>, document.body,
      )}
    </>
  );
}
