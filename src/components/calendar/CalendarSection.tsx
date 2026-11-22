'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import CharacterPreviewModal, { LinkedCharacterButtons } from '@/components/characters/CharacterPreviewModal';
import type { Character } from '@/lib/data/characters';
import { subscribeToPlays, type PlayEntry } from '@/lib/data/firebasePlays';

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

interface ExternalEventSlot {
  allDay: boolean;
  startDateTime?: string;
  endDateTime?: string;
}

const CALENDAR_ID = '848efa2587af083c615b7c3581e818075a6489d1d0ce70c4ac3ef60880d0fbae%40group.calendar.google.com';
const EXTERNAL_CALENDAR_IDS = [
  '97lincediini0nmflm951ecbv4@group.calendar.google.com',
  'snqgnamf250qppbvim02otagjg@group.calendar.google.com',
  '43vpniivockejo1q72qi5rcro4@group.calendar.google.com',
];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'] as const;
const GRAPH_CELL_REM = 0.72;
const GRAPH_GAP_REM = 0.18;
const HOUR_REM = 3.8;
const PORTRAIT_MEDIA_QUERY = '(orientation: portrait)';

const PALETTE = [
  '#c85f7f',
  '#d8785f',
  '#c99648',
  '#a6a653',
  '#7fa66e',
  '#55a37f',
  '#4b9c98',
  '#4f92b1',
  '#5c82c1',
  '#756fc0',
  '#8f66b4',
  '#aa5a9a',
  '#bf5e74',
  '#9b7a58',
  '#6d8f73',
  '#7f7f9e',
] as const;
type EventColorMap = Map<string, string>;

