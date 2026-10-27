import { doc, getDocFromServer, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { PUBLIC_SITE_CONFIG } from '@/lib/config/public';

export type EncryptedPasswordArchive = {
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

const COLLECTION = 'private_trpg_passwords';
const DOCUMENT = 'archive';

export function isEncryptedPasswordArchive(value: unknown): value is EncryptedPasswordArchive {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return Object.keys(payload).length === 4
    && typeof payload.salt === 'string' && /^[a-f0-9]{32}$/i.test(payload.salt)
    && typeof payload.iv === 'string' && /^[a-f0-9]{24}$/i.test(payload.iv)
    && typeof payload.authTag === 'string' && /^[a-f0-9]{32}$/i.test(payload.authTag)
    && typeof payload.ciphertext === 'string' && /^(?:[a-f0-9]{2})+$/i.test(payload.ciphertext);
}

function requireAdmin() {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.email !== PUBLIC_SITE_CONFIG.adminEmail) {
    throw new Error('이메일 인증을 마친 관리자 로그인이 필요합니다.');
  }
  return user.uid;
}

export async function loadTrpgPasswordArchive(): Promise<EncryptedPasswordArchive | null> {
  const uid = requireAdmin();
  // Always ask the server so revoked permissions cannot fall back to cached data.
  // Firestore Security Rules enforce authorization independently of this UI guard.
  const snapshot = await getDocFromServer(doc(db, COLLECTION, DOCUMENT));
  if (requireAdmin() !== uid) throw new Error('관리자 계정이 변경되었습니다. 다시 확인해 주세요.');
  if (!snapshot.exists()) return null;
  const payload: unknown = snapshot.data();
  if (!isEncryptedPasswordArchive(payload)) throw new Error('저장된 비밀번호 목록 형식이 올바르지 않습니다.');
  return payload;
}

export async function saveTrpgPasswordArchive(payload: EncryptedPasswordArchive) {
  requireAdmin();
  if (!isEncryptedPasswordArchive(payload)) throw new Error('암호화된 비밀번호 목록 형식이 올바르지 않습니다.');
  await setDoc(doc(db, COLLECTION, DOCUMENT), payload);
}
