'use client';

import { useMemo } from 'react';
import { useArchiveCatalog } from './useArchiveCatalog';
import { liveLogHref } from '@/lib/archiveApi';
import { toGalleryPath } from '@/lib/galleryPath';

export function useLiveLogLinks<T extends { href: string }>(bundled: T[]) {
  const { catalog } = useArchiveCatalog();
  return useMemo(() => {
    if (!catalog) return bundled;
    const hidden = new Set(catalog.deletedLogs.map(slug => `/archive/read/${toGalleryPath(slug)}`));
    return [
      ...catalog.logs.map(post => ({ playId: post.playId, calendarEventId: post.calendarEventId,
        sessionTitle: post.title, date: post.date, href: liveLogHref(post.archiveId) })),
      ...bundled.filter(link => !hidden.has(link.href)),
    ];
  }, [bundled, catalog]);
}
