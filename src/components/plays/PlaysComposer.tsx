'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addPlay,
  updatePlay,
  updatePlaysOptions,
  type PlayEntry,
  type PlaysOptions,
  type PlayStatus,
  type PlayType,
} from '@/lib/data/firebasePlays';
import { reconcilePlayDates } from '@/lib/playDates';

type TitleDates = { startDate: string; endDate: string | null };

interface Props {
  editTarget: PlayEntry | null;
  options: PlaysOptions;
  calendarTitles: string[];
  titleDatesMap: Map<string, TitleDates>;
  participantPlayCounts: Map<string, number>;
  onClose: () => void;
}

function formatDate(d: string) {
  return d.replace(/-/g, '.');
}

function TitleField({
  value,
  calendarTitles,
  titleDatesMap,
  onChange,
}: {
  value: string;
  calendarTitles: string[];
  titleDatesMap: Map<string, TitleDates>;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value
    ? calendarTitles.filter((t) => t.toLowerCase().includes(value.toLowerCase()))
    : calendarTitles;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div ref={ref}>
      <label className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
        제목
      </label>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="캘린더에서 선택하거나 직접 입력..."
          className="w-full afterroll-meta rounded-[0.5rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] px-[0.8rem] py-[0.5rem] text-[0.9rem] text-[var(--ledger-ink)] outline-none transition-colors placeholder:text-[var(--ledger-muted)] focus:border-[var(--ledger-accent)]"
        />
        <AnimatePresence>
          {open && filtered.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full z-50 mt-[0.2rem] max-h-[13rem] overflow-y-auto rounded-[0.6rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] shadow-none"
            >
              {filtered.map((t) => {
                const dates = titleDatesMap.get(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between border-b border-[rgba(200,121,147,0.12)] px-[0.9rem] py-[0.5rem] text-left transition-colors last:border-0 hover:bg-[rgba(232,169,186,0.18)]"
                  >
                    <span className="afterroll-meta text-[0.85rem] text-[var(--ledger-ink)]">{t}</span>
                    {dates && (
                      <span className="afterroll-meta ml-[0.5rem] shrink-0 text-[0.7rem] text-[var(--ledger-muted)]">
                        {formatDate(dates.startDate)}
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SelectWithAdd({
  label,
  value,
  options,
  onSelect,
  onAddOption,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  onAddOption: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');

  function commitNew() {
    const v = newVal.trim();
    if (v) {
      onAddOption(v);
      onSelect(v);
    }
    setNewVal('');
    setAdding(false);
  }

  return (
    <div>
      <label className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
        {label}
      </label>
      <div className="flex flex-wrap gap-[0.35rem]">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(value === opt ? '' : opt)}
            className={`rounded-full border px-[0.7rem] py-[0.28rem] text-[0.8rem] transition-all ${
              value === opt
                ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] text-[var(--ledger-accent)]'
                : 'border-[rgba(200,121,147,0.22)] text-[var(--ledger-muted)] hover:border-[rgba(200,121,147,0.42)] hover:text-[var(--ledger-ink)]'
            }`}
          >
            {opt}
          </button>
        ))}
        {adding ? (
          <div className="flex items-center gap-[0.3rem]">
            <input
              autoFocus
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitNew();
                }
                if (e.key === 'Escape') {
                  setNewVal('');
                  setAdding(false);
                }
              }}
              className="w-[5.5rem] rounded-full border border-[var(--ledger-accent)] bg-transparent px-[0.6rem] py-[0.26rem] text-[0.8rem] text-[var(--ledger-ink)] outline-none"
            />
            <button type="button" onClick={commitNew} className="text-[0.75rem] text-[var(--ledger-accent)] hover:opacity-70">
              추가
            </button>
            <button type="button" onClick={() => { setNewVal(''); setAdding(false); }} className="text-[0.75rem] text-[var(--ledger-muted)]">
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-[rgba(200,121,147,0.26)] px-[0.7rem] py-[0.28rem] text-[0.8rem] text-[var(--ledger-muted)] transition-all hover:border-[rgba(200,121,147,0.45)] hover:text-[var(--ledger-ink)]"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

function ParticipantsSearchField({
  selected,
  options,
  playCounts,
  onToggle,
  onAddOption,
}: {
  selected: string[];
  options: string[];
  playCounts: Map<string, number>;
  onToggle: (p: string) => void;
  onAddOption: (p: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const optionLookup = useMemo(
    () => new Map(options.map((p) => [p.toLowerCase(), p])),
    [options],
  );
  const exactOption = normalizedQuery ? optionLookup.get(normalizedQuery) : undefined;
  const canAdd = query.trim().length > 0 && !exactOption;
  const filtered = useMemo(() => {
    if (!normalizedQuery) return [];
    return options
      .filter((p) => p.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const countDiff = (playCounts.get(b) ?? 0) - (playCounts.get(a) ?? 0);
        if (countDiff !== 0) return countDiff;
        return a.localeCompare(b, 'ko');
      })
      .slice(0, 8);
  }, [normalizedQuery, options, playCounts]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function selectParticipant(p: string) {
    onToggle(p);
    setQuery('');
    setOpen(false);
  }

  function addParticipantFromQuery() {
    const v = query.trim();
    if (v) {
      onAddOption(v);
      onToggle(v);
    }
    setQuery('');
    setOpen(false);
  }

  function commitQuery() {
    if (exactOption) {
      selectParticipant(exactOption);
      return;
    }
    addParticipantFromQuery();
  }

  return (
    <div ref={ref}>
      <label className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
        참여자
      </label>
      {selected.length > 0 && (
        <div className="mb-[0.45rem] flex flex-wrap gap-[0.35rem]">
          {selected.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onToggle(p)}
              className="rounded-full border border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] px-[0.65rem] py-[0.25rem] text-[0.78rem] text-[var(--ledger-accent)] transition-all hover:bg-[rgba(232,169,186,0.3)]"
            >
              {p}
              <span className="ml-[0.35rem] text-[0.68rem] opacity-70">
                {playCounts.get(p) ?? 0}회
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitQuery();
            }
            if (e.key === 'Escape') {
              setQuery('');
              setOpen(false);
            }
          }}
          placeholder="참여자 검색 또는 추가..."
          className="w-full afterroll-meta rounded-[0.5rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] px-[0.8rem] py-[0.5rem] text-[0.9rem] text-[var(--ledger-ink)] outline-none transition-colors placeholder:text-[var(--ledger-muted)] focus:border-[var(--ledger-accent)]"
        />
        <AnimatePresence>
          {open && normalizedQuery && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full z-50 mt-[0.2rem] max-h-[13rem] overflow-y-auto rounded-[0.6rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] shadow-none"
            >
              {filtered.map((p) => (
                <button
                  key={p}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectParticipant(p)}
                  className={`flex w-full items-center justify-between border-b border-[rgba(200,121,147,0.12)] px-[0.9rem] py-[0.5rem] text-left transition-colors last:border-0 hover:bg-[rgba(232,169,186,0.18)] ${
                    selected.includes(p) ? 'text-[var(--ledger-accent)]' : 'text-[var(--ledger-ink)]'
                  }`}
                >
                  <span className="afterroll-meta text-[0.85rem]">{p}</span>
                  <span className="afterroll-meta ml-[0.5rem] shrink-0 text-[0.7rem] text-[var(--ledger-muted)]">
                    같이 {playCounts.get(p) ?? 0}회
                  </span>
                </button>
              ))}
              {canAdd && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addParticipantFromQuery}
                  className="flex w-full items-center justify-between px-[0.9rem] py-[0.5rem] text-left transition-colors hover:bg-[rgba(232,169,186,0.18)]"
                >
                  <span className="afterroll-meta text-[0.85rem] text-[var(--ledger-ink)]">
                    {query.trim()}
                  </span>
                  <span className="afterroll-meta ml-[0.5rem] shrink-0 text-[0.7rem] text-[var(--ledger-accent)]">
                    새로 추가
                  </span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const STATUS_OPTIONS: { value: PlayStatus; label: string }[] = [
  { value: 'scheduled', label: '예정' },
  { value: 'ongoing', label: '진행' },
  { value: 'completed', label: '완주' },
  { value: 'dropped', label: '하차' },
];

export default function PlaysComposer({
  editTarget,
  options,
  calendarTitles,
  titleDatesMap,
  participantPlayCounts,
  onClose,
}: Props) {
  const [title, setTitle] = useState(editTarget?.title ?? '');
  const [rule, setRule] = useState(editTarget?.rule ?? '');
  const [note, setNote] = useState(editTarget?.note ?? '');
  const [playerCount, setPlayerCount] = useState(editTarget?.playerCount ?? '');
  const [type, setType] = useState<PlayType>(editTarget?.type ?? 'PL');
  const [participants, setParticipants] = useState<string[]>(editTarget?.participants ?? []);
  const [gmParticipant, setGmParticipant] = useState(editTarget?.gmParticipant ?? '');
  const [status, setStatus] = useState<PlayStatus>(editTarget?.status ?? 'ongoing');
  const [startDate, setStartDate] = useState(editTarget?.startDate ?? '');
  const [endDate, setEndDate] = useState(editTarget?.endDate ?? '');
  const [saving, setSaving] = useState(false);
  const [localOptions, setLocalOptions] = useState<PlaysOptions>(options);
  const displayedParticipants = useMemo(() => {
    if (type !== 'PL' || !gmParticipant || !participants.includes(gmParticipant)) return participants;
    return [gmParticipant, ...participants.filter((participant) => participant !== gmParticipant)];
  }, [gmParticipant, participants, type]);

  function handleTitleChange(v: string) {
    setTitle(v);
    const dates = titleDatesMap.get(v);
    if (dates) {
      setStartDate(dates.startDate);
      setEndDate(dates.endDate ?? '');
    }
  }

  function addRule(r: string) {
    if (localOptions.rules.includes(r)) return;
    const next = { ...localOptions, rules: [...localOptions.rules, r] };
    setLocalOptions(next);
    void updatePlaysOptions(next);
  }

  function addPlayerCount(c: string) {
    if (localOptions.playerCounts.includes(c)) return;
    const next = { ...localOptions, playerCounts: [...localOptions.playerCounts, c] };
    setLocalOptions(next);
    void updatePlaysOptions(next);
  }

  function addParticipant(p: string) {
    if (localOptions.participants.includes(p)) return;
    const next = { ...localOptions, participants: [...localOptions.participants, p] };
    setLocalOptions(next);
    void updatePlaysOptions(next);
  }

  function toggleParticipant(p: string) {
    setParticipants((prev) => {
      const isSelected = prev.includes(p);
      if (isSelected && gmParticipant === p) setGmParticipant('');
      return isSelected ? prev.filter((x) => x !== p) : [...prev, p];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const data = reconcilePlayDates({
        title: title.trim(),
        rule,
        note: note.trim(),
        playerCount,
        type,
        participants,
        gmParticipant: type === 'PL' ? gmParticipant : '',
        status,
        startDate,
        endDate: endDate || null,
      }, titleDatesMap.get(title.trim()));
      if (editTarget) {
        await updatePlay(editTarget.id, data);
      } else {
        await addPlay(data);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-[1rem]"
      style={{ background: 'rgba(76,51,61,0.28)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18 }}
        className="ledger-paper-sheet paper-memo max-h-[90vh] w-full max-w-[28rem] overflow-y-auto rounded-[1.2rem] px-[1.5rem] py-[1.4rem]"
      >
        <div className="mb-[1.2rem] flex items-center justify-between">
          <h2 className="afterroll-title text-[1.3rem] text-[var(--ledger-ink)]">
            {editTarget ? '플레이 편집' : '새 플레이'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="afterroll-meta text-[0.8rem] text-[var(--ledger-muted)] transition-colors hover:text-[var(--ledger-ink)]"
          >
            닫기
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[1rem]">
          <TitleField
            value={title}
            calendarTitles={calendarTitles}
            titleDatesMap={titleDatesMap}
            onChange={handleTitleChange}
          />

          <div>
            <label className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
              기간
            </label>
            <div className="flex items-center gap-[0.5rem]">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 afterroll-meta rounded-[0.5rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] px-[0.7rem] py-[0.45rem] text-[0.85rem] text-[var(--ledger-ink)] outline-none focus:border-[var(--ledger-accent)]"
              />
              <span className="afterroll-meta text-[0.78rem] text-[var(--ledger-muted)]">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 afterroll-meta rounded-[0.5rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] px-[0.7rem] py-[0.45rem] text-[0.85rem] text-[var(--ledger-ink)] outline-none focus:border-[var(--ledger-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
              유형
            </label>
            <div className="flex gap-[0.35rem]">
              {(['PL', 'GM'] as PlayType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    if (t === 'GM') setGmParticipant('');
                  }}
                  className={`rounded-full border px-[1rem] py-[0.28rem] text-[0.85rem] font-medium transition-all ${
                    type === t
                      ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] text-[var(--ledger-accent)]'
                      : 'border-[rgba(200,121,147,0.22)] text-[var(--ledger-muted)] hover:border-[rgba(200,121,147,0.42)] hover:text-[var(--ledger-ink)]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <SelectWithAdd
            label="룰"
            value={rule}
            options={localOptions.rules}
            onSelect={setRule}
            onAddOption={addRule}
          />

          <div>
            <label
              htmlFor="play-note"
              className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]"
            >
              비고
            </label>
            <input
              id="play-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="메모를 입력하세요"
              className="w-full afterroll-meta rounded-[0.5rem] border border-[rgba(200,121,147,0.24)] bg-[#fff8fa] px-[0.7rem] py-[0.45rem] text-[0.85rem] text-[var(--ledger-ink)] outline-none placeholder:text-[var(--ledger-muted)] focus:border-[var(--ledger-accent)]"
            />
          </div>

          <SelectWithAdd
            label="인원"
            value={playerCount}
            options={localOptions.playerCounts}
            onSelect={setPlayerCount}
            onAddOption={addPlayerCount}
          />

          <ParticipantsSearchField
            selected={displayedParticipants}
            options={localOptions.participants}
            playCounts={participantPlayCounts}
            onToggle={toggleParticipant}
            onAddOption={addParticipant}
          />

          {type === 'PL' && participants.length > 0 && (
            <div>
              <label className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
                GM
              </label>
              <div className="flex flex-wrap gap-[0.35rem]">
                {displayedParticipants.map((participant) => (
                  <button
                    key={participant}
                    type="button"
                    aria-pressed={gmParticipant === participant}
                    onClick={() => setGmParticipant((current) => (current === participant ? '' : participant))}
                    className={`rounded-full border px-[0.7rem] py-[0.28rem] text-[0.8rem] transition-all ${
                      gmParticipant === participant
                        ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] text-[var(--ledger-accent)]'
                        : 'border-[rgba(200,121,147,0.22)] text-[var(--ledger-muted)] hover:border-[rgba(200,121,147,0.42)] hover:text-[var(--ledger-ink)]'
                    }`}
                  >
                    {participant}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="afterroll-meta mb-[0.4rem] block text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
              상태
            </label>
            <div className="flex gap-[0.35rem]">
              {STATUS_OPTIONS.map(({ value: v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStatus(v)}
                  className={`rounded-full border px-[0.8rem] py-[0.28rem] text-[0.82rem] transition-all ${
                    status === v
                      ? 'border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.22)] text-[var(--ledger-accent)]'
                      : 'border-[rgba(200,121,147,0.22)] text-[var(--ledger-muted)] hover:border-[rgba(200,121,147,0.42)] hover:text-[var(--ledger-ink)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-[0.5rem] border-t border-[rgba(200,121,147,0.18)] pt-[0.8rem]">
            <button
              type="button"
              onClick={onClose}
              className="afterroll-meta px-[0.9rem] py-[0.38rem] text-[0.82rem] text-[var(--ledger-muted)] transition-colors hover:text-[var(--ledger-ink)]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="afterroll-meta rounded-[0.5rem] border border-[var(--ledger-accent)] bg-[rgba(232,169,186,0.18)] px-[1.1rem] py-[0.38rem] text-[0.82rem] text-[var(--ledger-accent)] shadow-none transition-all hover:bg-[rgba(232,169,186,0.28)] disabled:opacity-40"
            >
              {saving ? '저장 중...' : editTarget ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
