import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { parseCinematicReplay } from '../src/lib/cinematicReplay.ts';
import { trpgPlatformLabel } from '../src/lib/trpgUpload.ts';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/lib/data/trpg.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

function encrypt(content, password) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', pbkdf2Sync(password, salt, 100000, 32, 'sha256'), iv);
  const ciphertext = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
  return JSON.stringify({ salt: salt.toString('hex'), iv: iv.toString('hex'), ciphertext: ciphertext.toString('hex'), authTag: cipher.getAuthTag().toString('hex') });
}

test('archive classifies existing encrypted cinematic logs in development and production', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-platform-'));
  try {
    const archive = path.join(root, 'images', 'afterTheRoll');
    const folder = '2026/replay';
    fs.mkdirSync(path.join(archive, folder), { recursive: true });
    const passwords = {};
    for (const platform of ['roll20', 'ccfolia', 'cca']) {
      const replay = { format: 'rollscene-studio-project-v1', sourceFormat: platform, messages: [], events: [], assets: {} };
      const html = `const B64="${Buffer.from(JSON.stringify(replay)).toString('base64')}";`;
      passwords[`${folder}/${platform}`] = `password-${platform}`;
      fs.writeFileSync(path.join(archive, folder, `${platform}.html`), encrypt(html, passwords[`${folder}/${platform}`]));
      fs.writeFileSync(path.join(archive, folder, `${platform}.md`), `---\ntitle: ${platform}\nsourceFormat: cinematic\nhtmlPath: ${platform}.html\nlocked: true\ntags: ["플랫폼: 시네마틱"]\n---\n`);
    }
    const masterKey = 'test-master-key';
    fs.writeFileSync(path.join(root, 'passwords.enc.json'), encrypt(JSON.stringify(passwords), masterKey));
    function load(mode, key = masterKey) {
      const mod = { exports: {} };
      vm.runInNewContext(compiled, {
        exports: mod.exports, module: mod, Buffer,
        process: { cwd: () => root, env: { NODE_ENV: mode, TRPG_MASTER_KEY: key } },
        require(name) {
          if (name === '@/lib/trpgSource') return { TRPG_ARCHIVE_ROOT: archive, TRPG_PUBLIC_ROOT: root, TRPG_ASSET_PREFIX: '/images' };
          if (name === '@/lib/data/folders') return { getAllFolderSlugs: () => [folder] };
          if (name === '@/lib/cinematicReplay') return { parseCinematicReplay };
          if (name === '@/lib/trpgUpload') return { trpgPlatformLabel };
          return require(name);
        },
      });
      return mod.exports;
    }
    for (const mode of ['development', 'production']) {
      const api = load(mode);
      const posts = api.getTrpgPosts(folder);
      assert.equal(posts.length, 3);
      for (const post of posts) {
        assert.equal(post.sourceFormat, post.slug);
        assert.deepEqual(Array.from(post.tags), [`플랫폼: ${post.slug === 'roll20' ? 'Roll20' : '코코포리아'}`, '시네마틱']);
        assert.equal(post.encrypted, true);
        if (mode === 'production') assert.equal(api.getLocalDecryptedTrpgPostHtml(folder, post.slug), null);
        else assert.ok(api.getLocalDecryptedTrpgPostHtml(folder, post.slug).includes('const B64='));
      }
    }
    const unavailable = load('production', '').getTrpgPosts(folder);
    assert.equal(unavailable.length, 3);
    assert.ok(unavailable.every(post => post.sourceFormat === 'cinematic'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
