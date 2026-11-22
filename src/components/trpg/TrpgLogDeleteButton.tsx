'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TrpgArchivePostMeta } from '@/lib/data/trpg';
import { deleteTrpgLogAtomically, saveTrpgPassword } from '@/lib/trpgUpload';
import { useAuth } from '@/contexts/AuthContext';

const FIELD_CLASS = 'mt-[0.3rem] w-full rounded-[0.3rem] border border-[var(--atr-line)] bg-white px-[0.65rem] py-[0.45rem] text-[0.86rem] text-[var(--atr-text)]';

export default function TrpgLogDeleteButton({ post }: { post: TrpgArchivePostMeta }) {
  const { isAdmin, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [status, setStatus] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  function close() {
    if (!isDeleting) setIsOpen(false);
  }

  async function remove() {
    if (!isAdmin || !token.trim()) {
      setStatus('GitHub access token을 입력해 주세요.');
      return;
    }
    if (post.encrypted && !masterKey) {
      setStatus('비공개 로그의 비밀번호도 함께 삭제하려면 마스터 키가 필요합니다.');
      return;
    }

    setIsDeleting(true);
    setStatus('로그를 삭제하고 있습니다.');
    try {
      await deleteTrpgLogAtomically(token, post);
      if (post.encrypted) await saveTrpgPassword(token, masterKey, `${post.folderSlug}/${post.slug}`);
      setStatus('삭제했습니다. 저장소 배포가 완료되면 목록과 본문에서 사라집니다.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '로그 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading || !isAdmin) return null;

  return <>
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="relative z-[2] rounded-[0.2rem] border border-[var(--atr-warn)] px-[0.55rem] py-[0.28rem] afterroll-meta text-[0.72rem] text-[var(--atr-warn)] transition-colors hover:bg-[rgba(190,107,94,0.08)]"
    >
      삭제
    </button>
    {isOpen ? (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-[rgba(76,51,61,0.38)] p-[1rem]" role="dialog" aria-modal="true" aria-labelledby="delete-log-title">
        <div className="ledger-paper-sheet mx-auto my-[2rem] max-w-[32rem] p-[1rem] md:p-[1.4rem]">
          <div className="flex items-start justify-between gap-[1rem] border-b border-[var(--atr-line)] pb-[0.8rem]">
            <div>
              <p className="afterroll-meta text-[0.72rem] uppercase tracking-[0.12em] text-[var(--atr-accent)]">Log management</p>
              <h2 id="delete-log-title" className="afterroll-title mt-[0.2rem] text-[1.8rem] text-[var(--atr-text)]">로그 삭제</h2>
            </div>
            <button type="button" onClick={close} className="afterroll-meta text-[0.78rem] text-[var(--atr-muted)]">닫기</button>
          </div>
          <p className="afterroll-body mt-[1rem] text-[0.9rem] leading-[1.65] text-[var(--atr-muted)]">
            <strong className="text-[var(--atr-text)]">{post.title}</strong> 로그와 첨부 미디어가 저장소에서 삭제됩니다. 이 작업은 되돌리려면 저장소에서 직접 복구해야 합니다.
          </p>
          {post.encrypted ? (
            <label className="mt-[0.75rem] block afterroll-meta text-[0.78rem] text-[var(--atr-muted)]">
              마스터 키
              <input type="password" value={masterKey} onChange={(event) => setMasterKey(event.target.value)} className={FIELD_CLASS} />
              <span className="mt-[0.25rem] block text-[0.7rem]">이 로그에 연결된 비밀번호를 함께 제거합니다.</span>
            </label>
          ) : null}
          <label className="mt-[0.75rem] block afterroll-meta text-[0.78rem] text-[var(--atr-muted)]">
            GitHub access token
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} className={FIELD_CLASS} />
            <span className="mt-[0.25rem] block text-[0.7rem]">토큰과 마스터 키는 저장하지 않습니다.</span>
          </label>
          {status ? <p className="mt-[0.8rem] afterroll-meta text-[0.82rem] text-[var(--atr-muted)]" role="status">{status}</p> : null}
          <div className="mt-[1rem] flex justify-end gap-[0.5rem]">
            <button type="button" onClick={close} className="ledger-index-tab rounded-[0.25rem] px-[0.75rem] py-[0.45rem] afterroll-meta text-[0.78rem]">취소</button>
            <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={remove} disabled={isDeleting} className="ledger-stamp rounded-[0.25rem] px-[0.8rem] py-[0.45rem] afterroll-meta text-[0.78rem] disabled:opacity-50">
              {isDeleting ? '삭제 중' : '삭제'}
            </motion.button>
          </div>
        </div>
      </div>
    ) : null}
  </>;
}
