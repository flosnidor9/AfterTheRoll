'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PhotoPlacement } from '@/lib/galleryOrder';

const SCROLL_EDGE_REM = 5;
const SCROLL_SPEED_REM_PER_SECOND = 36;
const MAX_FRAME_SECONDS = 0.05;

type Destination = { id: string; placement: PhotoPlacement };
type Drag = { id: string; x: number; y: number; width: number; height: number; offsetX: number; offsetY: number };

export function usePhotoSort(onMove: (id: string, targetId: string, placement: PhotoPlacement) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const destinationRef = useRef<Destination | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, id: 0 });
  const scrollRef = useRef<HTMLElement | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);

  function start(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    pointerRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    scrollRef.current = event.currentTarget.closest<HTMLElement>('[role="dialog"]');
    destinationRef.current = null;
    setDestination(null);
    setDrag({ id, x: rect.left / rem, y: rect.top / rem, width: rect.width / rem, height: rect.height / rem, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top });
  }

  useEffect(() => {
    if (!drag) return;
    const active = drag;
    let frame = 0;
    let previousTime = 0;
    const rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const locate = () => {
      const pointer = pointerRef.current;
      const element = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('[data-sort-target]');
      let next: Destination | null = null;
      if (element?.dataset.sortTarget && element.dataset.sortTarget !== active.id) {
        const rect = element.getBoundingClientRect();
        const placement = element.dataset.sortPlacement as PhotoPlacement | undefined;
        next = { id: element.dataset.sortTarget, placement: placement ?? (pointer.x < rect.left + rect.width / 2 ? 'before' : 'after') };
      }
      destinationRef.current = next;
      setDestination((current) => current?.id === next?.id && current?.placement === next?.placement ? current : next);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerRef.current.id) return;
      event.preventDefault();
      pointerRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      setDrag((current) => current ? { ...current, x: (event.clientX - active.offsetX) / rootRem, y: (event.clientY - active.offsetY) / rootRem } : null);
      locate();
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerRef.current.id) return;
      if (event.type === 'pointerup') {
        pointerRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        locate();
        const target = destinationRef.current;
        if (target) onMoveRef.current(active.id, target.id, target.placement);
      }
      setDrag(null);
      setDestination(null);
      destinationRef.current = null;
    };
    const cancel = () => { setDrag(null); setDestination(null); destinationRef.current = null; };
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
    const scroll = (time: number) => {
      const elapsed = previousTime ? Math.min((time - previousTime) / 1000, MAX_FRAME_SECONDS) : 0;
      previousTime = time;
      const container = scrollRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const edge = SCROLL_EDGE_REM * rootRem;
        const pointerY = pointerRef.current.y;
        const top = Math.max(rect.top, 0);
        const bottom = Math.min(rect.bottom, window.innerHeight);
        const speed = pointerY < top + edge ? -Math.min(1, (top + edge - pointerY) / edge)
          : pointerY > bottom - edge ? Math.min(1, (pointerY - bottom + edge) / edge) : 0;
        if (speed) {
          container.scrollTop += speed * SCROLL_SPEED_REM_PER_SECOND * rootRem * elapsed;
          locate();
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', keyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', keyDown);
    };
    // Position updates must not interrupt the active pointer session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  return { drag, destination, start };
}
