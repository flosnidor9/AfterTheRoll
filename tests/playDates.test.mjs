import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcilePlayDates } from '../src/lib/playDates.ts';

test('calendar records correct stale saved dates and restore completion order', () => {
  const station = Object.freeze({ title: '키사라기역', startDate: '2026-10-24', endDate: '2026-11-14', status: 'completed' });
  const sky = Object.freeze({ title: '가을 하늘에 눈이 흩날리면', startDate: '2026-10-27', endDate: '2026-11-07', status: 'completed' });
  const corrected = [
    reconcilePlayDates(station, { startDate: '2026-10-24', endDate: '2026-10-25' }),
    reconcilePlayDates(sky, { startDate: '2026-10-27', endDate: '2026-11-05' }),
  ];
  corrected.sort((a, b) => (b.endDate ?? b.startDate).localeCompare(a.endDate ?? a.startDate));
  assert.deepEqual(corrected.map((entry) => entry.title), [sky.title, station.title]);
  assert.equal(station.endDate, '2026-11-14');
  assert.equal(corrected[1].status, 'completed');
});

test('a single calendar record clears a stale end date and corrects the start date', () => {
  const corrected = reconcilePlayDates(
    { title: 'One session', startDate: '2025-12-31', endDate: '2026-11-14' },
    { startDate: '2026-10-25', endDate: null },
  );
  assert.equal(corrected.startDate, '2026-10-25');
  assert.equal(corrected.endDate, null);
});

test('missing calendar records preserve manual dates; matching dates need no write', () => {
  const entry = { title: 'Manual', startDate: '2026-10-25', endDate: null };
  assert.strictEqual(reconcilePlayDates(entry, undefined), entry);
  assert.strictEqual(reconcilePlayDates(entry, { startDate: entry.startDate, endDate: null }), entry);
});
