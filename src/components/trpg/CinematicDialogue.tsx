'use client';

import DOMPurify from 'dompurify';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const CHARACTER_INTERVAL_MS = 28;

type Props = {
  html: string;
  reveal: boolean;
  preserveLineBreaks?: boolean;
  onComplete: () => void;
};

export default function CinematicDialogue({ html, reveal, preserveLineBreaks, onComplete }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.innerHTML = DOMPurify.sanitize(html, {
      FORBID_TAGS: ['style'],
      FORBID_ATTR: ['style', 'class', 'color', 'bgcolor', 'width', 'height'],
    });
    // Keep paragraphs, line breaks, images and dice tables intact while revealing text.
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; characters: string[]; start: number }[] = [];
    let total = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const characters = Array.from(node.textContent ?? '');
      nodes.push({ node, characters, start: total });
      total += characters.length;
    }
    if (reveal || reducedMotion || total === 0) {
      onComplete();
      return;
    }

    for (const { node } of nodes) node.textContent = '';
    let frame: number;
    let startedAt: number | undefined;
    let previousCount = -1;
    const tick = (time: number) => {
      startedAt ??= time;
      const count = Math.min(total, Math.floor((time - startedAt) / CHARACTER_INTERVAL_MS));
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
      className={`prose prose-invert max-w-none break-words text-base leading-relaxed text-inherit md:text-lg [&_*]:max-w-full [&_a]:underline [&_img]:mx-auto [&_img]:max-h-[35vh] [&_img]:object-contain [&_p]:my-2 [&_table]:w-full ${preserveLineBreaks ? 'whitespace-pre-wrap' : ''}`}
    />
  );
}
