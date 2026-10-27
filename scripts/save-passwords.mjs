// passwords.json → passwords.enc.json 으로 암호화합니다.
// 사용법: TRPG_MASTER_KEY=yourkey node scripts/save-passwords.mjs
import { pbkdf2Sync, createCipheriv, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { passwordArchivePath } from './trpg-password-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const masterKey = process.env.TRPG_MASTER_KEY;
if (!masterKey) {
  console.error('사용법: TRPG_MASTER_KEY=yourkey node scripts/save-passwords.mjs');
  process.exit(1);
}

const inputPath = path.join(rootDir, 'passwords.json');
if (!fs.existsSync(inputPath)) {
  console.error('passwords.json 없음 — passwords.json.example 을 복사해서 만들어주세요');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
try { JSON.parse(raw); } catch {
  console.error('passwords.json 이 올바른 JSON 형식이 아닙니다');
  process.exit(1);
}

const salt = randomBytes(16);
const key = pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();

fs.writeFileSync(
  passwordArchivePath,
  JSON.stringify({ salt: salt.toString('hex'), iv: iv.toString('hex'), ciphertext: ciphertext.toString('hex'), authTag: authTag.toString('hex') }, null, 2),
);

console.log('✓ passwords.enc.json 생성 완료 → 비공개 Trpg-Logs 저장소에만 저장하세요');
console.log('⚠  passwords.json 은 절대 커밋하지 마세요');
