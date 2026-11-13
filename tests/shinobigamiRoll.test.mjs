import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShinobigamiRoll, shinobigamiRollHtml } from '../src/lib/cocofoliaRoll.ts';

const example = 'SG#4>=(1*(9)+(1-1)*(0*(9)+(1-0)*(1*(11)+(1-1)*(1*(11)+(1-1)*(12))))) | 【괴뢰술】 (SG@12#4>=9) ＞ 7[2,5] ＞ 7 ＞ 실패';

test('uses the resolved target and hides the long source formula', () => {
  const roll = parseShinobigamiRoll(example);
  assert.deepEqual(roll, {
    name: '【괴뢰술】', command: 'SG@12#4>=9', target: '9',
    dice: '7[2,5]', total: '7', outcome: '실패', tone: 'failure',
  });
  const html = shinobigamiRollHtml(roll);
  assert.equal(html.replace(/<[^>]*>/g, ''), '【괴뢰술】 목표치 9 · 7[2,5] → 7 · 실패');
  assert.ok(!html.includes('<table'));
  assert.ok(!html.includes('SG@'));
  assert.ok(!html.includes('1*(9)'));
  assert.ok(!html.includes('<details'));
});

test('preserves rerolls, modifiers, and authoritative special/fumble outcomes', () => {
  const special = parseShinobigamiRoll('SG+1>=9 회피 (SG@10#3+1>=9) ＞ 10[5,5]+1 ＞ 11 ＞ 스페셜');
  assert.equal(special.name, '회피');
  assert.equal(special.total, '11');
  assert.equal(special.tone, 'success');
  const fumble = parseShinobigamiRoll('SG#4>=5 | 판정 (SG@12#4>=5) ＞ 3[1,2] ＞ ファンブル');
  assert.equal(fumble.tone, 'failure');
  assert.equal(fumble.total, '—');
  assert.ok(!shinobigamiRollHtml(fumble).includes('→ —'));
  const reroll = parseShinobigamiRoll('SG>=5 | 판정 (SG>=5) > 4[2,2] > 8[3,5] > 8 > 성공');
  assert.equal(reroll.dice, '4[2,2] → 8[3,5]');
});

test('keeps unrelated, incomplete, and ambiguous messages unchanged', () => {
  for (const text of [
    '괴뢰술 판정에 실패했다', '2D6>=9 ＞ 7[2,5] ＞ 7 ＞ 실패',
    'SG>=9 ＞ 7[2,5] ＞ 7 ＞ 실패', example + '\n이어서 하는 대사',
    example.replace('7[2,5]', '알 수 없는 결과'),
  ]) assert.equal(parseShinobigamiRoll(text), null, text);
});

test('escapes names before generating reader HTML', () => {
  const roll = parseShinobigamiRoll(example.replace('【괴뢰술】', '<script>alert(1)</script>'));
  const html = shinobigamiRollHtml(roll);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
