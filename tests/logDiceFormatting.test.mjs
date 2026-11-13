import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

// Exercise the real DOMParser used by every log adapter, without a DOM mock.
const browser = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(candidate => candidate && fs.existsSync(candidate));

test('all log formats summarize text rolls while retaining rich media and tables', { skip: !browser }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'after-roll-dice-'));
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/cocofoliaRoll.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText.replace(/^export /gm, '');
  const roll = 'SG#2>=(1*(1*(5)+(1-1)*(8))+(1-1)*(1*(5)+(1-1)*(1*(9)+(1-1)*(1*(10)+(1-1)*(12))))) | 【괴뢰술】 (SG@12#2>=5) ＞ 6[1,5] ＞ 6 ＞ 성공';
  const escaped = roll.replace(/>/g, '&gt;');
  const cases = [
    ['cinematic plain body', escaped, true],
    ['rich text body', `<span>${escaped.replace('【괴뢰술】', '<b>【괴뢰술】</b>')}</span>`, true],
    ['CCA dialogue lines', `<div><div class="ln">${escaped}</div><div class="ln">다음 대사</div></div>`, true],
    ['Roll20 paragraph', `<p>${escaped}</p>`, true],
    ['dice table', `<table><tr><td>${escaped}</td></tr></table>`, false],
    ['mixed image', `<div><img src="image.png">${escaped}</div>`, false],
    ['ordinary dialogue', '<b>평범한 대사</b>', false],
    ['unrecognized roll', '<span>SG 알 수 없는 결과</span>', false],
  ];
  const script = `${source}
    for (const [name, input, change] of ${JSON.stringify(cases)}) {
      const output = formatLogDiceHtml(input);
      if (change ? (!output.includes('목표치 5') || output.includes('SG#2') || output.includes('SG@12')) : output !== input) {
        throw Error(name + ': ' + output);
      }
    }
    document.body.textContent = 'PASS: all log dice formatting checks';`;
  const file = path.join(dir, 'check.html');
  fs.writeFileSync(file, `<!doctype html><body><script>${script}</script>`);
  const result = spawnSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(dir, 'profile')}`, '--dump-dom',
    pathToFileURL(file).href,
  ], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<body>PASS: all log dice formatting checks<\/body>/);
});