function getStartDate(event: GoogleCalendarEvent) {
  return (event.start.date ?? event.start.dateTime ?? '').slice(0, 10);
}
function isAllDay(event: GoogleCalendarEvent) { return !!event.start.date; }
function getEventDateKeys(event: GoogleCalendarEvent): string[] {
  const startDate = getStartDate(event);
  if (!startDate || !isAllDay(event)) return startDate ? [startDate] : [];

  // Google Calendar's all-day `end.date` is exclusive. Expand the event so a
  // multi-day event is visible on every day it covers, not only its start day.
  const endDate = event.end.date;
  if (!endDate || endDate <= startDate) return [startDate];

  const dateKeys: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor < end) {
    dateKeys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dateKeys;
}
function toMinutes(dt: string) {
  const d = new Date(dt);
  return d.getHours() * 60 + d.getMinutes();
}
function fmt(dt: string) {
  return new Date(dt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function toDateKey(year: number, month: number, day: number): string {
  const d = new Date(year, month, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function autoColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  return PALETTE[h % PALETTE.length];
}
function buildEventColorMap(events: GoogleCalendarEvent[]): EventColorMap {
  const names = [...new Set(events.map(event => event.summary.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  return new Map(names.map((name, index) => [name, PALETTE[index % PALETTE.length]]));
}
function resolveColor(name: string, colorMap?: EventColorMap) {
  const base = colorMap?.get(name.trim()) ?? autoColor(name);
  return { base, bg: hexToRgba(base, 0.24) };
}

function getContributionColor(count: number): string {
  if (count >= 4) return 'rgba(125, 79, 157, 0.9)';
  if (count === 3) return 'rgba(157, 108, 171, 0.76)';
  if (count === 2) return 'rgba(201, 95, 130, 0.62)';
  if (count === 1) return 'rgba(224, 130, 158, 0.46)';
  return 'rgba(107, 74, 86, 0.06)';
}

function buildYearWeeks(year: number): Date[][] {
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const weeks: Date[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

// ── 셀 이벤트 병합 정렬 ────────────────────────────────────────
type CellItem =
  | { kind: 'mine'; event: GoogleCalendarEvent }
  | { kind: 'ext'; slot: ExternalEventSlot };

function mergeCellItems(events: GoogleCalendarEvent[], extSlots: ExternalEventSlot[]): CellItem[] {
  const items: CellItem[] = [
    ...events.map(event => ({ kind: 'mine' as const, event })),
    ...extSlots.map(slot => ({ kind: 'ext' as const, slot })),
  ];
  return items.sort((a, b) => {
    const aAllDay = a.kind === 'mine' ? isAllDay(a.event) : a.slot.allDay;
    const bAllDay = b.kind === 'mine' ? isAllDay(b.event) : b.slot.allDay;
    if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
    const aTime = a.kind === 'mine'
      ? (a.event.start.dateTime ?? a.event.start.date ?? '')
      : (a.slot.startDateTime ?? '');
    const bTime = b.kind === 'mine'
      ? (b.event.start.dateTime ?? b.event.start.date ?? '')
      : (b.slot.startDateTime ?? '');
    return aTime.localeCompare(bTime);
  });
}

// ── 이벤트 상세 팝업 ───────────────────────────────────────────
interface DetailState { event: GoogleCalendarEvent; x: number; y: number }
export type CalendarLogLink = { calendarEventId: string; playId: string; href: string };

const DETAIL_W = 240;
const DETAIL_MAX_H = 320;

function EventDetailPanel({
  detail, onClose, characters, logLink, onSelectCharacter,
}: {
  detail: DetailState;
  onClose: () => void;
  characters: Character[];
  logLink?: CalendarLogLink;
  onSelectCharacter: (character: Character) => void;
}) {
  const { event, x: cx, y: cy } = detail;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  const x = cx + 12 + DETAIL_W > vw ? cx - DETAIL_W - 12 : cx + 12;
  const y = Math.min(Math.max(cy - DETAIL_MAX_H / 2, 8), vh - DETAIL_MAX_H - 8);

  const allDay = isAllDay(event);
  const timeStr = !allDay && event.start.dateTime
    ? `${fmt(event.start.dateTime)}${event.end.dateTime ? ` – ${fmt(event.end.dateTime)}` : ''}`
    : '종일';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.93 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.93 }}
      transition={{ duration: 0.14 }}
      onClick={e => e.stopPropagation()}
      className="ledger-paper-sheet absolute overflow-hidden rounded-[0.9rem] p-[1rem] shadow-xl"
      style={{ left: x, top: y, width: DETAIL_W, zIndex: 1 }}
    >
      {/* 헤더 */}
      <div className="mb-[0.6rem] flex items-start justify-between gap-[0.5rem]">
        <p className="afterroll-title text-[1rem] leading-[1.3] text-[var(--ledger-ink)]">
          {event.summary}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="afterroll-meta shrink-0 text-[1rem] leading-none text-[var(--ledger-soft)] hover:text-[var(--ledger-ink)]"
        >
          ×
        </button>
      </div>

      {/* 시간 */}
      <p className="afterroll-meta text-[0.78rem] text-[var(--ledger-soft)]">{timeStr}</p>
      {logLink && <Link href={logLink.href} className="afterroll-meta mt-[0.55rem] inline-flex rounded-[0.35rem] border border-[var(--atr-line)] px-[0.5rem] py-[0.28rem] text-[0.72rem] text-[var(--ledger-muted)] transition-colors hover:border-[var(--atr-accent)] hover:text-[var(--atr-accent)]">로그 보기</Link>}

      {/* 메모 */}
      {event.description && (
        <div className="mt-[0.65rem] border-t border-[rgba(87,67,48,0.1)] pt-[0.65rem]">
          <p className="afterroll-meta mb-[0.3rem] text-[0.68rem] uppercase tracking-[0.1em] text-[var(--ledger-soft)]">메모</p>
          <p className="afterroll-body whitespace-pre-wrap text-[0.85rem] leading-[1.6] text-[var(--ledger-ink)]">
            {event.description}
          </p>
        </div>
      )}
      <div className="mt-[0.65rem] border-t border-[rgba(87,67,48,0.1)] pt-[0.65rem]">
        <LinkedCharacterButtons characters={characters} onSelect={onSelectCharacter} />
        {!characters.length && <p className="afterroll-meta text-[0.7rem] text-[var(--ledger-soft)]">연결된 캐릭터가 없습니다.</p>}
      </div>
    </motion.div>
  );
}

// ── 연간 플레이 히트맵 ─────────────────────────────────────────
function AnnualPlayGraph({
  year,
  selectedMonth,
  countsByDate,
  onSelectDate,
  onPrevYear,
  onNextYear,
}: {
  year: number;
  selectedMonth: number;
  countsByDate: Map<string, number>;
  onSelectDate: (date: Date) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
}) {
  const activeMonthRef = useRef<HTMLSpanElement>(null);
  const weeks = useMemo(() => buildYearWeeks(year), [year]);
  const monthLabels = useMemo(() => {
    const labels: { month: number; weekIndex: number }[] = [];
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const firstDayKey = toDateKey(year, monthIndex, 1);
      const weekIndex = weeks.findIndex(week => week.some(day => getDateKey(day) === firstDayKey));
      if (weekIndex >= 0) labels.push({ month: monthIndex, weekIndex });
    }
    return labels;
  }, [weeks, year]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PORTRAIT_MEDIA_QUERY);
    let frameId: number | null = null;
    const scrollToActiveMonth = () => {
      frameId = window.requestAnimationFrame(() => {
        activeMonthRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    };
    const handleOrientationChange = (event: MediaQueryListEvent) => {
      if (event.matches) scrollToActiveMonth();
    };

    if (mediaQuery.matches) scrollToActiveMonth();
    mediaQuery.addEventListener('change', handleOrientationChange);
    return () => {
      mediaQuery.removeEventListener('change', handleOrientationChange);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [year, selectedMonth]);

  return (
    <section className="ledger-paper-sheet paper-memo relative mb-[1.1rem] overflow-hidden rounded-[1.2rem] px-[1.1rem] py-[1rem] md:px-[1.6rem] md:py-[1.35rem]">
      <span className="afterroll-tape afterroll-tape-lime left-[3.2rem] rotate-[-5deg]" />

      <div className="relative z-[1] mb-[0.9rem] grid grid-cols-[2.6rem_minmax(0,1fr)_2.6rem] items-center gap-[0.6rem] md:grid-cols-[3rem_minmax(0,1fr)_3rem]">
        <motion.button
          type="button"
          onClick={onPrevYear}
          whileTap={{ scale: 0.9 }}
          aria-label="이전 연도"
          className="afterroll-note rounded-[0.5rem] border border-[var(--atr-line)] bg-transparent px-[0.7rem] py-[0.42rem] text-[1rem] text-[var(--ledger-muted)] transition-colors hover:text-[var(--ledger-ink)]"
        >
          ←
        </motion.button>

        <div className="min-w-0 text-center">
          <h2 className="afterroll-title text-[2.1rem] leading-none text-[var(--ledger-ink)] md:text-[2.7rem]">
            {year} 플레이 기록
          </h2>
        </div>

        <motion.button
          type="button"
          onClick={onNextYear}
          whileTap={{ scale: 0.9 }}
          aria-label="다음 연도"
          className="afterroll-note rounded-[0.5rem] border border-[var(--atr-line)] bg-transparent px-[0.7rem] py-[0.42rem] text-[1rem] text-[var(--ledger-muted)] transition-colors hover:text-[var(--ledger-ink)]"
        >
          →
        </motion.button>
      </div>

      <div className="relative z-[1] overflow-x-auto pb-[0.2rem]">
        <div className="mx-auto w-max min-w-max">
          <div
            className="afterroll-meta ml-[2.05rem] grid h-[1rem] text-[0.62rem] leading-none text-[var(--ledger-soft)]"
            style={{
              gridTemplateColumns: `repeat(${weeks.length}, ${GRAPH_CELL_REM}rem)`,
              columnGap: `${GRAPH_GAP_REM}rem`,
            }}
          >
            {monthLabels.map(({ month, weekIndex }) => (
              <span
                key={month}
                ref={month === selectedMonth ? activeMonthRef : null}
                style={{ gridColumn: `${weekIndex + 1} / span 4` }}
              >
                {MONTH_LABELS[month]}
              </span>
            ))}
          </div>

          <div className="flex justify-center gap-[0.45rem]">
            <div className="afterroll-meta grid grid-rows-7 gap-[0.18rem] pt-[0.02rem] text-[0.58rem] leading-[0.72rem] text-[var(--ledger-soft)]">
              {DAYS.map((day, index) => (
                <span key={day} className={index % 2 === 0 ? 'opacity-0' : ''}>{day}</span>
              ))}
            </div>

            <div
              className="grid grid-flow-col grid-rows-7 gap-[0.18rem]"
              style={{
                gridTemplateColumns: `repeat(${weeks.length}, ${GRAPH_CELL_REM}rem)`,
              }}
            >
              {weeks.flatMap(week => week.map(day => {
                const dateKey = getDateKey(day);
                const inYear = day.getFullYear() === year;
                const count = countsByDate.get(dateKey) ?? 0;
                const label = `${day.getMonth() + 1}월 ${day.getDate()}일: ${count}회`;

                return (
                  <motion.button
                    key={dateKey}
                    type="button"
                    aria-label={label}
                    title={label}
                    disabled={!inYear}
                    onClick={() => onSelectDate(day)}
                    whileHover={inYear ? { scale: 1.28 } : undefined}
                    whileTap={inYear ? { scale: 0.92 } : undefined}
                    className="rounded-[0.16rem] border border-[rgba(87,67,48,0.08)] outline-none transition-opacity focus-visible:ring-[0.12rem] focus-visible:ring-[rgba(127,79,42,0.34)] disabled:cursor-default"
                    style={{
                      width: `${GRAPH_CELL_REM}rem`,
                      height: `${GRAPH_CELL_REM}rem`,
                      background: inYear ? getContributionColor(count) : 'transparent',
                      opacity: inYear ? 1 : 0.24,
                    }}
                  />
                );
              }))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-[1] mt-[0.75rem] flex items-center justify-center gap-[0.32rem]">
        <span className="afterroll-meta text-[0.62rem] text-[var(--ledger-soft)]">적게</span>
        {[0, 1, 2, 3, 4].map(level => (
          <span
            key={level}
            className="rounded-[0.14rem] border border-[rgba(87,67,48,0.08)]"
            style={{
              width: `${GRAPH_CELL_REM}rem`,
              height: `${GRAPH_CELL_REM}rem`,
              background: getContributionColor(level),
            }}
          />
        ))}
        <span className="afterroll-meta text-[0.62rem] text-[var(--ledger-soft)]">많이</span>
      </div>
    </section>
  );
}

// ── 일별 타임라인 ──────────────────────────────────────────────
function DailyTimeline({
  events, day, month, year, onOpenDetail, externalSlots, eventColorMap,
}: {
  events: GoogleCalendarEvent[];
  day: number; month: number; year: number;
  onOpenDetail: (event: GoogleCalendarEvent, x: number, y: number) => void;
  externalSlots: ExternalEventSlot[];
  eventColorMap: EventColorMap;
}) {
  const allDay = events.filter(isAllDay);
  const timed = events.filter(e => !isAllDay(e));
  const extAllDay = externalSlots.filter(s => s.allDay);
  const extTimed = externalSlots.filter(s => !s.allDay && s.startDateTime);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const totalRem = 24 * HOUR_REM;
  const d = new Date(year, month, day);
  const dayLabel = `${month + 1}월 ${day}일 (${DAY_NAMES[d.getDay()]})`;
  const hasAnything = events.length > 0 || externalSlots.length > 0;
  const hasTimeline = timed.length > 0 || extTimed.length > 0;

  return (
    <motion.section
      key={`${year}-${month}-${day}`}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="ledger-paper-sheet paper-memo afterroll-shadow-soft relative mt-[1.1rem] overflow-hidden rounded-[1rem] px-[1.2rem] py-[1.2rem] md:px-[1.8rem] md:py-[1.6rem]"
    >
      <span className="afterroll-tape afterroll-tape-pink right-[3.4rem] rotate-[7deg]" />

      <div className="relative z-[1] mb-[1.1rem] flex items-baseline justify-between gap-[1rem]">
        <p className="afterroll-title text-[1.7rem] leading-none text-[var(--ledger-ink)] md:text-[2.2rem]">{dayLabel}</p>
        <span className="ledger-stamp afterroll-meta shrink-0 rounded-[0.25rem] px-[0.65rem] py-[0.3rem] text-[0.78rem] uppercase tracking-[0.08em]">
          Schedule
        </span>
      </div>

      {!hasAnything ? (
        <div className="relative z-[1] py-[2.5rem] text-center">
          <p className="afterroll-title text-[1.8rem] text-[rgba(87,67,48,0.18)]">—</p>
          <p className="afterroll-meta mt-[0.35rem] text-[0.85rem] text-[var(--ledger-soft)]">이 날은 일정이 없습니다</p>
        </div>
      ) : (
        <div className="relative z-[1]">
          {/* 종일 이벤트 */}
          {(allDay.length > 0 || extAllDay.length > 0) && (
            <div className="mb-[1rem] border-b border-[rgba(87,67,48,0.1)] pb-[0.8rem]">
              <p className="afterroll-meta mb-[0.4rem] text-[0.72rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">종일</p>
              <div className="flex flex-col gap-[0.3rem]">
                {allDay.map(event => {
                  const color = resolveColor(event.summary, eventColorMap);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={e => { e.stopPropagation(); onOpenDetail(event, e.clientX, e.clientY); }}
                      className="w-full rounded-[0.4rem] px-[0.75rem] py-[0.38rem] text-left transition-opacity hover:opacity-80"
                      style={{ background: color.bg, borderLeft: `0.18rem solid ${color.base}` }}
                    >
                      <p className="afterroll-meta text-[0.95rem] text-[var(--ledger-ink)]">{event.summary}</p>
                      {event.description ? (
                        <p className="afterroll-body mt-[0.15rem] line-clamp-1 text-[0.8rem] text-[var(--ledger-muted)]">{event.description}</p>
                      ) : null}
                    </button>
                  );
                })}
                {extAllDay.map((_, i) => (
                  <div
                    key={`ext-allday-${i}`}
                    className="w-full rounded-[0.4rem] px-[0.75rem] py-[0.38rem]"
                    style={{ background: 'rgba(87,67,48,0.05)', borderLeft: '0.18rem dashed rgba(87,67,48,0.25)' }}
                  >
                    <p className="afterroll-meta text-[0.95rem] text-[var(--ledger-soft)]">일정있음</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 시간 타임라인 */}
          {hasTimeline && (
            <div className="relative flex gap-[0.75rem]" style={{ height: `${totalRem}rem` }}>
              <div className="relative w-[2.8rem] shrink-0">
                {hours.map((h, i) => (
                  <span
                    key={h}
                    className="afterroll-meta absolute right-0 text-[0.68rem] leading-none text-[var(--ledger-soft)]"
                    style={{ top: `${i * HOUR_REM + 0.05}rem` }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>

              <div className="relative flex-1">
                {hours.map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-[rgba(87,67,48,0.1)]"
                    style={{ top: `${i * HOUR_REM}rem` }}
                  />
                ))}

                {timed.map(event => {
                  const color = resolveColor(event.summary, eventColorMap);
                  const startMin = toMinutes(event.start.dateTime!);
                  const rawEnd = event.end.dateTime ? toMinutes(event.end.dateTime) : startMin + 60;
                  const endMin = rawEnd <= startMin ? 24 * 60 : rawEnd;
                  const topRem = (startMin / 60) * HOUR_REM;
                  const heightRem = Math.max(((endMin - startMin) / 60) * HOUR_REM, HOUR_REM * 0.38);
                  const isShort = heightRem < HOUR_REM * 0.7;

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={e => { e.stopPropagation(); onOpenDetail(event, e.clientX, e.clientY); }}
                      className="absolute left-[0.2rem] right-[0.2rem] overflow-hidden rounded-[0.45rem] px-[0.65rem] py-[0.3rem] text-left transition-opacity hover:opacity-80"
                      style={{ top: `${topRem}rem`, height: `${heightRem}rem`, background: color.bg, borderLeft: `0.22rem solid ${color.base}` }}
                    >
                      <p className="afterroll-title truncate text-[0.95rem] leading-[1.2] text-[var(--ledger-ink)]">
                        {event.summary}
                      </p>
                      {!isShort && (
                        <p className="afterroll-meta mt-[0.08rem] text-[0.7rem] text-[var(--ledger-soft)]">
                          {fmt(event.start.dateTime!)}
                          {event.end.dateTime ? ` – ${fmt(event.end.dateTime)}` : ''}
                        </p>
                      )}
                    </button>
                  );
                })}

                {extTimed.map((slot, i) => {
                  const startMin = toMinutes(slot.startDateTime!);
                  const rawEnd = slot.endDateTime ? toMinutes(slot.endDateTime) : startMin + 60;
                  const endMin = rawEnd <= startMin ? 24 * 60 : rawEnd;
                  const topRem = (startMin / 60) * HOUR_REM;
                  const heightRem = Math.max(((endMin - startMin) / 60) * HOUR_REM, HOUR_REM * 0.38);
                  const isShort = heightRem < HOUR_REM * 0.7;

                  return (
                    <div
                      key={`ext-${i}`}
                      className="absolute left-[0.2rem] right-[0.2rem] overflow-hidden rounded-[0.45rem] px-[0.65rem] py-[0.3rem]"
                      style={{ top: `${topRem}rem`, height: `${heightRem}rem`, background: 'rgba(87,67,48,0.05)', borderLeft: '0.22rem dashed rgba(87,67,48,0.25)' }}
                    >
                      <p className="afterroll-title truncate text-[0.88rem] leading-[1.2] text-[var(--ledger-soft)]">
                        일정있음
                      </p>
                      {!isShort && (
                        <p className="afterroll-meta mt-[0.08rem] text-[0.7rem] text-[rgba(87,67,48,0.4)]">
                          {fmt(slot.startDateTime!)}
                          {slot.endDateTime ? ` – ${fmt(slot.endDateTime)}` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function CalendarSection({ logLinks = [], characters = [] }: { logLinks?: CalendarLogLink[]; characters?: Character[] }) {
  const [baseDate, setBaseDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [annualEvents, setAnnualEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setAnnualLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setAnnualError] = useState<string | null>(null);
  const [externalDates, setExternalDates] = useState<Map<string, ExternalEventSlot[]>>(new Map());
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [plays, setPlays] = useState<PlayEntry[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  useEffect(() => subscribeToPlays(setPlays), []);

  function openDetail(event: GoogleCalendarEvent, x: number, y: number) {
    setDetail({ event, x, y });
  }

  function closePopups() {
    setDetail(null);
    setSelectedCharacter(null);
  }

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const fetchEvents = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_API_KEY;
    if (!apiKey) { setError('API 키 없음'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const fDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const nextOvf = Math.ceil((fDow + dim) / 7) * 7 - fDow - dim;
    const timeMin = (fDow > 0
      ? new Date(year, month - 1, new Date(year, month, 0).getDate() - fDow + 1)
      : new Date(year, month, 1)
    ).toISOString();
    const timeMax = (nextOvf > 0
      ? new Date(year, month + 1, nextOvf, 23, 59, 59)
      : new Date(year, month + 1, 0, 23, 59, 59)
    ).toISOString();
    const cacheBust = Date.now();
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?key=${apiKey}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=200&cacheBust=${cacheBust}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { items?: GoogleCalendarEvent[] };
      setEvents(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  const fetchAnnualEvents = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_API_KEY;
    if (!apiKey) { setAnnualError('API 키 없음'); setAnnualLoading(false); return; }
    setAnnualLoading(true);
    setAnnualError(null);

    const timeMin = new Date(year, 0, 1).toISOString();
    const timeMax = new Date(year + 1, 0, 1).toISOString();
    const cacheBust = Date.now();
    const allEvents: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?key=${apiKey}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=2500&cacheBust=${cacheBust}${tokenParam}`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
        allEvents.push(...(data.items ?? []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      setAnnualEvents(allEvents);
    } catch (e) {
      setAnnualError(e instanceof Error ? e.message : '오류 발생');
    } finally {
      setAnnualLoading(false);
    }
  }, [year]);

  useEffect(() => { void fetchAnnualEvents(); }, [fetchAnnualEvents]);

  const fetchExternalEvents = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_API_KEY;
    if (!apiKey) return;
    const fDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const nextOvf = Math.ceil((fDow + dim) / 7) * 7 - fDow - dim;
    const timeMin = (fDow > 0
      ? new Date(year, month - 1, new Date(year, month, 0).getDate() - fDow + 1)
      : new Date(year, month, 1)
    ).toISOString();
    const timeMax = (nextOvf > 0
      ? new Date(year, month + 1, nextOvf, 23, 59, 59)
      : new Date(year, month + 1, 0, 23, 59, 59)
    ).toISOString();
    const cacheBust = Date.now();
    const dateMap = new Map<string, ExternalEventSlot[]>();
    await Promise.all(EXTERNAL_CALENDAR_IDS.map(async (calId) => {
      try {
        const encodedId = encodeURIComponent(calId);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events?key=${apiKey}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&maxResults=200&cacheBust=${cacheBust}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const data = await res.json() as { items?: GoogleCalendarEvent[] };
        for (const event of data.items ?? []) {
          const dateKeys = getEventDateKeys(event);
          if (dateKeys.length === 0) continue;
          const slot: ExternalEventSlot = {
            allDay: !!event.start.date,
            startDateTime: event.start.dateTime,
            endDateTime: event.end.dateTime,
          };
          for (const dateKey of dateKeys) {
            const existing = dateMap.get(dateKey) ?? [];
            existing.push(slot);
            dateMap.set(dateKey, existing);
          }
        }
      } catch {}
    }));
    setExternalDates(new Map(dateMap));
  }, [year, month]);

  useEffect(() => { void fetchExternalEvents(); }, [fetchExternalEvents]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  type CellData = { day: number; overflow?: 'prev' | 'next' };
  const cells: CellData[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, overflow: 'prev' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay++, overflow: 'next' });
  }

  const eventsByDate = new Map<string, GoogleCalendarEvent[]>();
  for (const event of events) {
    for (const dateKey of getEventDateKeys(event)) {
      const bucket = eventsByDate.get(dateKey) ?? [];
      bucket.push(event);
      eventsByDate.set(dateKey, bucket);
    }
  }

  const annualCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of annualEvents) {
      for (const dateKey of getEventDateKeys(event)) {
        counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
      }
    }
    return counts;
  }, [annualEvents]);
  const eventColorMap = useMemo(
    () => buildEventColorMap([...annualEvents, ...events]),
    [annualEvents, events],
  );
  const charactersByTitle = useMemo(() => {
    const charactersForTitle = new Map<string, Character[]>();
    const charactersBySession = new Map<string, Character[]>();
    characters.forEach((character) => character.sessionKeys.forEach((sessionKey) => {
      const linked = charactersBySession.get(sessionKey) ?? [];
      linked.push(character);
      charactersBySession.set(sessionKey, linked);
    }));
    plays.forEach((play) => {
      const linked = charactersBySession.get(play.id) ?? [];
      if (linked.length) charactersForTitle.set(play.title.trim(), linked);
    });
    return charactersForTitle;
  }, [characters, plays]);
  const charactersBySession = useMemo(() => {
    const result = new Map<string, Character[]>();
    characters.forEach((character) => character.sessionKeys.forEach((sessionKey) => {
      const linked = result.get(sessionKey) ?? [];
      linked.push(character);
      result.set(sessionKey, linked);
    }));
    return result;
  }, [characters]);
  const logByCalendarEventId = useMemo(
    () => new Map(logLinks.filter((log) => log.calendarEventId).map((log) => [log.calendarEventId, log])),
    [logLinks],
  );

  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDay = isThisMonth ? today.getDate() : null;

  function goToMonth(y: number, m: number, d: number | null = null) {
    setSelectedDay(d);
    setBaseDate(new Date(y, m, 1));
  }
  function selectGraphDate(date: Date) {
    goToMonth(date.getFullYear(), date.getMonth(), date.getDate());
  }
  function prevYear() { goToMonth(year - 1, month); }
  function nextYear() { goToMonth(year + 1, month); }
  function prevMonth() { goToMonth(year, month - 1); }
  function nextMonth() { goToMonth(year, month + 1); }

  return (
    <main className="afterroll-desk min-h-screen px-[1.1rem] pb-[4rem] pt-[5rem] text-[var(--ledger-ink)] md:px-[2rem]">
      <div className="mx-auto max-w-[72rem]">
        <header className="mb-[1.5rem] border-b border-[var(--atr-line)] pb-[0.85rem]">
          <p className="afterroll-meta text-[0.74rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">Play Calendar</p>
          <h1 className="afterroll-title mt-[0.18rem] text-[2.4rem] leading-none text-[var(--ledger-ink)]">캘린더</h1>
        </header>
        <AnnualPlayGraph
          year={year}
          selectedMonth={month}
          countsByDate={annualCountsByDate}
          onSelectDate={selectGraphDate}
          onPrevYear={prevYear}
          onNextYear={nextYear}
        />

        {/* 달력 */}
        <section className="ledger-paper-sheet paper-grid relative overflow-hidden rounded-[1.2rem]">
          <span className="afterroll-tape afterroll-tape-yellow right-[4rem] rotate-[6deg]" />

          {/* 월 네비게이션 */}
          <div className="relative z-[1] flex items-center justify-between px-[1.2rem] py-[1rem] md:px-[1.8rem] md:py-[1.3rem]">
            <motion.button type="button" onClick={prevMonth} whileTap={{ scale: 0.9 }}
              className="afterroll-note rounded-[0.5rem] border border-[var(--atr-line)] bg-transparent px-[0.9rem] py-[0.42rem] text-[1rem] text-[var(--ledger-muted)] transition-colors hover:text-[var(--ledger-ink)]">
              ←
            </motion.button>
            <div className="text-center">
              <p className="afterroll-title text-[2.6rem] leading-none text-[var(--ledger-ink)] md:text-[3.2rem]">{month + 1}월</p>
              <p className="afterroll-meta mt-[0.15rem] text-[0.78rem] uppercase tracking-[0.16em] text-[var(--ledger-soft)]">{year}</p>
            </div>
            <motion.button type="button" onClick={nextMonth} whileTap={{ scale: 0.9 }}
              className="afterroll-note rounded-[0.5rem] border border-[var(--atr-line)] bg-transparent px-[0.9rem] py-[0.42rem] text-[1rem] text-[var(--ledger-muted)] transition-colors hover:text-[var(--ledger-ink)]">
              →
            </motion.button>
          </div>

          {/* 요일 헤더 */}
          <div className="relative z-[1] grid grid-cols-7 border-y border-[rgba(87,67,48,0.1)]">
            {DAYS.map((day, i) => (
              <div key={day}
                className={`afterroll-meta py-[0.5rem] text-center text-[0.75rem] uppercase tracking-[0.08em] ${
                  i === 0 ? 'text-[rgba(192,57,43,0.6)]' : i === 6 ? 'text-[var(--ledger-accent-soft)]' : 'text-[var(--ledger-soft)]'
                }`}>
                {day}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          {loading ? (
            <div className="relative z-[1] grid grid-cols-7">
              {Array.from({ length: 35 }, (_, i) => (
                <div key={i} className="min-h-[5rem] animate-pulse border-b border-r border-[rgba(87,67,48,0.07)] bg-white/40 p-[0.4rem] md:min-h-[7.5rem]">
                  <div className="h-[1.1rem] w-[1.4rem] rounded bg-[rgba(87,67,48,0.07)]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="relative z-[1] py-[3rem] text-center">
              <p className="afterroll-meta text-[0.88rem] text-[var(--ledger-soft)]">⚠ {error}</p>
            </div>
          ) : (
            <div className="relative z-[1] grid grid-cols-7">
              {cells.map((cell, index) => {
                const { day, overflow } = cell;
                const isSun = index % 7 === 0;
                const isSat = index % 7 === 6;

                if (overflow) {
                  const ovfDateKey = toDateKey(year, overflow === 'prev' ? month - 1 : month + 1, day);
                  const ovfItems = mergeCellItems(
                    eventsByDate.get(ovfDateKey) ?? [],
                    externalDates.get(ovfDateKey) ?? [],
                  );
                  return (
                    <div
                      key={`${overflow}-${day}`}
                      onClick={() => overflow === 'prev' ? goToMonth(year, month - 1, day) : goToMonth(year, month + 1, day)}
                      className="relative min-h-[5rem] cursor-pointer border-b border-r border-[rgba(87,67,48,0.07)] bg-[rgba(245,240,230,0.35)] p-[0.35rem] transition-colors duration-150 hover:bg-[rgba(245,240,230,0.55)] md:min-h-[7.5rem] md:p-[0.55rem]"
                    >
                      <span className={`afterroll-meta inline-flex h-[1.45rem] w-[1.45rem] items-center justify-center rounded-full text-[0.78rem] md:text-[0.85rem] ${
                        isSun ? 'text-[rgba(192,57,43,0.22)]'
                        : isSat ? 'text-[rgba(127,79,42,0.22)]'
                        : 'text-[rgba(87,67,48,0.22)]'
                      }`}>
                        {day}
                      </span>

                      {/* 이벤트 칩 (흐릿하게) */}
                      <div className="mt-[0.25rem] flex flex-col gap-[0.18rem] opacity-40">
                        {ovfItems.slice(0, 3).map((item, i) => {
                          if (item.kind === 'mine') {
                            const color = resolveColor(item.event.summary, eventColorMap);
                            const timeStr = !isAllDay(item.event) && item.event.start.dateTime ? fmt(item.event.start.dateTime) : '';
                            return (
                              <div key={item.event.id} className="flex min-w-0 items-center gap-[0.22rem] overflow-hidden rounded-[0.25rem] px-[0.3rem] py-[0.1rem]"
                                style={{ background: color.bg, borderLeft: `0.18rem solid ${color.base}` }}>
                                {timeStr && <span className="calendar-event-time afterroll-meta shrink-0 text-[0.58rem] leading-none" style={{ color: color.base }}>{timeStr}</span>}
                                <span className="afterroll-meta truncate text-[0.65rem] leading-[1.3] text-[var(--ledger-ink)]">{item.event.summary}</span>
                              </div>
                            );
                          }
                          const timeStr = !item.slot.allDay && item.slot.startDateTime ? fmt(item.slot.startDateTime) : '';
                          return (
                            <div key={`ext-${i}`} className="flex min-w-0 items-center gap-[0.22rem] overflow-hidden rounded-[0.25rem] px-[0.3rem] py-[0.1rem]"
                              style={{ background: 'rgba(87,67,48,0.04)', borderLeft: '0.18rem dashed rgba(87,67,48,0.2)' }}>
                              {timeStr && <span className="calendar-event-time afterroll-meta shrink-0 text-[0.58rem] leading-none text-[rgba(87,67,48,0.4)]">{timeStr}</span>}
                              <span className="afterroll-meta truncate text-[0.65rem] leading-[1.3] text-[var(--ledger-soft)]">일정있음</span>
                            </div>
                          );
                        })}
                        {ovfItems.length > 3 && (
                          <span className="afterroll-meta text-[0.6rem] text-[var(--ledger-soft)]">+{ovfItems.length - 3}개</span>
                        )}
                      </div>

                    </div>
                  );
                }

                const dateKey = toDateKey(year, month, day);
                const dayItems = mergeCellItems(
                  eventsByDate.get(dateKey) ?? [],
                  externalDates.get(dateKey) ?? [],
                );
                const isToday = todayDay === day;
                const isSelected = selectedDay === day;

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`relative min-h-[5rem] cursor-pointer border-b border-r border-[rgba(87,67,48,0.07)] p-[0.35rem] transition-colors duration-150 md:min-h-[7.5rem] md:p-[0.55rem] ${
                      isSelected ? 'bg-[rgba(127,79,42,0.07)]' : 'bg-white/80 hover:bg-[rgba(127,79,42,0.03)]'
                    }`}
                  >
                    {/* 날짜 숫자 */}
                    <span className={`afterroll-meta inline-flex h-[1.45rem] w-[1.45rem] items-center justify-center rounded-full text-[0.78rem] md:text-[0.85rem] ${
                      isSelected ? 'bg-[var(--ledger-accent)] text-[#f5ead4]'
                      : isToday ? 'bg-[rgba(127,79,42,0.18)] font-bold text-[var(--ledger-accent)]'
                      : isSun ? 'text-[rgba(192,57,43,0.65)]'
                      : isSat ? 'text-[var(--ledger-accent-soft)]'
                      : 'text-[var(--ledger-ink)]'
                    }`}>
                      {day}
                    </span>

                    {/* 이벤트 칩 */}
                    <div className="mt-[0.25rem] flex flex-col gap-[0.18rem]">
                      {dayItems.slice(0, 3).map((item, i) => {
                        if (item.kind === 'mine') {
                          const color = resolveColor(item.event.summary, eventColorMap);
                          const timeStr = !isAllDay(item.event) && item.event.start.dateTime ? fmt(item.event.start.dateTime) : '';
                          return (
                            <button key={item.event.id} type="button"
                              onClick={e => { e.stopPropagation(); openDetail(item.event, e.clientX, e.clientY); }}
                              className="flex min-w-0 cursor-pointer items-center gap-[0.22rem] overflow-hidden rounded-[0.25rem] px-[0.3rem] py-[0.1rem] text-left transition-opacity hover:opacity-75"
                              style={{ background: color.bg, borderLeft: `0.18rem solid ${color.base}` }}>
                              {timeStr && <span className="calendar-event-time afterroll-meta shrink-0 text-[0.58rem] leading-none" style={{ color: color.base }}>{timeStr}</span>}
                              <span className="afterroll-meta truncate text-[0.65rem] leading-[1.3] text-[var(--ledger-ink)]">{item.event.summary}</span>
                            </button>
                          );
                        }
                        const timeStr = !item.slot.allDay && item.slot.startDateTime ? fmt(item.slot.startDateTime) : '';
                        return (
                          <div key={`ext-${i}`} className="flex min-w-0 items-center gap-[0.22rem] overflow-hidden rounded-[0.25rem] px-[0.3rem] py-[0.1rem]"
                            style={{ background: 'rgba(87,67,48,0.05)', borderLeft: '0.18rem dashed rgba(87,67,48,0.22)' }}>
                            {timeStr && <span className="calendar-event-time afterroll-meta shrink-0 text-[0.58rem] leading-none text-[rgba(87,67,48,0.4)]">{timeStr}</span>}
                            <span className="afterroll-meta truncate text-[0.65rem] leading-[1.3] text-[var(--ledger-soft)]">일정있음</span>
                          </div>
                        );
                      })}
                      {dayItems.length > 3 && (
                        <span className="afterroll-meta text-[0.6rem] text-[var(--ledger-soft)]">+{dayItems.length - 3}개</span>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 일별 스케줄 */}
        <AnimatePresence>
          {selectedDay !== null && (
            <DailyTimeline
              events={eventsByDate.get(toDateKey(year, month, selectedDay)) ?? []}
              day={selectedDay}
              month={month}
              year={year}
              onOpenDetail={openDetail}
              externalSlots={externalDates.get(toDateKey(year, month, selectedDay)) ?? []}
              eventColorMap={eventColorMap}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 이벤트 상세 팝업 */}
      <Portal>
        <AnimatePresence>
          {detail && (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'default' }}
              onClick={closePopups}
            >
              <EventDetailPanel
                detail={detail}
                onClose={() => setDetail(null)}
                logLink={logByCalendarEventId.get(detail.event.id)}
                characters={(logByCalendarEventId.get(detail.event.id) && charactersBySession.get(logByCalendarEventId.get(detail.event.id)!.playId)) ?? charactersByTitle.get(detail.event.summary.trim()) ?? []}
                onSelectCharacter={setSelectedCharacter}
              />
            </div>
          )}
          {selectedCharacter && (
            <CharacterPreviewModal
              character={selectedCharacter}
              onClose={() => setSelectedCharacter(null)}
              onBackdropClose={closePopups}
            />
          )}
        </AnimatePresence>
      </Portal>
    </main>
  );
}
