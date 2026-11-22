'use client';

import { useEffect, useState } from 'react';
import { ARCHIVE_CHANGED, archiveConnected, archiveRequest, type ArchiveCatalog } from '@/lib/archiveApi';

export function useArchiveCatalog() {
  const [catalog, setCatalog] = useState<ArchiveCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!archiveConnected()) return;
    let active = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        const next = await archiveRequest<ArchiveCatalog>('/catalog');
        if (active && generation === request) { setCatalog(next); setError(''); }
      } catch (failure) {
        if (active && generation === request) setError(failure instanceof Error ? failure.message : '목록을 불러오지 못했습니다.');
      }
    };
    void refresh();
    window.addEventListener(ARCHIVE_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener(ARCHIVE_CHANGED, refresh); window.removeEventListener('focus', refresh); };
  }, []);
  return { catalog, error };
}
