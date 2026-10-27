'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TrpgLogReader from './TrpgLogReader';
import type { TrpgCastEntry } from '@/lib/data/trpg';
import { expandCcaArchive } from '@/lib/ccaArchive';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogPasswordRecovery from './AdminLogPasswordRecovery';

type EncryptedData = {
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

type Props = {
  encryptedUrl: string;
  passwordKey: string;
  fallbackAvatarSrc?: string;
  gmName?: string;
  cast?: TrpgCastEntry[];
  mainChannels?: string[];
  whisperChannels?: string[];
};

function hexToBuffer(hex: string): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function decryptContent(data: EncryptedData, password: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: hexToBuffer(data.salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const ciphertext = hexToBuffer(data.ciphertext);
  const authTag = hexToBuffer(data.authTag);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBuffer(data.iv) }, key, combined);

  return new TextDecoder().decode(decrypted);
}

export default function EncryptedTrpgLogReader({ encryptedUrl, passwordKey, fallbackAvatarSrc, gmName, cast, mainChannels, whisperChannels }: Props) {
  const { isAdmin, user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const password = inputRef.current?.value ?? '';
    if (!password.trim()) return;
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(encryptedUrl);
      if (!res.ok) throw new Error('not found');
      const data: EncryptedData = await res.json();
      const decrypted = await decryptContent(data, password);
      setHtmlContent(await expandCcaArchive(decrypted));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (htmlContent !== null) {
    return (
      <TrpgLogReader
        htmlUrl={encryptedUrl}
        htmlContent={htmlContent}
        fallbackAvatarSrc={fallbackAvatarSrc}
        gmName={gmName}
        cast={cast}
        mainChannels={mainChannels}
        whisperChannels={whisperChannels}
      />
    );
  }

  return (
    <div className="flex min-h-[24rem] flex-col items-center justify-center px-[1rem] py-[4rem]">
      <p className="afterroll-meta mb-[0.5rem] text-[1rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">
        Protected Archive
      </p>
      <p className="afterroll-body mb-[2.5rem] text-[0.95rem] text-[var(--ledger-muted)]">
        비밀번호를 입력하면 로그가 열립니다
      </p>

      <form onSubmit={handleSubmit} className="flex w-full max-w-[22rem] flex-col gap-[0.75rem]">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          onChange={(e) => {
            setIsEmpty(!e.target.value.trim());
            setError(false);
          }}
          placeholder="비밀번호"
          autoFocus
          className="ledger-paper-sheet w-full rounded-[0.5rem] border border-[rgba(87,67,48,0.18)] px-[1rem] py-[0.75rem] text-[0.95rem] text-[var(--ledger-ink)] placeholder-[var(--ledger-soft)] outline-none transition-all focus:border-[rgba(87,67,48,0.35)]"
        />

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="afterroll-meta text-center text-[0.8rem] text-red-700/60"
            >
              비밀번호가 올바르지 않습니다
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={loading || isEmpty}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="ledger-index-tab afterroll-meta rounded-[0.5rem] py-[0.75rem] text-[0.9rem] uppercase tracking-[0.1em] transition-colors hover:bg-[rgba(236,220,194,0.96)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? '확인 중...' : '입장'}
        </motion.button>
      </form>
      {isAdmin && user?.emailVerified && <AdminLogPasswordRecovery key={`${user.uid}/${passwordKey}`} passwordKey={passwordKey} />}
    </div>
  );
}
