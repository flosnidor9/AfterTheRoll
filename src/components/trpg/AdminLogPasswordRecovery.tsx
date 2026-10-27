'use client';

import { useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { decryptWithMasterKey } from '@/lib/trpgUpload';
import { isEncryptedPasswordArchive, loadTrpgPasswordArchive, saveTrpgPasswordArchive } from '@/lib/data/firebaseTrpgPasswords';

type Props = {
  passwordKey: string;
};

export default function AdminLogPasswordRecovery({ passwordKey }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsImport, setNeedsImport] = useState(false);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);

  async function revealPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const masterKey = inputRef.current?.value ?? '';
    if (!masterKey || loading) return;
    setPassword(null);
    setError('');
    setLoading(true);
    try {
      let encryptedPasswords = await loadTrpgPasswordArchive();
      if (!encryptedPasswords) {
        setNeedsImport(true);
        if (!archiveFile) {
          setError('관리자 비밀번호 보관함이 비어 있습니다. 기존 passwords.enc.json 파일을 선택하고 마스터 비밀번호를 다시 입력해 주세요.');
          return;
        }
        const imported: unknown = JSON.parse(await archiveFile.text());
        if (!isEncryptedPasswordArchive(imported)) throw new Error('invalid archive');
        encryptedPasswords = imported;
      }
      const passwords: unknown = JSON.parse(await decryptWithMasterKey(encryptedPasswords, masterKey));
      if (!passwords || typeof passwords !== 'object' || Array.isArray(passwords)
        || !Object.values(passwords).every((value) => typeof value === 'string')) throw new Error('invalid passwords');
      if (needsImport || archiveFile) {
        // Validate decryption before importing; never upload a plaintext archive.
        // Recheck the server document to avoid replacing an existing archive.
        if (!(await loadTrpgPasswordArchive())) await saveTrpgPasswordArchive(encryptedPasswords);
        setNeedsImport(false);
        setArchiveFile(null);
      }
      const postSlug = passwordKey.split('/').at(-1) ?? '';
      const entries = passwords as Record<string, unknown>;
      const savedPassword = Object.hasOwn(entries, passwordKey) ? entries[passwordKey] : Object.hasOwn(entries, postSlug) ? entries[postSlug] : undefined;
      if (typeof savedPassword !== 'string' || !savedPassword) {
        setError('이 로그에 저장된 비밀번호가 없습니다.');
        return;
      }
      setPassword(savedPassword);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      setError(code === 'permission-denied'
        ? '비밀번호 보관함 접근이 거부되었습니다. 관리자 계정과 Firestore 보안 규칙을 확인해 주세요.'
        : code === 'unavailable'
          ? '서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
          : '마스터 비밀번호가 올바르지 않거나 비밀번호 목록을 읽을 수 없습니다.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      setLoading(false);
    }
  }

  return (
    <form onSubmit={revealPassword} className="afterroll-meta mt-[1.5rem] flex w-full max-w-[22rem] flex-col gap-[0.75rem] border-t border-[var(--atr-line)] pt-[1.5rem] text-sm text-[var(--ledger-muted)]">
      <label htmlFor={inputId}>관리자 · 마스터 비밀번호</label>
      <input
        id={inputId}
        ref={inputRef}
        type="password"
        required
        disabled={loading}
        autoComplete="off"
        onChange={() => { setPassword(null); setError(''); }}
        placeholder="마스터 비밀번호"
        className="ledger-paper-sheet w-full rounded-[0.5rem] border border-[var(--atr-line)] px-[1rem] py-[0.75rem] text-base text-[var(--ledger-ink)] placeholder:text-[var(--ledger-soft)]"
      />
      {needsImport && <label className="flex flex-col gap-[0.5rem]">
        기존 암호화 비밀번호 목록 등록 (최초 1회)
        <input type="file" accept=".json,application/json" disabled={loading} onChange={(event) => { setArchiveFile(event.target.files?.[0] ?? null); setError(''); }} className="w-full min-w-0 text-sm" />
      </label>}
      <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.99 }} className="ledger-index-tab rounded-[0.5rem] py-[0.75rem] disabled:opacity-40">
        {loading ? '확인 중...' : '로그 비밀번호 확인'}
      </motion.button>
      <div role="status" aria-live="polite" className="break-words">
        {password !== null && <p>로그 비밀번호: <span className="select-all whitespace-pre-wrap text-[var(--ledger-ink)]">{password}</span></p>}
        {error && <p className="text-[var(--atr-warn)]">{error}</p>}
      </div>
    </form>
  );
}
