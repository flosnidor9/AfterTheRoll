'use client';

import { useState } from 'react';
import type { PlayEntry, PlayType } from '@/lib/data/firebasePlays';

type TitleDates = { startDate: string; endDate: string | null };
type PlaySessionSummary = {
  date: string;
  startTime: string | null;
  isUpcoming: boolean;
};

const STATUS_LABEL = { scheduled: '예정', ongoing: '진행', completed: '완주', dropped: '하차' } as const;
const PLAY_ROLES = ['GM', 'PL'] as const satisfies readonly PlayType[];

type CountEntry = [string, number, string[]];
type ChartTooltip = { x: number; y: number; label: string; titles: string[] } | null;

const CHART_WIDTH = 720;
const CHART_HEIGHT = 240;
const CHART_PAD_X = 28;
const CHART_PAD_TOP = 24;
const CHART_PAD_BOTTOM = 46;
const CHART_INNER_WIDTH = CHART_WIDTH - CHART_PAD_X * 2;
const CHART_INNER_HEIGHT = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
const TIE_MAN_RANK = 0;
const MULTI_PLAYER_RANK = Number.MAX_SAFE_INTEGER;

function getYearMonthEntries(
  year: string,
  counts: Record<string, number>,
  titlesByMonth: Record<string, string[]>
) {
  return Array.from({ length: 12 }, (_, index): CountEntry => {
    const month = String(index + 1).padStart(2, '0');
    const key = `${year}-${month}`;
    return [key, counts[key] ?? 0, titlesByMonth[key] ?? []];
  });
}

function shouldShowChartLabel(index: number, entries: CountEntry[]) {
  if (entries.length <= 8) return true;
  return index === 0 || index === entries.length - 1 || entries[index][0].endsWith('-01');
}

function getPlayerCountRank(playerCount: string) {
  const normalized = playerCount.trim();
  if (normalized === '타이만') return TIE_MAN_RANK;
  if (normalized === '다인') return MULTI_PLAYER_RANK;

  const numericCount = Number.parseInt(normalized, 10);
  return Number.isFinite(numericCount) && numericCount > 0
    ? numericCount
    : MULTI_PLAYER_RANK - 1;
}

function comparePlayerCounts(a: string, b: string) {
  const rankDiff = getPlayerCountRank(a) - getPlayerCountRank(b);
  if (rankDiff !== 0) return rankDiff;
  return a.localeCompare(b, 'ko');
}

