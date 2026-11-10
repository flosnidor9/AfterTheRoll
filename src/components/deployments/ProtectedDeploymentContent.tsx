'use client';

import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogPasswordRecovery from '@/components/trpg/AdminLogPasswordRecovery';
import DeploymentMarkdown from './DeploymentMarkdown';

type EncryptedData = { salt: string; iv: string; ciphertext: string; authTag: string };

function hexToBytes(value: string) {
  return Uint8Array.from(value.match(/.{1,2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

function arrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function decrypt(payload: EncryptedData, password: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: arrayBuffer(hexToBytes(payload.salt)), iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const cipher = hexToBytes(payload.ciphertext);
  const tag = hexToBytes(payload.authTag);
  const combined = new Uint8Array(cipher.length + tag.length);
  combined.set(cipher);
  combined.set(tag, cipher.length);
  const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: arrayBuffer(hexToBytes(payload.iv)) }, key, combined);
  return new TextDecoder().decode(result);
}

export default function ProtectedDeploymentContent({ privateUrl, passwordKey }: { privateUrl: string; passwordKey: string }) {
  const { isAdmin, user } = useAuth();
  const [password, setPassword] = useState('');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(privateUrl);
      if (!response.ok) throw new Error('Private content not found');
      setContent(await decrypt(await response.json() as EncryptedData, password));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (content !== null) {
    return <section className="deployment-prose mt-[2rem] border-t border-[var(--atr-line)] pt-[1.5rem]"><DeploymentMarkdown content={content} /></section>;
  }

  return (
    <section className="mt-[2rem] border-t border-[var(--atr-line)] pt-[1.5rem]">
      <p className="afterroll-meta text-[0.75rem] uppercase tracking-[0.12em] text-[var(--atr-accent)]">Protected section</p>
      <p className="afterroll-body mt-[0.35rem] text-[0.92rem] text-[var(--atr-muted)]">비밀번호를 아는 사람에게만 열리는 내용입니다.</p>
      <form onSubmit={handleSubmit} className="mt-[0.8rem] flex max-w-[28rem] gap-[0.5rem]">
        <input aria-label="비밀번호" type="text" value={password} onChange={(event) => { setPassword(event.target.value); setError(false); }} className="min-w-0 flex-1 rounded-[0.3rem] border border-[var(--atr-line)] px-[0.65rem] py-[0.45rem] text-[0.86rem]" />
        <motion.button type="submit" whileTap={{ scale: 0.98 }} disabled={loading} className="ledger-stamp rounded-[0.3rem] px-[0.8rem] py-[0.45rem] text-[0.82rem] disabled:opacity-50">{loading ? '확인 중' : '열기'}</motion.button>
      </form>
      {error ? <p className="mt-[0.45rem] text-[0.78rem] text-[var(--atr-warn)]">비밀번호가 맞지 않거나 보호 내용을 불러오지 못했습니다.</p> : null}
      {isAdmin && user?.emailVerified && (
        <AdminLogPasswordRecovery key={`${user.uid}/${passwordKey}`} passwordKey={passwordKey} contentLabel="게시글" />
      )}
    </section>
  );
}
