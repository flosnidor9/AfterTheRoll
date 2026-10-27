'use client';

import Image from 'next/image';
import { createPortal, flushSync } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry } from './TrpgLogReader';
import CinematicDialogue from './CinematicDialogue';

type Props = {
  entries: LogEntry[];
  fontFamily: string;
  getStartIndex: () => number;
  onClose: (entry: LogEntry) => void;
};
const TRANSITION_SECONDS = 0.2;
const INITIAL_POSITION = { index: 0, complete: false, reveal: false };
const CONTROL_CLASS = 'rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-stone-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-300 disabled:opacity-30';

export default function CinematicLogPlayer({ entries, fontFamily, getStartIndex, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(INITIAL_POSITION);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const enteredFullscreen = useRef(false);
  const closingRef = useRef(false);
  const activeEntryRef = useRef<LogEntry | undefined>(undefined);
  const reducedMotion = useReducedMotion();
  const entry = entries[position.index];
  const lastEntry = position.index === entries.length - 1;
  const isNarration = entry?.isNarrator || entry?.kind === 'media' || !entry?.speaker;

  useEffect(() => { activeEntryRef.current = entry; }, [entry]);

  const close = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const lastViewed = activeEntryRef.current;
    setOpen(false);
    if (document.fullscreenElement === dialogRef.current) await document.exitFullscreen().catch(() => {});
    if (lastViewed) onClose(lastViewed);
  }, [onClose]);

  const complete = useCallback(() => {
    setPosition((current) => current.complete ? current : { ...current, complete: true });
  }, []);

  const advance = useCallback(() => {
    setPosition((current) => {
      if (!current.complete) return { ...current, reveal: true };
      if (current.index >= entries.length - 1) return current;
      return { index: current.index + 1, complete: false, reveal: false };
    });
  }, [entries.length]);

  const previous = useCallback(() => {
    setPosition((current) => ({ index: Math.max(0, current.index - 1), complete: false, reveal: false }));
  }, []);

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
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      } else if (event.target instanceof Element && (
        event.target.closest('input, select, textarea') ||
        (event.target.closest('button, a') && [' ', 'Enter'].includes(event.key))
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
      setPosition({ ...INITIAL_POSITION, index: Math.max(0, Math.min(index, entries.length - 1)) });
      setOpen(true);
    });
    // Mobile browsers without Fullscreen API still get a viewport-filling player.
    if (dialogRef.current?.requestFullscreen) void dialogRef.current.requestFullscreen().catch(() => {});
  }, [entries.length]);

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
          className="trpg-cinematic-player fixed inset-0 z-[9999] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#242629] text-[#e4e0da] outline-none"
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('button, a, audio, video')) return;
            if (window.getSelection()?.toString()) return;
            dialogRef.current?.focus();
            advance();
          }}
        >
          <header className="flex shrink-0 items-center justify-between gap-4 p-4 md:px-8 md:py-6">
            <p className="text-sm tracking-widest text-stone-400" aria-live="off">{position.index + 1} / {entries.length}</p>
            <button type="button" onClick={close} className={CONTROL_CLASS}>닫기 <span className="hidden md:inline">· Esc</span></button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col justify-end px-4 pb-4 md:px-[8vw] md:pb-8">
            <div className="relative min-h-0 w-full max-w-6xl self-center">
              <div className="relative h-[clamp(0rem,calc(100dvh-22rem),32vh)] md:h-[clamp(0rem,calc(100dvh-24rem),40vh)]" aria-hidden="true">
                <AnimatePresence initial={false}>
                  {!isNarration && entry.avatarSrc && (
                    <motion.div
                      key={entry.avatarSrc}
                      initial={{ opacity: 0, y: reducedMotion ? 0 : '0.75rem' }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reducedMotion ? 0 : TRANSITION_SECONDS }}
                      className="absolute inset-y-0 left-2 w-[55vw] max-w-sm md:left-8 md:w-[28vw]"
                    >
                      <Image src={entry.avatarSrc} alt="" fill sizes="(min-width: 48rem) 28vw, 55vw" unoptimized className="object-contain object-bottom" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <section className="relative flex max-h-[46vh] min-h-[12rem] flex-col rounded-lg border border-white/15 bg-[#17191c]/85 p-5 md:min-h-[14rem] md:p-8">
                <p className="mb-3 shrink-0 text-sm font-medium tracking-wide text-[#c4b7a8] md:text-base">{isNarration ? '지문' : entry.speaker}</p>
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
                  <CinematicDialogue html={entry.contentHtml} reveal={position.reveal} preserveLineBreaks={entry.preserveLineBreaks} onComplete={complete} />
                </motion.div>
                <p role="status" className="mt-4 shrink-0 text-right text-xs text-stone-400">{position.complete ? (lastEntry ? '마지막 대사입니다' : '클릭하여 다음 대사 ▸') : '클릭하면 대사 전체 표시'}</p>
              </section>
            </div>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pb-4 md:px-[8vw] md:pb-6">
            <p id="cinematic-help" className="text-xs text-stone-400">클릭·터치 / Space·Enter 다음 · ← 이전</p>
            <div className="flex gap-2">
              <button type="button" onClick={previous} disabled={position.index === 0} className={CONTROL_CLASS}>이전</button>
              <button type="button" onClick={lastEntry && position.complete ? close : advance} className={CONTROL_CLASS}>{lastEntry && position.complete ? '감상 마치기' : position.complete ? '다음' : '전체 표시'}</button>
            </div>
          </footer>
        </div>, document.body,
      )}
    </>
  );
}