function TrendChart({
  entries,
  formatLabel,
  hideZeroMarkers = false,
  showAllLabels = false,
}: {
  entries: CountEntry[];
  formatLabel: (label: string) => string;
  hideZeroMarkers?: boolean;
  showAllLabels?: boolean;
}) {
  const [tooltip, setTooltip] = useState<ChartTooltip>(null);
  const maxCount = Math.max(1, ...entries.map(([, count]) => count));
  const getX = (index: number) =>
    entries.length === 1
      ? CHART_PAD_X + CHART_INNER_WIDTH / 2
      : CHART_PAD_X + (CHART_INNER_WIDTH * index) / (entries.length - 1);
  const getY = (count: number) => CHART_PAD_TOP + CHART_INNER_HEIGHT - (CHART_INNER_HEIGHT * count) / maxCount;
  const points = entries.map(([, count], index) => `${getX(index)},${getY(count)}`).join(' ');
  const areaPoints = `${CHART_PAD_X},${CHART_PAD_TOP + CHART_INNER_HEIGHT} ${points} ${
    CHART_PAD_X + CHART_INNER_WIDTH
  },${CHART_PAD_TOP + CHART_INNER_HEIGHT}`;
  const gridValues = [0, Math.ceil(maxCount / 2), maxCount];
  const tooltipAlign =
    tooltip && tooltip.x > CHART_WIDTH * 0.72
      ? 'right'
      : tooltip && tooltip.x < CHART_WIDTH * 0.28
        ? 'left'
        : 'center';

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-[15rem] w-full"
        role="img"
        aria-label="Play count trend chart"
      >
        {gridValues.map((value, index) => {
          const y = getY(value);
          return (
            <g key={`grid-line-${index}-${value}`}>
              <line
                x1={CHART_PAD_X}
                y1={y}
                x2={CHART_PAD_X + CHART_INNER_WIDTH}
                y2={y}
                stroke="var(--atr-line)"
                strokeWidth="1"
                opacity="0.65"
              />
              <text
                x={CHART_PAD_X - 12}
                y={y + 4}
                textAnchor="end"
                className="afterroll-meta fill-[var(--ledger-muted)] text-[0.62rem]"
              >
                {value}
              </text>
            </g>
          );
        })}
        <polygon points={areaPoints} fill="var(--ledger-accent)" opacity="0.08" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--ledger-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {entries.map(([label, count, titles], index) => {
          const x = getX(index);
          const y = getY(count);
          const showMarker = count > 0 || !hideZeroMarkers;
          const showLabel = (showAllLabels || shouldShowChartLabel(index, entries)) && showMarker;
          const displayLabel = formatLabel(label);
          return (
            <g key={label}>
              {showMarker && (
                <>
                  <circle cx={x} cy={y} r="4" fill="var(--ledger-accent)" opacity="0.9" />
                  <circle
                    cx={x}
                    cy={y}
                    r="12"
                    fill="transparent"
                    className="cursor-help"
                    tabIndex={0}
                    onMouseEnter={() => setTooltip({ x, y, label: displayLabel, titles })}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={() => setTooltip({ x, y, label: displayLabel, titles })}
                    onBlur={() => setTooltip(null)}
                  />
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    className="afterroll-title pointer-events-none fill-[var(--ledger-ink)] text-[0.68rem]"
                  >
                    {count}
                  </text>
                </>
              )}
              {showLabel && (
                <text
                  x={x}
                  y={CHART_HEIGHT - 16}
                  textAnchor="middle"
                  className="afterroll-meta fill-[var(--ledger-muted)] text-[0.62rem]"
                >
                  {displayLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div
          className={`pointer-events-none absolute z-10 w-max max-w-[min(22rem,calc(100%-1rem))] -translate-y-full rounded-[0.35rem] border border-[var(--atr-line)] bg-white/95 px-[0.7rem] py-[0.55rem] shadow-[0_0.5rem_1.4rem_rgba(68,52,36,0.14)] ${
            tooltipAlign === 'right'
              ? '-translate-x-full'
              : tooltipAlign === 'left'
                ? 'translate-x-0'
                : '-translate-x-1/2'
          }`}
          style={{
            left: `${(tooltip.x / CHART_WIDTH) * 100}%`,
            top: `${(tooltip.y / CHART_HEIGHT) * 100}%`,
          }}
        >
          <div className="afterroll-meta mb-[0.32rem] text-[0.68rem] text-[var(--ledger-soft)]">
            {tooltip.label}
          </div>
          <div className="flex flex-col gap-[0.18rem]">
            {tooltip.titles.map((title, index) => (
              <div key={`${title}-${index}`} className="afterroll-meta text-[0.72rem] leading-snug text-[var(--ledger-ink)]">
                {title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  plays: PlayEntry[];
  titleDatesMap: Map<string, TitleDates>;
  titleSessionsMap: Map<string, PlaySessionSummary[]>;
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ledger-paper-panel rounded-[0.45rem] px-[1.2rem] py-[1rem]">
      <p className="afterroll-meta mb-[0.8rem] text-[0.72rem] uppercase tracking-[0.1em] text-[var(--ledger-soft)]">
        {label}
      </p>
      {children}
    </div>
  );
}

export default function PlaysStats({ plays, titleDatesMap, titleSessionsMap }: Props) {
  const [participantSearch, setParticipantSearch] = useState('');
  const [selectedMonthYear, setSelectedMonthYear] = useState('');

  const ruleCounts: Record<string, number> = {};
  plays.forEach((p) => {
    if (p.rule) ruleCounts[p.rule] = (ruleCounts[p.rule] ?? 0) + 1;
  });
  const ruleEntries = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);

  const pcCounts: Record<string, number> = {};
  plays.forEach((p) => {
    if (p.playerCount) pcCounts[p.playerCount] = (pcCounts[p.playerCount] ?? 0) + 1;
  });
  const pcEntries = Object.entries(pcCounts).sort((a, b) => comparePlayerCounts(a[0], b[0]));

  const statusCounts = { scheduled: 0, ongoing: 0, completed: 0, dropped: 0 };
  plays.forEach((p) => {
    statusCounts[p.status] += 1;
  });

  const roleCounts: Record<PlayType, number> = { GM: 0, PL: 0 };
  plays.forEach((p) => {
    if (PLAY_ROLES.includes(p.type)) roleCounts[p.type] += 1;
  });

  const searchTerm = participantSearch.trim();
  const matchedPlays = searchTerm
    ? plays.filter((p) => p.participants.some((x) => x.includes(searchTerm)))
    : [];

  const yearCounts: Record<string, number> = {};
  const monthCounts: Record<string, number> = {};
  const yearTitles: Record<string, string[]> = {};
  const monthTitles: Record<string, string[]> = {};
  plays.forEach((p) => {
    const sd = p.startDate || titleDatesMap.get(p.title)?.startDate;
    if (!sd) return;
    const year = sd.slice(0, 4);
    yearCounts[year] = (yearCounts[year] ?? 0) + 1;
    yearTitles[year] = [...(yearTitles[year] ?? []), p.title];

    const sessions = titleSessionsMap.get(p.title) ?? [];
    if (sessions.length > 0) {
      const activeMonths = new Set(sessions.map((session) => session.date.slice(0, 7)));
      activeMonths.forEach((month) => {
        monthCounts[month] = (monthCounts[month] ?? 0) + 1;
        monthTitles[month] = [...(monthTitles[month] ?? []), p.title];
      });
      return;
    }

    const month = sd.slice(0, 7);
    monthCounts[month] = (monthCounts[month] ?? 0) + 1;
    monthTitles[month] = [...(monthTitles[month] ?? []), p.title];
  });
  const yearEntries = Object.entries(yearCounts)
    .map(([year, count]): CountEntry => [year, count, yearTitles[year] ?? []])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const monthYears = [...new Set(Object.keys(monthCounts).map((month) => month.slice(0, 4)))]
    .sort((a, b) => b.localeCompare(a));
  const activeMonthYear = monthYears.includes(selectedMonthYear)
    ? selectedMonthYear
    : monthYears[0] ?? '';
  const monthEntries = activeMonthYear ? getYearMonthEntries(activeMonthYear, monthCounts, monthTitles) : [];

  if (plays.length === 0) {
    return (
      <div className="ledger-paper-panel rounded-[0.45rem] p-[2rem] text-center afterroll-meta text-[var(--ledger-muted)]">
        등록된 플레이 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[0.8rem]">
      <StatCard label="상태 기록">
        <div className="flex flex-wrap gap-[1.8rem]">
          {(['scheduled', 'ongoing', 'completed', 'dropped'] as const).map((s) => (
            <div key={s} className="text-center">
              <div className="afterroll-title text-[2rem] leading-none text-[var(--ledger-ink)]">
                {statusCounts[s]}
              </div>
              <div className="afterroll-meta mt-[0.3rem] text-[0.72rem] text-[var(--ledger-muted)]">
                {STATUS_LABEL[s]}
              </div>
            </div>
          ))}
          <div className="text-center">
            <div className="afterroll-title text-[2rem] leading-none text-[var(--ledger-ink)]">
              {plays.length}
            </div>
            <div className="afterroll-meta mt-[0.3rem] text-[0.72rem] text-[var(--ledger-muted)]">전체</div>
          </div>
        </div>
      </StatCard>

      <StatCard label="역할 기록">
        <div className="flex flex-col gap-[0.4rem]">
          {PLAY_ROLES.map((role) => (
            <div key={role} className="flex items-center gap-[0.6rem]">
              <span className="afterroll-meta w-[6rem] shrink-0 text-[0.85rem] text-[var(--ledger-ink)]">
                {role}
              </span>
              <div className="h-[0.25rem] flex-1 overflow-hidden rounded-full bg-[rgba(88, 125, 163,0.1)]">
                <div
                  className="h-full rounded-full bg-[var(--ledger-accent)]"
                  style={{ width: `${(roleCounts[role] / plays.length) * 100}%`, opacity: 0.6 }}
                />
              </div>
              <span className="afterroll-meta w-[2.5rem] text-right text-[0.8rem] text-[var(--ledger-muted)]">
                {roleCounts[role]}
              </span>
            </div>
          ))}
        </div>
      </StatCard>

      {ruleEntries.length > 0 && (
        <StatCard label="룰 빈도">
          <div className="flex flex-col gap-[0.4rem]">
            {ruleEntries.map(([rule, count]) => (
              <div key={rule} className="flex items-center gap-[0.6rem]">
                <span className="afterroll-meta w-[6rem] shrink-0 text-[0.85rem] text-[var(--ledger-ink)]">
                  {rule}
                </span>
                <div className="h-[0.25rem] flex-1 overflow-hidden rounded-full bg-[rgba(88, 125, 163,0.1)]">
                  <div
                    className="h-full rounded-full bg-[var(--ledger-accent)]"
                    style={{ width: `${(count / plays.length) * 100}%`, opacity: 0.6 }}
                  />
                </div>
                <span className="afterroll-meta w-[2.5rem] text-right text-[0.8rem] text-[var(--ledger-muted)]">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </StatCard>
      )}

      {pcEntries.length > 0 && (
        <StatCard label="인원수">
          <div className="flex flex-col gap-[0.4rem]">
            {pcEntries.map(([pc, count]) => (
              <div key={pc} className="flex items-center gap-[0.6rem]">
                <span className="afterroll-meta w-[6rem] shrink-0 text-[0.85rem] text-[var(--ledger-ink)]">
                  {pc}
                </span>
                <div className="h-[0.25rem] flex-1 overflow-hidden rounded-full bg-[rgba(88, 125, 163,0.1)]">
                  <div
                    className="h-full rounded-full bg-[var(--ledger-accent)]"
                    style={{ width: `${(count / plays.length) * 100}%`, opacity: 0.6 }}
                  />
                </div>
                <span className="afterroll-meta w-[2.5rem] text-right text-[0.8rem] text-[var(--ledger-muted)]">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </StatCard>
      )}

      <StatCard label="참여자 검색">
        <input
          value={participantSearch}
          onChange={(e) => setParticipantSearch(e.target.value)}
          placeholder="참여자 검색..."
          className="w-full rounded-[0.3rem] border border-[var(--atr-line)] bg-white px-[0.7rem] py-[0.42rem] afterroll-meta text-[0.85rem] text-[var(--ledger-ink)] outline-none transition-colors placeholder:text-[var(--ledger-muted)] focus:border-[var(--ledger-accent)]"
        />
        {searchTerm && (
          <div className="mt-[0.7rem]">
            <p className="afterroll-meta mb-[0.4rem] text-[0.82rem] text-[var(--ledger-muted)]">
              <span className="text-[var(--ledger-ink)]">{'"'}{searchTerm}{'"'}</span> 일치 기록:{' '}
              <span className="text-[var(--ledger-accent)]">{matchedPlays.length}</span>
            </p>
            <div className="flex flex-col gap-[0.2rem]">
              {matchedPlays.map((p) => (
                <div key={p.id} className="afterroll-meta text-[0.78rem] text-[var(--ledger-muted)]">
                  - {p.title}
                  <span className="ml-[0.4rem] text-[var(--ledger-soft)]">({STATUS_LABEL[p.status]})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </StatCard>

      {yearEntries.length > 0 && (
        <StatCard label="연도 기록">
          <TrendChart entries={yearEntries} formatLabel={(year) => year} showAllLabels />
        </StatCard>
      )}

      {monthEntries.length > 0 && (
        <StatCard label="월별 기록">
          {monthYears.length > 1 && (
            <div className="mb-[0.8rem] flex flex-wrap gap-[0.35rem]">
              {monthYears.map((year) => {
                const selected = year === activeMonthYear;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setSelectedMonthYear(year)}
                    className={`rounded-[0.3rem] border px-[0.65rem] py-[0.32rem] afterroll-meta text-[0.72rem] transition-colors ${
                      selected
                        ? 'border-[var(--ledger-accent)] bg-[rgba(88,125,163,0.12)] text-[var(--ledger-ink)]'
                        : 'border-[var(--atr-line)] bg-white/50 text-[var(--ledger-muted)] hover:border-[var(--ledger-soft)] hover:text-[var(--ledger-ink)]'
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}
          <TrendChart
            entries={monthEntries}
            formatLabel={(month) => `${Number(month.slice(5, 7))}월`}
            hideZeroMarkers
            showAllLabels
          />
        </StatCard>
      )}
    </div>
  );
}
