'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { archiveRequest, type LiveLogRecord } from '@/lib/archiveApi';
import { downloadArchiveFile } from '@/lib/archiveTransfers';
import type { TrpgCastEntry } from '@/lib/data/trpg';
import { decryptContent } from './EncryptedTrpgLogReader';
import TrpgLogReader from './TrpgLogReader';
import TrpgCastPanel from './TrpgCastPanel';
import AdminLogPasswordRecovery from './AdminLogPasswordRecovery';
import { useAuth } from '@/contexts/AuthContext';

export default function LiveTrpgLogReader() {
  const id = useSearchParams().get('id');
  return <LogContent key={id} id={id} />;
}

function LogContent({ id }: { id: string | null }) {
  const { isAdmin } = useAuth();
  const [record, setRecord] = useState<LiveLogRecord | null>(null);
  const [content, setContent] = useState<{ html: string; cast: TrpgCastEntry[] } | null>(null);
  const [error, setError] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const password = useRef<HTMLInputElement>(null);
  const downloadController = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    if (!id || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) {
      void Promise.resolve().then(() => { if (active) setError('로그 주소를 확인해 주세요.'); });
      return () => { active = false; };
    }
    const controller = new AbortController();
    downloadController.current = controller;
    archiveRequest<LiveLogRecord>(`/logs/${id}`).then(async next => {
      if (next.transfer && !next.post.encrypted) {
        const source = await (await downloadArchiveFile(next.transfer, controller.signal)).text();
        next = { ...next, source };
      }
      if (!active) return;
      setRecord(next);
      if (!next.post.encrypted) {
        const payload = next.transfer ? JSON.parse(next.source || '') : { html: next.source, cast: next.post.cast };
        if (typeof payload.html !== 'string' || !Array.isArray(payload.cast)) throw new Error('로그 파일을 읽을 수 없습니다.');
        setContent(payload);
      }
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : '로그를 불러오지 못했습니다.'); });
    return () => { active = false; controller.abort(); };
  }, [id]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!record || !password.current?.value || unlocking) return;
    setUnlocking(true); setUnlockError('');
    try {
      let source = record.source;
      if (!source && record.transfer) {
        const ciphertext = await (await downloadArchiveFile(record.transfer, downloadController.current?.signal)).text();
        source = JSON.stringify({ ...record.transfer.envelope, ciphertext });
        setRecord({ ...record, source });
      }
      const decrypted = await decryptContent(JSON.parse(source || ''), password.current?.value || '');
      const payload = JSON.parse(decrypted) as { version: number; html: string; cast: TrpgCastEntry[] };
      if (payload.version !== 1 || typeof payload.html !== 'string' || !Array.isArray(payload.cast)) throw new Error('invalid source');
      setContent({ html: payload.html, cast: payload.cast });
    } catch { setUnlockError('비밀번호가 올바르지 않거나 로그를 열 수 없습니다.'); }
    finally { if (password.current) password.current.value = ''; setUnlocking(false); }
  }

  return <main className="afterroll-desk min-h-screen px-[1rem] pb-[4rem] pt-[5rem] md:px-[2rem]">
    <article className="ledger-paper-sheet mx-auto max-w-[72rem] overflow-hidden rounded-[0.45rem]">
      <header className="border-b border-[var(--atr-line)] p-[1.2rem]">
        <Link href="/logs" className="text-sm text-[var(--ledger-muted)]">← 로그 목록</Link>
        <h1 className="afterroll-title mt-[0.8rem] text-3xl text-[var(--ledger-ink)]">{record?.post.title ?? '로그'}</h1>
        {record ? <><p className="mt-[0.5rem] text-sm text-[var(--ledger-muted)]">{record.post.date}</p><p className="mt-[0.5rem] whitespace-pre-wrap text-base">{record.post.description}</p></> : null}
        {content && record ? <TrpgCastPanel gmName={record.post.gmName} gmIconSrc={record.post.gmIconSrc} cast={content.cast} /> : null}
      </header>
      {error ? <p role="alert" className="p-[1.2rem] text-sm text-[var(--atr-warn)]">{error}</p> : !record ? <p role="status" className="p-[1.2rem] text-sm">로그를 불러오는 중…</p> : content ? (
        <TrpgLogReader htmlUrl="" htmlContent={content.html} sourceFormat={record.post.sourceFormat} gmName={record.post.gmName} cast={content.cast} mainChannels={record.post.mainChannels} whisperChannels={record.post.whisperChannels} />
      ) : <div className="p-[1.2rem]">
        <form onSubmit={unlock} className="flex max-w-[24rem] flex-col gap-[0.75rem]">
          <label htmlFor="live-log-password" className="text-sm">로그 비밀번호</label>
          <input id="live-log-password" ref={password} type="password" autoComplete="off" required disabled={unlocking} className="rounded-[0.3rem] border border-[var(--atr-line)] p-[0.75rem] text-base" />
          <motion.button type="submit" disabled={unlocking} whileTap={{ scale: 0.99 }} className="ledger-index-tab p-[0.75rem] text-sm disabled:opacity-50">{unlocking ? '확인 중…' : '로그 열기'}</motion.button>
          {unlockError ? <p role="alert" className="text-sm text-[var(--atr-warn)]">{unlockError}</p> : null}
        </form>
        {isAdmin ? <AdminLogPasswordRecovery passwordKey={record.post.fullSlug} archiveId={record.post.archiveId} /> : null}
      </div>}
    </article>
  </main>;
}
