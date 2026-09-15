'use client';

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToPlays,
  subscribeToPlaysOptions,
  deletePlay,
  type PlayEntry,
  type PlaysOptions,
} from '@/lib/data/firebasePlays';
import PlaysComposer from './PlaysComposer';
import PlaysStats from './PlaysStats';
import CharacterPreviewModal from '@/components/characters/CharacterPreviewModal';
import Image from '@/components/ArchiveImage';
import type { Character } from '@/lib/data/characters';

const CALENDAR_ID =
  '848efa2587af083c615b7c3581e818075a6489d1d0ce70c4ac3ef60880d0fbae%40group.calendar.google.com';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  updated?: string;
}

export type TitleDates = { startDate: string; endDate: string | null };
type PlaySession = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  isUpcoming: boolean;
};
export type PlayLogLink = { playId: string; href: string };

function LogLinkButton({ href }: { href: string }) {
  return <Link href={href} onClick={(event) => event.stopPropagation()} className="afterroll-meta inline-flex w-fit rounded-[0.35rem] border border-[var(--atr-line)] px-[0.5rem] py-[0.28rem] text-[0.72rem] text-[var(--ledger-muted)] transition-colors hover:border-[var(--atr-accent)] hover:text-[var(--atr-accent)]">로그 보기</Link>;
}

function getEventDate(e: CalendarEvent): string {
  if (e.start.date) return e.start.date;
  if (!e.start.dateTime) return '';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(e.start.dateTime));
}

function buildTitleDatesMap(events: CalendarEvent[]): Map<string, TitleDates> {
  const raw = new Map<string, string[]>();
  for (const e of events) {
    const date = getEventDate(e);
    if (!date || !e.summary?.trim()) continue;
    const arr = raw.get(e.summary) ?? [];
    arr.push(date);
    raw.set(e.summary, arr);
  }
  const result = new Map<string, TitleDates>();
  for (const [title, dates] of raw) {
    const sorted = [...dates].sort();
    result.set(title, {
      startDate: sorted[0],
      endDate: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    });
  }
  return result;
}

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(new Date(iso));
}

function getDurationMinutes(e: CalendarEvent): number | null {
  if (!e.start.dateTime || !e.end?.dateTime) return null;
  const diff = new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return Math.round(diff / 60000);
}

