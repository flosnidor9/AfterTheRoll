'use client';

import { useEffect, useState } from 'react';
import type { ImageProps } from 'next/image';
import Image from '@/components/ArchiveImage';
import { archiveApiUrl, archiveConnected } from '@/lib/archiveApi';
import { downloadArchiveFile, type DownloadTransfer } from '@/lib/archiveTransfers';

const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

export default function GalleryImage(props: ImageProps) {
  const source = typeof props.src === 'string' ? props.src : '';
  const segmented = archiveConnected() && source.startsWith(archiveApiUrl('/photos/'));
  const [resolved, setResolved] = useState<{ source: string; url: string; error?: string } | null>(null);
  useEffect(() => {
    if (!segmented) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let active = true;
    void (async () => {
      const response = await fetch(`${source}/manifest`, { cache: 'no-store', signal: controller.signal });
      if (response.status === 404) { if (active) setResolved({ source, url: source }); return; }
      if (!response.ok) throw new Error('사진을 불러오지 못했습니다.');
      const manifest = await response.json() as DownloadTransfer & { mime: string };
      const bytes = await downloadArchiveFile(manifest, controller.signal);
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: manifest.mime }));
      if (active) setResolved({ source, url: objectUrl });
      else URL.revokeObjectURL(objectUrl);
    })().catch(() => { if (active) setResolved({ source, url: '', error: '사진을 불러오지 못했습니다. 다시 열어 주세요.' }); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [segmented, source]);
  if (!segmented) return <Image {...props} alt={props.alt} />;
  if (resolved?.source === source && resolved.error) return <span role="img" aria-label={props.alt} className="grid h-full place-items-center text-xs text-[var(--atr-muted)]">{resolved.error}</span>;
  return <Image {...props} alt={props.alt} src={resolved?.source === source ? resolved.url : PLACEHOLDER} unoptimized />;
}
