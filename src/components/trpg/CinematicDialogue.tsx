'use client';

import DOMPurify from 'dompurify';
import './logTemplates.css';
import { ensureReadableLogColors } from '@/lib/trpgLogColors';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const CHARACTER_INTERVAL_MS = 14;
const PUNCTUATION_PAUSE_MS: Record<string, number> = {
  ',': 60,
  '.': 90,
};

type Props = {
  html: string;
  reveal: boolean;
  playbackSpeed: number;
  preserveLineBreaks?: boolean;
  onComplete: () => void;
};

export default function CinematicDialogue({ html, reveal, playbackSpeed, preserveLineBreaks, onComplete }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(playbackSpeed);
  const reducedMotion = useReducedMotion();

  useEffect(() => { speedRef.current = playbackSpeed; }, [playbackSpeed]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.innerHTML = DOMPurify.sanitize(html, {
      FORBID_TAGS: ['style'],
      FORBID_ATTR: ['width', 'height'],
    });
    // Images are part of playback, so remove their navigation links in this view.
    content.querySelectorAll('a').forEach((link) => {
      if (link.querySelector('img, picture')) link.replaceWith(...link.childNodes);
    });
    ensureReadableLogColors(content);
    // Keep paragraphs, line breaks, images and dice tables intact while revealing text.
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; characters: string[]; start: number }[] = [];
    const revealTimes: number[] = [];
    let nextRevealAt = CHARACTER_INTERVAL_MS;
    let total = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      // A dice result is one visual unit: show the complete table/card immediately.
      if (node.parentElement?.closest('table, [class*="sheet-rolltemplate-"]')) continue;
      const characters = Array.from(node.textContent ?? '');
      for (const character of characters) {
        revealTimes.push(nextRevealAt);
        nextRevealAt += CHARACTER_INTERVAL_MS + (PUNCTUATION_PAUSE_MS[character] ?? 0);
      }
      nodes.push({ node, characters, start: total });
      total += characters.length;
    }
    if (reveal || reducedMotion || speedRef.current === 0 || total === 0) {
      onComplete();
      return;
    }

    for (const { node } of nodes) node.textContent = '';
    let frame: number;
    let previousTime: number | undefined;
    let elapsed = 0;
    let previousCount = -1;
    let count = 0;
    const tick = (time: number) => {
      if (speedRef.current === 0) count = total;
      else elapsed += (time - (previousTime ?? time)) / speedRef.current;
      previousTime = time;
      while (count < total && elapsed >= revealTimes[count]) count += 1;
      if (count !== previousCount) {
        for (const { node, characters, start } of nodes) {
          node.textContent = characters.slice(0, Math.max(0, count - start)).join('');
        }
        previousCount = count;
      }
      if (count < total) frame = requestAnimationFrame(tick);
      else onComplete();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [html, reveal, reducedMotion, onComplete]);

  return (
    <div
      ref={contentRef}
      className={`trpg-log-format trpg-cinematic-dialogue prose prose-invert max-w-none break-words text-base leading-relaxed text-inherit md:text-lg [&_*]:max-w-full [&_a]:underline [&_img]:mx-auto [&_img]:max-h-[35vh] [&_img]:object-contain [&_p]:my-2 [&_table]:w-full ${preserveLineBreaks ? 'whitespace-pre-wrap' : ''}`}
    />
  );
}
