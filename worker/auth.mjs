import { Buffer } from 'node:buffer';
import { ArchiveError } from './store.mjs';

let certificates;
let certificatesExpire = 0;
const unauthorized = () => new ArchiveError(401, 'Google 관리자 로그인이 필요합니다.');
export async function requireAdmin(request, env, fetcher = fetch) {
  if (!env.FIREBASE_PROJECT_ID || !env.ADMIN_UID || !env.FIREBASE_API_KEY) throw new ArchiveError(503, '관리자 인증 설정을 확인해 주세요.');
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-zA-Z0-9_.-]{1,8000}$/.test(authorization)) throw unauthorized();
  const token = authorization.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthorized();
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { throw unauthorized(); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.aud !== env.FIREBASE_PROJECT_ID
    || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || claims.sub !== env.ADMIN_UID
    || !Number.isSafeInteger(claims.exp) || claims.exp <= now || !Number.isSafeInteger(claims.iat) || claims.iat > now
    || !Number.isSafeInteger(claims.auth_time) || claims.auth_time > now
    || claims.email_verified !== true || claims.firebase?.sign_in_provider !== 'google.com') throw unauthorized();
  if (!certificates || Date.now() >= certificatesExpire) {
    const response = await fetcher('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new ArchiveError(503, '인증 서버에 연결하지 못했습니다.');
    certificates = (await response.json()).keys;
    certificatesExpire = Date.now() + 60 * 60 * 1000;
  }
  const jwk = certificates?.find(key => key.kid === header.kid);
  if (!jwk) { certificatesExpire = 0; throw unauthorized(); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(parts[2], 'base64url'), Buffer.from(`${parts[0]}.${parts[1]}`))) throw unauthorized();
  // Check disabled users and revoked sessions as well as signature/expiry.
  const response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw unauthorized();
  const user = (await response.json()).users?.[0];
  if (!user || user.localId !== env.ADMIN_UID || user.disabled || !user.emailVerified || Number(user.validSince || 0) > claims.auth_time) throw unauthorized();
  return claims.sub;
}
