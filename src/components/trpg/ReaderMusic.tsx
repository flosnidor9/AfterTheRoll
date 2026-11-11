'use client';

import { useEffect, useState, type RefObject } from 'react';
import type { CinematicReplay, ReplayStep } from '@/lib/cinematicReplay';
import type { LogEntry } from './TrpgLogReader';
import { MusicChannel } from './CinematicMusic';

type Props = {
  replay: CinematicReplay;
  steps: ReplayStep[];
  entries: LogEntry[];
  baseUrl?: string;
  readerRef: RefObject<HTMLElement | null>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  getStartIndex: () => number;
  pageEntries: LogEntry[];
  suspended: boolean;
  cinematicIndex: number;
  controlsHost: HTMLDivElement | null;
};

/** Follow the same visible message used when entering cinematic playback. */
export default function ReaderMusic({ replay, steps, entries, baseUrl, readerRef, toolbarRef, getStartIndex, pageEntries, suspended, cinematicIndex, controlsHost }: Props) {
  const [index, setIndex] = useState(0);
  // Remember the cinematic position so closing the dialog keeps its music
  // while the reader restores the corresponding page and scroll position.
  useEffect(() => {
    if (suspended) queueMicrotask(() => setIndex(cinematicIndex));
  }, [suspended, cinematicIndex]);
  const step = entries[suspended ? cinematicIndex : index]?.replayStep;
  const scene = steps[step ?? 0]?.state;

  useEffect(() => {
    if (suspended) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setIndex(getStartIndex());
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    if (readerRef.current) observer.observe(readerRef.current);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [getStartIndex, pageEntries, readerRef, toolbarRef, suspended]);

  if (!scene) return null;
  return <div role="group" aria-label="로그 BGM" className="flex items-center gap-2">
    <MusicChannel compact controlsHost={controlsHost} channel={1} track={scene.bgm01} replay={replay} baseUrl={baseUrl} />
    <MusicChannel compact controlsHost={controlsHost} channel={2} track={scene.bgm02} replay={replay} baseUrl={baseUrl} />
  </div>;
}
