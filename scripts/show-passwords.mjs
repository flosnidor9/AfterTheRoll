// passwords.enc.json 을 복호화해서 현재 비밀번호 목록을 보여줍니다.
// 사용법: TRPG_MASTER_KEY=yourkey node scripts/show-passwords.mjs
import { pbkdf2Sync, createDecipheriv } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { passwordArchivePath } from './trpg-password-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const masterKey = process.env.TRPG_MASTER_KEY;
if (!masterKey) {
  console.error('사용법: TRPG_MASTER_KEY=yourkey node scripts/show-passwords.mjs');
  process.exit(1);
}

const encPath = passwordArchivePath;
if (!fs.existsSync(encPath)) {
  console.error('passwords.enc.json 없음');
  process.exit(1);
}

const { salt, iv, ciphertext, authTag } = JSON.parse(fs.readFileSync(encPath, 'utf8'));
const key = pbkdf2Sync(masterKey, Buffer.from(salt, 'hex'), 100000, 32, 'sha256');
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
decipher.setAuthTag(Buffer.from(authTag, 'hex'));

let decrypted;
try {
  decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
} catch {
  console.error('복호화 실패 — TRPG_MASTER_KEY 가 맞지 않습니다');
  process.exit(1);
}

const passwords = JSON.parse(decrypted);

if (process.argv.includes('--restore')) {
  fs.writeFileSync(path.join(rootDir, 'passwords.json'), `${JSON.stringify(passwords, null, 2)}\n`);
  console.log('passwords.json restored');
  process.exit(0);
}
console.log('\n📋 현재 로그별 비밀번호\n');
for (const [slug, pw] of Object.entries(passwords)) {
  console.log(`  ${slug}`);
  console.log(`  → ${pw || '(미설정)'}\n`);
}
