import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCocofoliaRoll, diceRollHtml } from '../src/lib/logDiceFormatting.ts';

const insane = '2D6>=5 [ 풍경 ] (2D6>=5) ＞ 6[1,5] ＞ 6 ＞ 성공';
const coc = 'CC<=65 관찰력 (1D100<=65) 보너스, 페널티 주사위[0] ＞ 53 ＞ 53 ＞ 보통 성공';
const visible = text => diceRollHtml(parseCocofoliaRoll(text)).replace(/<[^>]*>/g, '');

test('summarizes the reported long Shinobigami formula', () => {
  const text = 'SG#2>=(1*(1*(5)+(1-1)*(8))+(1-1)*(1*(5)+(1-1)*(1*(9)+(1-1)*(1*(10)+(1-1)*(12))))) | 【괴뢰술】 (SG@12#2>=5) ＞ 6[1,5] ＞ 6 ＞ 성공';
  assert.equal(visible(text), '【괴뢰술】 목표치 5 · 6[1,5] → 6 · 성공');
});

test('summarizes inSANe without command text or bold markup', () => {
  assert.equal(visible(insane), '[ 풍경 ] 목표치 5 · 6[1,5] → 6 · 성공');
  assert.equal(parseCocofoliaRoll(insane).label, 'inSANe 판정');
  assert.ok(!diceRollHtml(parseCocofoliaRoll(insane)).includes('<strong'));
});

test('summarizes CoC and removes redundant totals and zero bonus dice', () => {
  assert.equal(visible(coc), '관찰력 목표치 65 · 53 · 보통 성공');
  assert.equal(parseCocofoliaRoll(coc).label, 'CoC 판정');
});

test('preserves nonzero bonus/penalty counts and candidate rolls', () => {
  assert.equal(visible(coc.replace('주사위[0]', '주사위[1]').replace('＞ 53 ＞', '＞ 53, 23 ＞')),
    '관찰력 목표치 65 · 보너스 주사위 1 · 53, 23 → 53 · 보통 성공');
  assert.equal(parseCocofoliaRoll(coc.replace('주사위[0]', '주사위[-2]')).note, '페널티 주사위 2');
});

test('keeps the logged outcome authoritative for all success and failure levels', () => {
  for (const outcome of ['보통 성공', '어려운 성공', '극단적 성공', '대성공']) {
    assert.equal(parseCocofoliaRoll(coc.replace('보통 성공', outcome)).tone, 'success');
  }
  for (const outcome of ['실패', '대실패', '치명적 실패']) {
    assert.equal(parseCocofoliaRoll(coc.replace('보통 성공', outcome)).tone, 'failure');
  }
  assert.equal(parseCocofoliaRoll(insane.replace('성공', '펌블')).tone, 'failure');
});

test('preserves modifiers, special results, and rolls without a separate total', () => {
  assert.equal(visible('2D6+1>=5 [ 풍경 ] (2D6+1>=5) ＞ 6[1,5]+1 ＞ 7 ＞ 성공'),
    '[ 풍경 ] 목표치 5 · 6[1,5]+1 → 7 · 성공');
  assert.equal(visible('2D6>=5 [ 풍경 ] (2D6>=5) ＞ 12[6,6] ＞ 스페셜'),
    '[ 풍경 ] 목표치 5 · 12[6,6] · 스페셜');
});

test('leaves ordinary dialogue, incomplete rolls, and unknown suffixes alone', () => {
  for (const text of [
    '풍경 판정을 해보자', '2D6>=5 ＞ 6[1,5] ＞ 6 ＞ 성공',
    coc + '\n다음 대사', coc.replace('보통 성공', '알 수 없는 결과'),
    coc.replace('주사위[0]', '주사위[?]'), insane.replace('6[1,5]', 'unknown'),
  ]) assert.equal(parseCocofoliaRoll(text), null, text);
});

test('escapes skill names and keeps Shinobigami support through the shared parser', () => {
  assert.ok(diceRollHtml(parseCocofoliaRoll(coc.replace('관찰력', '<script>x</script>'))).includes('&lt;script&gt;'));
  assert.equal(visible('SG#4>=9 | 【괴뢰술】 (SG@12#4>=9) ＞ 7[2,5] ＞ 7 ＞ 실패'),
    '【괴뢰술】 목표치 9 · 7[2,5] → 7 · 실패');
});