function getEventStartTime(e: CalendarEvent): number | null {
  if (e.start.dateTime) {
    const time = new Date(e.start.dateTime).getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (!e.start.date) return null;
  const time = new Date(`${e.start.date}T00:00:00+09:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function isUpcomingEvent(e: CalendarEvent): boolean {
  const startTime = getEventStartTime(e);
  return startTime !== null && startTime > Date.now();
}

function buildTitleSessionsMap(events: CalendarEvent[]): Map<string, PlaySession[]> {
  const result = new Map<string, PlaySession[]>();
  for (const e of events) {
    const title = e.summary?.trim();
    const date = getEventDate(e);
    if (!title || !date) continue;

    const sessions = result.get(title) ?? [];
    sessions.push({
      id: e.id,
      date,
      startTime: e.start.dateTime ? formatClock(e.start.dateTime) : null,
      endTime: e.end?.dateTime ? formatClock(e.end.dateTime) : null,
      durationMinutes: getDurationMinutes(e),
      isUpcoming: isUpcomingEvent(e),
    });
    result.set(title, sessions);
  }

  for (const sessions of result.values()) {
    sessions.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return (a.startTime ?? '').localeCompare(b.startTime ?? '');
    });
  }

  return result;
}

function getTotalDurationMinutes(sessions: PlaySession[]): number | null {
  const elapsedSessions = sessions.filter((session) => !session.isUpcoming);
  if (elapsedSessions.length === 0) return sessions.length > 0 ? 0 : null;
  const hasDuration = elapsedSessions.some((session) => session.durationMinutes !== null);
  if (!hasDuration) return null;
  return elapsedSessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);
}

function formatDate(d: string): string {
  return d.replace(/-/g, '.');
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '시간 정보 없음';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function formatSessionTime(session: PlaySession): string {
  if (!session.startTime || !session.endTime) return '시간 정보 없음';
  return `${session.startTime}-${session.endTime}`;
}

function getEntryDates(entry: PlayEntry, fallback: TitleDates | undefined): TitleDates | null {
  const startDate = entry.startDate || fallback?.startDate;
  if (!startDate) return null;

  return {
    startDate,
    endDate: entry.endDate ?? fallback?.endDate ?? null,
  };
}

function getDisplayedParticipants(entry: PlayEntry): string[] {
  const { participants, type, gmParticipant } = entry;
  if (type !== 'PL' || !gmParticipant || !participants.includes(gmParticipant)) return participants;
  return [gmParticipant, ...participants.filter((participant) => participant !== gmParticipant)];
}

function PlayExpandedDetails({
  entry,
  sessions,
  totalDurationMinutes,
  linkedCharacters,
  logHref,
  onSelectCharacter,
}: {
  entry: PlayEntry;
  sessions: PlaySession[];
  totalDurationMinutes: number | null;
  linkedCharacters: Character[];
  logHref?: string;
  onSelectCharacter: (character: Character) => void;
}) {
  const hasSessions = sessions.length > 0;
  const hasParticipants = entry.participants.length > 0;

  return (
    <div className="flex flex-col gap-[0.8rem] py-[0.8rem]">
      <div className={`grid gap-[0.8rem] items-start ${linkedCharacters.length ? 'grid-cols-[minmax(6.5rem,8rem)_minmax(0,1fr)] sm:grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)]' : ''}`}>
        <div className="grid grid-cols-1 gap-[0.45rem]">
          {linkedCharacters.map((character) => (
            <motion.button
              key={character.id}
              type="button"
              whileHover={{ y: '-0.12rem', rotate: -0.5 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(event) => { event.stopPropagation(); onSelectCharacter(character); }}
              className="group relative overflow-hidden rounded-[0.18rem] border border-[rgba(87,67,48,0.16)] bg-[#fffdfa] p-[0.3rem] pb-[0.55rem] text-left shadow-[0_0.18rem_0.45rem_rgba(87,67,48,0.1)]"
              aria-label={`${character.name} 캐릭터 보기`}
            >
              <span className="relative block aspect-[0.78] overflow-hidden bg-[rgba(200,121,147,0.13)]">
                <Image src={character.portrait.cropped} alt={`${character.name}의 초상`} fill sizes="(max-width: 640px) 42vw, 9rem" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              </span>
              <span className="afterroll-meta mt-[0.38rem] block truncate text-center text-[0.74rem] text-[var(--ledger-ink)]">{character.name}</span>
            </motion.button>
          ))}
        </div>

        {hasSessions ? (
          <section aria-label="캘린더 플레이 기록">
            <div className="afterroll-meta mb-[0.38rem] text-[0.7rem] text-[var(--ledger-soft)]">
              캘린더 플레이 기록
              <span className="ml-[0.45rem] text-[var(--ledger-accent)]">총 {formatDuration(totalDurationMinutes)}</span>
            </div>
            <div className="grid gap-[0.28rem] lg:grid-cols-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`afterroll-meta rounded-[0.45rem] border px-[0.6rem] py-[0.45rem] text-[0.74rem] transition-colors ${
                    session.isUpcoming
                      ? 'border-[rgba(200,121,147,0.08)] bg-[rgba(255,248,250,0.34)] text-[rgba(128,96,107,0.42)]'
                      : 'border-[rgba(200,121,147,0.18)] bg-[rgba(255,248,250,0.72)] text-[var(--ledger-muted)]'
                  }`}
                >
                  <span className={session.isUpcoming ? 'text-[rgba(128,96,107,0.48)]' : 'text-[var(--ledger-ink)]'}>{formatDate(session.date)}</span>
                  <span className="mx-[0.35rem] text-[rgba(128,96,107,0.4)]">/</span>
                  <span>{formatSessionTime(session)}</span>
                  <span className="mx-[0.35rem] text-[rgba(128,96,107,0.4)]">/</span>
                  <span>{formatDuration(session.durationMinutes)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="hidden sm:block" aria-hidden="true" />
        )}
      </div>

      {(hasParticipants || logHref) && (
        <div className="flex flex-wrap items-center gap-[0.4rem] border-t border-[rgba(200,121,147,0.12)] pt-[0.65rem]">
          {hasParticipants && (
            <>
              <span className="afterroll-meta mr-[0.12rem] text-[0.7rem] text-[var(--ledger-soft)]">참여자</span>
              {getDisplayedParticipants(entry).map((participant) => (
                <span
                  key={participant}
                  className={`afterroll-meta rounded-full border px-[0.5rem] py-[0.12rem] text-[0.72rem] ${
                    entry.type === 'PL' && entry.gmParticipant === participant
                      ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] text-[var(--ledger-accent)]'
                      : 'border-[rgba(200,121,147,0.2)] bg-[rgba(232,169,186,0.12)] text-[var(--ledger-soft)]'
                  }`}
                >
                  {participant}{entry.type === 'PL' && entry.gmParticipant === participant ? ' · GM' : ''}
                </span>
              ))}
            </>
          )}
          {logHref && <span className="ml-auto"><LogLinkButton href={logHref} /></span>}
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<PlayEntry['status'], string> = {
  scheduled: '예정',
  completed: '완주',
  ongoing: '진행',
  dropped: '하차',
};

const STATUS_STYLE: Record<PlayEntry['status'], string> = {
  scheduled: 'bg-[rgba(172,151,110,0.12)] text-[rgba(117,96,58,0.85)] border-[rgba(172,151,110,0.28)]',
  completed: 'bg-[rgba(94,132,146,0.12)] text-[rgba(61,95,111,0.85)] border-[rgba(94,132,146,0.28)]',
  ongoing: 'bg-[rgba(232,169,186,0.2)] text-[var(--ledger-accent)] border-[rgba(200,121,147,0.32)]',
  dropped: 'bg-[rgba(128,96,107,0.07)] text-[var(--ledger-muted)] border-[rgba(128,96,107,0.18)]',
};

const TH = 'px-[0.75rem] py-[0.55rem] text-center whitespace-nowrap';
const TD =
  'afterroll-meta px-[0.75rem] py-[0.5rem] text-center text-[0.8rem] text-[var(--ledger-muted)] align-middle whitespace-nowrap';

function colCount(isAdmin: boolean) {
  return isAdmin ? 7 : 6;
}

// 클릭 가능한 컬럼 헤더
function ColHeader({
  col,
  label,
  openColumn,
  isActive,
  onOpen,
}: {
  col: string;
  label: string;
  openColumn: string | null;
  isActive: boolean;
  onOpen: (col: string, e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      onClick={(e) => onOpen(col, e)}
      className={`afterroll-meta inline-flex items-center justify-center gap-[0.22rem] text-[0.68rem] uppercase tracking-[0.06em] transition-colors ${
        isActive
          ? 'text-[var(--ledger-accent)]'
          : 'text-[var(--ledger-soft)] hover:text-[var(--ledger-ink)]'
      }`}
    >
      {label}
      <span
        className={`inline-block text-[0.52rem] transition-transform duration-150 ${
          openColumn === col ? 'rotate-180' : ''
        }`}
      >
                                  v
      </span>
      {isActive && (
        <span className="h-[0.28rem] w-[0.28rem] rounded-full bg-[var(--ledger-accent)]" />
      )}
    </button>
  );
}

export default function PlaysSection({ logLinks = [], characters = [] }: { logLinks?: PlayLogLink[]; characters?: Character[] }) {
  const { isAdmin, loading: authLoading } = useAuth();
  const [plays, setPlays] = useState<PlayEntry[]>([]);
  const [options, setOptions] = useState<PlaysOptions>({
    rules: [],
    playerCounts: [],
    participants: [],
  });
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(true);
  const [calError, setCalError] = useState<string | null>(null);
  const [playsLoading, setPlaysLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'stats'>('list');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PlayEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // 드롭다운
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // 필터
  const [filterStatus, setFilterStatus] = useState<PlayEntry['status'] | 'all'>('all');
  const [filterType, setFilterType] = useState<'GM' | 'PL' | 'all'>('all');
  const [filterRule, setFilterRule] = useState('all');
  const [filterPlayerCount, setFilterPlayerCount] = useState('all');
  const [filterTitleSearch, setFilterTitleSearch] = useState('');
  const [filterStartYear, setFilterStartYear] = useState('all');

  useEffect(() => {
    const u1 = subscribeToPlays((entries) => { setPlays(entries); setPlaysLoading(false); });
    const u2 = subscribeToPlaysOptions(setOptions);
    return () => { u1(); u2(); };
  }, []);

  const fetchCalendarEvents = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_API_KEY;
    if (!apiKey) {
      setCalError('Google Calendar API 키가 설정되지 않았습니다.');
      setCalLoading(false);
      return;
    }
    setCalLoading(true);
    setCalError(null);

    const timeMin = encodeURIComponent('2018-01-01T00:00:00Z');
    const timeMax = encodeURIComponent('2030-12-31T23:59:59Z');
    const cacheBust = Date.now();
    const all: CalendarEvent[] = [];
    let pageToken: string | undefined;
    try {
      do {
        const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const url = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&timeZone=Asia%2FSeoul&singleEvents=true&orderBy=startTime&maxResults=2500&cacheBust=${cacheBust}${tokenParam}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? `Google Calendar API 요청 실패: HTTP ${res.status}`);
        }
        const data = await res.json() as { items?: CalendarEvent[]; nextPageToken?: string };
        all.push(...(data.items ?? []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      setCalEvents(all);
    } catch (e) {
      setCalEvents([]);
      setCalError(e instanceof Error ? e.message : 'Google Calendar 정보를 불러오지 못했습니다.');
    }
    finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void fetchCalendarEvents(); });
  }, [fetchCalendarEvents]);

  const titleDatesMap = useMemo(() => buildTitleDatesMap(calEvents), [calEvents]);
  const titleSessionsMap = useMemo(() => buildTitleSessionsMap(calEvents), [calEvents]);

  const calendarTitles = useMemo(() => {
    const registered = new Set(plays.map((p) => p.title));
    if (editTarget) registered.delete(editTarget.title);
    return [...new Set(calEvents.map((e) => e.summary).filter(Boolean))]
      .filter((t) => !registered.has(t))
      .sort();
  }, [calEvents, plays, editTarget]);

  const uniqueRules = useMemo(
    () => [...new Set(plays.map((p) => p.rule).filter(Boolean))].sort(),
    [plays],
  );
  const uniquePlayerCounts = useMemo(
    () =>
      [...new Set(plays.map((p) => p.playerCount).filter(Boolean))].sort(
        (a, b) => (parseInt(a) || 0) - (parseInt(b) || 0),
      ),
    [plays],
  );
  const uniqueStartYears = useMemo(() => {
    const years = new Set<string>();
    plays.forEach((p) => {
      const dates = getEntryDates(p, titleDatesMap.get(p.title));
      if (dates) years.add(dates.startDate.slice(0, 4));
    });
    return [...years].sort().reverse();
  }, [plays, titleDatesMap]);

  const participantPlayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    plays.forEach((play) => {
      play.participants.forEach((participant) => {
        counts.set(participant, (counts.get(participant) ?? 0) + 1);
      });
    });
    return counts;
  }, [plays]);

  const charactersBySession = useMemo(() => {
    const bySession = new Map<string, Character[]>();
    characters.forEach((character) => {
      character.sessionKeys.forEach((sessionKey) => {
        const linked = bySession.get(sessionKey) ?? [];
        linked.push(character);
        bySession.set(sessionKey, linked);
      });
    });
    return bySession;
  }, [characters]);
  const logByPlayId = useMemo(
    () => new Map(logLinks.filter((log) => log.playId).map((log) => [log.playId, log.href])),
    [logLinks],
  );

  const filteredPlays = useMemo(() => {
    return plays
      .filter((p) => {
        if (filterStatus !== 'all' && p.status !== filterStatus) return false;
        if (filterType !== 'all' && p.type !== filterType) return false;
        if (filterRule !== 'all' && p.rule !== filterRule) return false;
        if (filterPlayerCount !== 'all' && p.playerCount !== filterPlayerCount) return false;
        if (filterTitleSearch && !p.title.toLowerCase().includes(filterTitleSearch.toLowerCase()))
          return false;
        if (filterStartYear !== 'all') {
          const dates = getEntryDates(p, titleDatesMap.get(p.title));
          if (!dates || dates.startDate.slice(0, 4) !== filterStartYear) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aDates = getEntryDates(a, titleDatesMap.get(a.title));
        const bDates = getEntryDates(b, titleDatesMap.get(b.title));
        const aEnd = aDates ? (aDates.endDate ?? aDates.startDate) : '';
        const bEnd = bDates ? (bDates.endDate ?? bDates.startDate) : '';
        return bEnd.localeCompare(aEnd) || a.title.localeCompare(b.title, 'ko');
      });
  }, [plays, filterStatus, filterType, filterRule, filterPlayerCount, filterTitleSearch, filterStartYear, titleDatesMap]);

  function openFilter(col: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (openColumn === col) { setOpenColumn(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setOpenColumn(col);
  }

  function closeFilter() { setOpenColumn(null); }

  function isFilterActive(col: string): boolean {
    if (col === 'status') return filterStatus !== 'all';
    if (col === 'type') return filterType !== 'all';
    if (col === 'rule') return filterRule !== 'all';
    if (col === 'playerCount') return filterPlayerCount !== 'all';
    if (col === 'title') return filterTitleSearch !== '';
    if (col === 'startYear') return filterStartYear !== 'all';
    return false;
  }

  function openAdd() { setEditTarget(null); setComposerOpen(true); }
  function openEdit(entry: PlayEntry) { setEditTarget(entry); setComposerOpen(true); }
  function closeComposer() { setComposerOpen(false); setEditTarget(null); }
  function toggleExpand(id: string) { setExpandedId((prev) => (prev === id ? null : id)); }

  const loading = authLoading || playsLoading || calLoading;

  // 드롭다운 콘텐츠
  const ddClass =
    'min-w-[8rem] overflow-hidden rounded-[0.6rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] shadow-none';
  const optCls = (active: boolean) =>
    `block w-full text-left px-[0.85rem] py-[0.42rem] afterroll-meta text-[0.82rem] transition-colors hover:bg-[rgba(232,169,186,0.18)] ${
      active ? 'bg-[rgba(232,169,186,0.16)] text-[var(--ledger-accent)]' : 'text-[var(--ledger-ink)]'
    }`;
  const divEl = <div className="border-b border-[rgba(200,121,147,0.14)]" />;

  function renderDropdown() {
    if (openColumn === 'startYear') {
      return (
        <div className={ddClass}>
          <button className={optCls(filterStartYear === 'all')} onClick={() => { setFilterStartYear('all'); closeFilter(); }}>전체</button>
          {uniqueStartYears.length > 0 && divEl}
          {uniqueStartYears.map((y) => (
            <button key={y} className={optCls(filterStartYear === y)} onClick={() => { setFilterStartYear(y); closeFilter(); }}>{y}</button>
          ))}
        </div>
      );
    }
    if (openColumn === 'rule') {
      return (
        <div className={ddClass}>
          <button className={optCls(filterRule === 'all')} onClick={() => { setFilterRule('all'); closeFilter(); }}>전체</button>
          {uniqueRules.length > 0 && divEl}
          {uniqueRules.map((r) => (
            <button key={r} className={optCls(filterRule === r)} onClick={() => { setFilterRule(r); closeFilter(); }}>{r}</button>
          ))}
        </div>
      );
    }
    if (openColumn === 'title') {
      return (
        <div className={`${ddClass} min-w-[11rem] p-[0.5rem]`}>
          <input
            autoFocus
            value={filterTitleSearch}
            onChange={(e) => setFilterTitleSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') closeFilter(); }}
            placeholder="이름 검색..."
            className="w-full afterroll-meta rounded-[0.4rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] px-[0.6rem] py-[0.38rem] text-[0.82rem] text-[var(--ledger-ink)] outline-none placeholder:text-[var(--ledger-muted)] focus:border-[var(--ledger-accent)]"
          />
          {filterTitleSearch && (
            <button
              className="mt-[0.3rem] w-full text-center afterroll-meta text-[0.72rem] text-[var(--ledger-muted)] hover:text-[var(--ledger-accent)]"
              onClick={() => { setFilterTitleSearch(''); closeFilter(); }}
            >
              초기화
            </button>
          )}
        </div>
      );
    }
    if (openColumn === 'playerCount') {
      return (
        <div className={ddClass}>
          <button className={optCls(filterPlayerCount === 'all')} onClick={() => { setFilterPlayerCount('all'); closeFilter(); }}>전체</button>
          {uniquePlayerCounts.length > 0 && divEl}
          {uniquePlayerCounts.map((c) => (
            <button key={c} className={optCls(filterPlayerCount === c)} onClick={() => { setFilterPlayerCount(c); closeFilter(); }}>{c}</button>
          ))}
        </div>
      );
    }
    if (openColumn === 'type') {
      return (
        <div className={ddClass}>
          {(['all', 'PL', 'GM'] as const).map((v) => (
            <button key={v} className={optCls(filterType === v)} onClick={() => { setFilterType(v); closeFilter(); }}>
              {v === 'all' ? '전체' : v}
            </button>
          ))}
        </div>
      );
    }
    if (openColumn === 'status') {
      return (
        <div className={ddClass}>
          {([['all', '전체'], ['scheduled', '예정'], ['ongoing', '진행'], ['completed', '완주'], ['dropped', '하차']] as const).map(([v, l]) => (
            <button key={v} className={optCls(filterStatus === v)} onClick={() => { setFilterStatus(v); closeFilter(); }}>{l}</button>
          ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div>
      {/* 탭과 관리 액션 */}
      <div className="mb-[1.2rem] flex flex-wrap items-center justify-between gap-[0.7rem]">
        <div className="flex gap-[0.4rem]">
          {(['list', 'stats'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`afterroll-meta rounded-[0.4rem] border px-[0.85rem] py-[0.35rem] text-[0.8rem] transition-all ${
                tab === t
                  ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.18)] text-[var(--ledger-accent)]'
                  : 'border-[rgba(200,121,147,0.22)] text-[var(--ledger-muted)] hover:text-[var(--ledger-ink)]'
              }`}
            >
              {t === 'list' ? '목록' : '통계'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-[0.45rem]">
          {tab === 'list' && isAdmin && !loading && (
            <button
              onClick={openAdd}
              className="afterroll-meta rounded-[0.4rem] border border-[rgba(200,121,147,0.24)] bg-transparent px-[0.85rem] py-[0.35rem] text-[0.8rem] text-[var(--ledger-muted)] shadow-none transition-all hover:border-[var(--ledger-accent)] hover:text-[var(--ledger-ink)]"
            >
              + 플레이 추가
            </button>
          )}
        </div>
      </div>

      {calError && (
        <div className="ledger-paper-panel mb-[1rem] rounded-[0.65rem] border border-[rgba(160,50,50,0.24)] bg-[rgba(180,60,60,0.06)] px-[1rem] py-[0.7rem] afterroll-meta text-[0.82rem] text-[rgba(150,45,45,0.9)]">
          캘린더 정보를 불러오지 못했습니다. {calError}
        </div>
      )}

      {loading ? (
        <div className="ledger-paper-panel rounded-[0.8rem] p-[2rem] text-center afterroll-meta text-[var(--ledger-muted)]">
          불러오는 중...
        </div>
      ) : tab === 'list' ? (
        plays.length === 0 ? (
          <div className="ledger-paper-panel rounded-[0.8rem] p-[2rem] text-center afterroll-meta text-[var(--ledger-muted)]">
            아직 등록된 플레이가 없습니다.
          </div>
        ) : (
          <>
            <div className="mb-[0.7rem] flex gap-[0.35rem] overflow-x-auto pb-[0.2rem] md:hidden">
              {([
                ['all', '전체'],
                ['scheduled', '예정'],
                ['ongoing', '진행'],
                ['completed', '완주'],
                ['dropped', '하차'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilterStatus(value)}
                  className={`afterroll-meta shrink-0 rounded-full border px-[0.7rem] py-[0.3rem] text-[0.76rem] transition-colors ${
                    filterStatus === value
                      ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.18)] text-[var(--ledger-accent)]'
                      : 'border-[rgba(200,121,147,0.2)] text-[var(--ledger-muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-[0.55rem] md:hidden">
              {filteredPlays.length === 0 ? (
                <div className="ledger-paper-panel rounded-[0.8rem] p-[1.5rem] text-center afterroll-meta text-[0.82rem] text-[var(--ledger-muted)]">
                  해당 조건에 맞는 플레이가 없습니다.
                </div>
              ) : (
                filteredPlays.map((entry) => {
                  const sessions = titleSessionsMap.get(entry.title) ?? [];
                  const totalDurationMinutes = getTotalDurationMinutes(sessions);
                  const isExpanded = expandedId === entry.id;
                  const hasParticipants = entry.participants.length > 0;
                  const hasSessions = sessions.length > 0;
                  const linkedCharacters = charactersBySession.get(entry.id) ?? [];
                  const logHref = logByPlayId.get(entry.id);
                  const canExpand = hasParticipants || hasSessions || linkedCharacters.length > 0 || Boolean(logHref);
                  return (
                    <article
                      key={entry.id}
                      className={`ledger-paper-panel overflow-hidden rounded-[0.8rem] transition-colors ${
                        isExpanded ? 'bg-[rgba(232,169,186,0.1)]' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => canExpand && toggleExpand(entry.id)}
                        aria-expanded={canExpand ? isExpanded : undefined}
                        className={`w-full px-[0.9rem] py-[0.8rem] text-left ${
                          canExpand ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-[0.7rem]">
                          <h2 className="afterroll-title min-w-0 text-[1.08rem] leading-snug text-[var(--ledger-ink)]">
                            {entry.title}
                          </h2>
                          <span className={`shrink-0 rounded-full border px-[0.45rem] py-[0.1rem] text-[0.67rem] ${STATUS_STYLE[entry.status]}`}>
                            {STATUS_LABEL[entry.status]}
                          </span>
                        </div>
                        <div className="afterroll-meta mt-[0.45rem] flex flex-wrap gap-x-[0.45rem] gap-y-[0.18rem] text-[0.76rem] text-[var(--ledger-muted)]">
                          <span>{entry.rule || '룰 미정'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.type}</span>
                          <span aria-hidden="true">·</span>
                          {entry.note && (
                            <>
                              <span>{entry.note}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>{entry.playerCount || '인원 미정'}</span>
                        </div>
                        {canExpand && (
                          <div className="afterroll-meta mt-[0.4rem] flex justify-end text-[0.72rem] text-[var(--ledger-soft)]">
                            <span className={`text-[0.62rem] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                              v
                            </span>
                          </div>
                        )}
                      </button>

                      {isAdmin && (
                        <div className="flex justify-end gap-[0.25rem] border-t border-[rgba(200,121,147,0.1)] px-[0.55rem] py-[0.35rem]">
                          {deletingId === entry.id ? (
                            <>
                              <button
                                type="button"
                                onClick={async () => { await deletePlay(entry.id); setDeletingId(null); }}
                                className="afterroll-meta rounded-[0.3rem] px-[0.45rem] py-[0.22rem] text-[0.7rem] text-[rgba(160,50,50,0.85)]"
                              >
                                삭제 확인
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                className="afterroll-meta rounded-[0.3rem] px-[0.45rem] py-[0.22rem] text-[0.7rem] text-[var(--ledger-muted)]"
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(entry)}
                                className="afterroll-meta rounded-[0.3rem] px-[0.45rem] py-[0.22rem] text-[0.7rem] text-[var(--ledger-muted)]"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingId(entry.id)}
                                className="afterroll-meta rounded-[0.3rem] px-[0.45rem] py-[0.22rem] text-[0.7rem] text-[rgba(160,50,50,0.8)]"
                              >
                                삭제
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {isExpanded && canExpand && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden border-t border-[rgba(200,121,147,0.12)]"
                          >
                            <>
                              <div className="px-[0.9rem]">
                                <PlayExpandedDetails entry={entry} sessions={sessions} totalDurationMinutes={totalDurationMinutes} linkedCharacters={linkedCharacters} logHref={logHref} onSelectCharacter={setSelectedCharacter} />
                              </div>
                              <div className="hidden flex flex-col gap-[0.6rem] px-[0.9rem] py-[0.7rem]">
                              {logHref && <LogLinkButton href={logHref} />}
                              {hasSessions && (
                                <div>
                                  <div className="afterroll-meta mb-[0.35rem] text-[0.7rem] text-[var(--ledger-soft)]">
                                    플레이 기록 <span className="ml-[0.35rem] text-[var(--ledger-accent)]">총 {formatDuration(totalDurationMinutes)}</span>
                                  </div>
                                  <div className="flex flex-col gap-[0.25rem]">
                                    {sessions.map((session) => (
                                      <div key={session.id} className="afterroll-meta rounded-[0.4rem] border border-[rgba(200,121,147,0.14)] bg-[rgba(255,248,250,0.62)] px-[0.55rem] py-[0.38rem] text-[0.72rem] text-[var(--ledger-muted)]">
                                        {formatDate(session.date)} · {formatSessionTime(session)} · {formatDuration(session.durationMinutes)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {null}
                              {hasParticipants && (
                                <div className="flex flex-wrap gap-[0.3rem]">
                                  <span className="afterroll-meta mr-[0.15rem] text-[0.7rem] text-[var(--ledger-soft)]">참여자</span>
                                  {getDisplayedParticipants(entry).map((participant) => (
                                    <span
                                      key={participant}
                                      className={`afterroll-meta rounded-full border px-[0.5rem] py-[0.1rem] text-[0.72rem] ${
                                        entry.type === 'PL' && entry.gmParticipant === participant
                                          ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] text-[var(--ledger-accent)]'
                                          : 'border-[rgba(200,121,147,0.2)] bg-[rgba(232,169,186,0.12)] text-[var(--ledger-soft)]'
                                      }`}
                                    >
                                      {participant}{entry.type === 'PL' && entry.gmParticipant === participant ? ' · GM' : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                              </div>
                            </>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </article>
                  );
                })
              )}
            </div>

            <div className="ledger-paper-panel hidden overflow-x-auto rounded-[0.8rem] md:block">
            <table className="w-full min-w-[34rem] border-collapse">
              <thead>
                <tr className="border-b border-[rgba(200,121,147,0.18)]">
                  <th className={TH}>
                    <span className="flex justify-center">
                      <ColHeader col="rule" label="룰" openColumn={openColumn} isActive={isFilterActive('rule')} onOpen={openFilter} />
                    </span>
                  </th>
                  <th className={`${TH} w-full`}>
                    <span className="flex justify-center">
                      <ColHeader col="title" label="제목" openColumn={openColumn} isActive={isFilterActive('title')} onOpen={openFilter} />
                    </span>
                  </th>
                  <th className={TH}>
                    <span className="afterroll-meta text-[0.68rem] uppercase tracking-[0.06em] text-[var(--ledger-soft)]">비고</span>
                  </th>
                  <th className={TH}>
                    <span className="flex justify-center">
                      <ColHeader col="playerCount" label="인원" openColumn={openColumn} isActive={isFilterActive('playerCount')} onOpen={openFilter} />
                    </span>
                  </th>
                  <th className={TH}>
                    <span className="flex justify-center">
                      <ColHeader col="type" label="유형" openColumn={openColumn} isActive={isFilterActive('type')} onOpen={openFilter} />
                    </span>
                  </th>
                  <th className={TH}>
                    <span className="flex justify-center">
                      <ColHeader col="status" label="상태" openColumn={openColumn} isActive={isFilterActive('status')} onOpen={openFilter} />
                    </span>
                  </th>
                  {isAdmin && <th className={TH} />}
                </tr>
              </thead>
              <tbody>
                {filteredPlays.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount(isAdmin)}
                      className="afterroll-meta px-[0.75rem] py-[1.5rem] text-center text-[0.82rem] text-[var(--ledger-muted)]"
                    >
                      해당 조건에 맞는 플레이가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredPlays.map((entry, i) => {
                    const sessions = titleSessionsMap.get(entry.title) ?? [];
                    const totalDurationMinutes = getTotalDurationMinutes(sessions);
                    const isExpanded = expandedId === entry.id;
                    const hasParticipants = entry.participants.length > 0;
                    const hasSessions = sessions.length > 0;
                    const linkedCharacters = charactersBySession.get(entry.id) ?? [];
                    const logHref = logByPlayId.get(entry.id);
                    const canExpand = hasParticipants || hasSessions || linkedCharacters.length > 0 || Boolean(logHref);
                    return (
                      <Fragment key={entry.id}>
                        <tr
                          onClick={() => canExpand && toggleExpand(entry.id)}
                          className={`transition-colors ${i > 0 ? 'border-t border-[rgba(200,121,147,0.12)]' : ''} ${
                            canExpand
                              ? 'cursor-pointer hover:bg-[rgba(232,169,186,0.14)]'
                              : 'hover:bg-[rgba(232,169,186,0.08)]'
                          } ${isExpanded ? 'bg-[rgba(232,169,186,0.12)]' : ''}`}
                        >
                          <td className={TD}>{entry.rule || '-'}</td>
                          <td className={`${TD} afterroll-title text-center text-[var(--ledger-ink)] whitespace-normal`}>
                            <span className="flex items-center justify-center gap-[0.35rem]">
                              {entry.title}
                              {canExpand && (
                                <span
                                  className={`text-[0.62rem] transition-transform duration-200 text-[var(--ledger-muted)] ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  v
                                </span>
                              )}
                            </span>
                          </td>
                          <td className={`${TD} whitespace-normal`}>{entry.note || '-'}</td>
                          <td className={TD}>{entry.playerCount ? `${entry.playerCount}` : '-'}</td>
                          <td className={TD}>{entry.type}</td>
                          <td className={TD}>
                            <span className={`rounded-full border px-[0.45rem] py-[0.1rem] text-[0.67rem] ${STATUS_STYLE[entry.status]}`}>
                              {STATUS_LABEL[entry.status]}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className={`${TD} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                              {deletingId === entry.id ? (
                                <span className="flex items-center gap-[0.3rem]">
                                  <button
                                    onClick={async () => { await deletePlay(entry.id); setDeletingId(null); }}
                                    className="afterroll-meta rounded border border-[rgba(180,60,60,0.35)] px-[0.4rem] py-[0.18rem] text-[0.7rem] text-[rgba(160,50,50,0.85)] transition-all hover:bg-[rgba(180,60,60,0.08)]"
                                  >
                                    확인
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="afterroll-meta rounded border border-transparent px-[0.4rem] py-[0.18rem] text-[0.7rem] text-[var(--ledger-muted)] transition-all hover:text-[var(--ledger-ink)]"
                                  >
                                    취소
                                  </button>
                                </span>
                              ) : (
                                <span className="flex items-center gap-[0.3rem]">
                                  <button
                                    onClick={() => openEdit(entry)}
                                    className="afterroll-meta rounded border border-transparent px-[0.4rem] py-[0.18rem] text-[0.7rem] text-[var(--ledger-muted)] transition-all hover:border-[rgba(200,121,147,0.24)] hover:text-[var(--ledger-ink)]"
                                  >
                                    편집
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(entry.id)}
                                    className="afterroll-meta rounded border border-transparent px-[0.4rem] py-[0.18rem] text-[0.7rem] text-[var(--ledger-muted)] transition-all hover:border-[rgba(180,60,60,0.25)] hover:text-[rgba(160,50,50,0.8)]"
                                  >
                                    삭제
                                  </button>
                                </span>
                              )}
                            </td>
                          )}
                        </tr>

                        <AnimatePresence>
                          {isExpanded && canExpand && (
                            <tr
                              key={`${entry.id}-p`}
                              className="border-t border-[rgba(200,121,147,0.12)] bg-[rgba(232,169,186,0.1)]"
                            >
                              <td colSpan={colCount(isAdmin)} className="px-[0.75rem] py-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.18 }}
                                  className="overflow-hidden"
                                >
                                  <>
                                    <PlayExpandedDetails entry={entry} sessions={sessions} totalDurationMinutes={totalDurationMinutes} linkedCharacters={linkedCharacters} logHref={logHref} onSelectCharacter={setSelectedCharacter} />
                                    <div className="hidden flex flex-col gap-[0.65rem] py-[0.65rem]">
                                    {logHref && <LogLinkButton href={logHref} />}
                                    {hasSessions && (
                                      <div>
                                        <div className="afterroll-meta mb-[0.35rem] text-[0.7rem] text-[var(--ledger-soft)]">
                                          캘린더 플레이 기록
                                          <span className="ml-[0.45rem] text-[var(--ledger-accent)]">
                                            총 {formatDuration(totalDurationMinutes)}
                                          </span>
                                        </div>
                                        <div className="grid gap-[0.25rem] sm:grid-cols-2 lg:grid-cols-3">
                                          {sessions.map((session) => (
                                            <div
                                              key={session.id}
                                              className={`afterroll-meta rounded-[0.45rem] border px-[0.55rem] py-[0.38rem] text-[0.72rem] transition-colors ${
                                                session.isUpcoming
                                                  ? 'border-[rgba(200,121,147,0.08)] bg-[rgba(255,248,250,0.34)] text-[rgba(128,96,107,0.42)]'
                                                  : 'border-[rgba(200,121,147,0.18)] bg-[rgba(255,248,250,0.72)] text-[var(--ledger-muted)]'
                                              }`}
                                            >
                                              <span className={session.isUpcoming ? 'text-[rgba(128,96,107,0.48)]' : 'text-[var(--ledger-ink)]'}>{formatDate(session.date)}</span>
                                              <span className="mx-[0.35rem] text-[rgba(128,96,107,0.4)]">/</span>
                                              <span>{formatSessionTime(session)}</span>
                                              <span className="mx-[0.35rem] text-[rgba(128,96,107,0.4)]">/</span>
                                              <span>{formatDuration(session.durationMinutes)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {null}
                                    {hasParticipants && (
                                      <div className="flex flex-wrap gap-[0.3rem]">
                                        <span className="afterroll-meta mr-[0.2rem] text-[0.7rem] text-[var(--ledger-soft)]">
                                          참여자
                                        </span>
                                        {getDisplayedParticipants(entry).map((p) => (
                                          <span
                                            key={p}
                                            className={`afterroll-meta rounded-full border px-[0.5rem] py-[0.1rem] text-[0.72rem] ${
                                              entry.type === 'PL' && entry.gmParticipant === p
                                                ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] text-[var(--ledger-accent)]'
                                                : 'border-[rgba(200,121,147,0.2)] bg-[rgba(232,169,186,0.12)] text-[var(--ledger-soft)]'
                                            }`}
                                          >
                                            {p}{entry.type === 'PL' && entry.gmParticipant === p ? ' · GM' : ''}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    </div>
                                  </>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </>
        )
      ) : (
        <PlaysStats plays={plays} titleDatesMap={titleDatesMap} titleSessionsMap={titleSessionsMap} />
      )}

      {/* 컬럼 필터 드롭다운 (portal) */}
      {typeof document !== 'undefined' &&
        openColumn &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[998]" onPointerDown={closeFilter} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                zIndex: 999,
              }}
            >
              {renderDropdown()}
            </motion.div>
          </>,
          document.body,
        )}

      <AnimatePresence>
        {composerOpen && (
          <PlaysComposer
            editTarget={editTarget}
            options={options}
            calendarTitles={calendarTitles}
            titleDatesMap={titleDatesMap}
            participantPlayCounts={participantPlayCounts}
            onClose={closeComposer}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedCharacter && <CharacterPreviewModal character={selectedCharacter} onClose={() => setSelectedCharacter(null)} />}
      </AnimatePresence>
    </div>
  );
}
