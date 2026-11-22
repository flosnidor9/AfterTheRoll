'use client';

import { useState } from 'react';
import type { TrpgArchivePostMeta } from '@/lib/data/trpg';
import { archiveChanged, archiveRequest } from '@/lib/archiveApi';
import { useAuth } from '@/contexts/AuthContext';

export default function TrpgLogDeleteButton({ post }: { post: TrpgArchivePostMeta }) {
  const { isAdmin, loading } = useAuth();
  const [status, setStatus] = useState('');
  const [deleting, setDeleting] = useState(false);
  if (loading || !isAdmin) return null;
  async function remove() {
    const live = 'archiveId' in post;
    if (!window.confirm(live
      ? `“${post.title}” 로그를 삭제할까요? 과거 Git 기록과 다운로드된 사본은 남을 수 있습니다.`
      : `“${post.title}” 로그를 목록에서 숨길까요? 기존에 배포된 본문과 첨부파일은 별도 배포에서 제거해야 합니다.`)) return;
    setDeleting(true); setStatus('');
    try {
      if (live) await archiveRequest(`/logs/${encodeURIComponent(String(post.archiveId))}`, undefined, 'DELETE', true);
      else await archiveRequest('/legacy-logs/delete', { fullSlug: post.fullSlug }, 'POST', true);
      archiveChanged();
    } catch (error) { setStatus(error instanceof Error ? error.message : '로그 삭제 중 오류가 발생했습니다.'); }
    finally { setDeleting(false); }
  }
  return <div className="relative z-[2]">
    <button type="button" disabled={deleting} onClick={remove} className="rounded-[0.2rem] border border-[var(--atr-warn)] px-[0.55rem] py-[0.28rem] text-xs text-[var(--atr-warn)] disabled:opacity-50">{deleting ? '삭제 중…' : 'archiveId' in post ? '삭제' : '숨김'}</button>
    {status ? <p role="alert" className="max-w-[20rem] text-xs text-[var(--atr-warn)]">{status}</p> : null}
  </div>;
}
