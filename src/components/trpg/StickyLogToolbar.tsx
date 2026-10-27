'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { pinnedToolbarTop } from '@/lib/trpgLogPlayback';

type Props = {
  children: ReactNode;
  toolbarRef: RefObject<HTMLDivElement | null>;
  readerRef: RefObject<HTMLElement | null>;
};

export default function StickyLogToolbar({ children, toolbarRef, readerRef }: Props) {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    const toolbar = toolbarRef.current;
    const reader = readerRef.current;
    if (!slot || !toolbar || !reader) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const rect = slot.getBoundingClientRect();
      toolbar.style.width = `${rect.width / rem}rem`;
      const height = toolbar.getBoundingClientRect().height;
      slot.style.height = `${height / rem}rem`;
      toolbar.style.left = `${rect.left / rem}rem`;
      toolbar.style.top = `${pinnedToolbarTop(rect.top, reader.getBoundingClientRect().bottom, height) / rem}rem`;
      toolbar.style.visibility = 'visible';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(toolbar);
    observer.observe(slot);
    observer.observe(reader);
    // Capture also covers wheel/touch scrolling inside an archive pane.
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule);
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [toolbarRef, readerRef]);

  return (
    <>
      <div ref={slotRef} className="mt-[0.65rem]" />
      {typeof document !== 'undefined' && createPortal(
        <div ref={toolbarRef} role="group" aria-label="로그 보기 설정" className="trpg-reader-toolbar invisible fixed z-30 flex flex-wrap items-center justify-between gap-2 border-y border-[var(--atr-line)] bg-[#fff9fb] px-3 py-3 text-sm text-[var(--ledger-muted)]">
          {children}
        </div>, document.body,
      )}
    </>
  );
}
