'use client';

import Image from '@/components/ArchiveImage';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import type { Character, CharacterLink } from '@/lib/data/characters';
import type { SessionLogLink } from './CharactersSection';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToPrivateCharacterLinks } from '@/lib/data/firebasePrivateCharacterLinks';
import { subscribeToPlays, type PlayEntry } from '@/lib/data/firebasePlays';
import { getShinobigamiMark } from '@/lib/shinobigamiMarks';
import CharacterUploadButton from './CharacterUploadButton';
import CharacterManagementActions from './CharacterManagementActions';

const TRANSITION_DURATION = 0.55;
const PORTRAIT_SPRING_STIFFNESS = 115;
const PORTRAIT_SPRING_DAMPING = 19;
const PORTRAIT_SPRING_MASS = 0.9;
const INTRO_STAGGER = 0.14;
const FACT_REVEAL_DELAY = 0.24;
const FACT_REVEAL_STAGGER = 0.07;
const ROSTER_REVEAL_STAGGER = 0.045;
const ROSTER_SELECTION_DELAY_MS = 280;
const PARALLAX_ANGLE = 1.6;
const PARALLAX_SPRING_STIFFNESS = 110;
const PARALLAX_SPRING_DAMPING = 24;
const COLOR_WASH_CENTER_ALPHA = 0.52;
const COLOR_WASH_EDGE_ALPHA = 0.18;
const COLOR_ACCENT_ALPHA = 0.68;
const STICKER_ENTER_DELAY = 0.18;
const STICKER_STAGGER = 0.09;
const MARK_ROTATION_MIN = -16;
const MARK_ROTATION_VARIANTS = 33;
const STICKER_POSITIONS = [
  { x: 0.04, y: 0.2, rotate: -9 },
  { x: 0.96, y: 0.38, rotate: 8 },
  { x: 0.78, y: 0.94, rotate: -6 },
  { x: 0.08, y: 0.78, rotate: 7 },
  { x: 0.94, y: 0.12, rotate: -8 },
] as const;
const SESSION_STATUS: Record<PlayEntry['status'], string> = {
  scheduled: '예정', ongoing: '진행', completed: '완주', dropped: '하차',
};

function markRotation(characterId: string) {
  const hash = [...characterId].reduce((value, letter) => value + letter.charCodeAt(0), 0);
  return MARK_ROTATION_MIN + hash % MARK_ROTATION_VARIANTS;
}

function characterWash(color: string | undefined, alpha: number) {
  if (!color || !/^#[\da-f]{6}$/i.test(color)) return `rgba(200, 121, 147, ${alpha})`;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function sessionHref(session: PlayEntry, links: SessionLogLink[]) {
  const byId = links.find((link) => link.playId === session.id);
  if (byId) return byId.href;
  const dates = [session.startDate, session.endDate];
  return links.find((link) =>
    link.sessionTitle.trim().toLocaleLowerCase('ko-KR') === session.title.trim().toLocaleLowerCase('ko-KR')
    && dates.includes(link.date),
  )?.href;
}

function CharacterLinks({ character, privateLinks }: { character: Character; privateLinks: CharacterLink[] }) {
  const publicLinks = [
    ...(character.linkItems ?? []),
    ...(character.links.characterSheet ? [{ name: '캐릭터 시트', url: character.links.characterSheet }] : []),
    ...(character.links.commission ? [{ name: '커미션', url: character.links.commission }] : []),
  ];
  return <>
    {publicLinks.length > 0 && <div className="flex flex-wrap gap-[0.5rem]">{publicLinks.map((link) => <a key={`${link.name}-${link.url}`} className="pc-link" href={link.url} target="_blank" rel="noreferrer">{link.name} ↗</a>)}</div>}
    {privateLinks.length > 0 && <section className="border-t border-[var(--atr-line)] pt-[1rem]"><p className="pc-field-label">비공개 링크</p><div className="flex flex-wrap gap-[0.5rem]">{privateLinks.map((link) => <a key={`${link.name}-${link.url}`} className="pc-link" href={link.url} target="_blank" rel="noreferrer">{link.name} ↗</a>)}</div></section>}
  </>;
}

function CharacterPortrait({ character, reducedMotion }: { character: Character; reducedMotion: boolean | null }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const imageRatio = imageSize.width / imageSize.height;
  const displayedWidth = Math.min(frameSize.width, frameSize.height * imageRatio);
  const displayedHeight = displayedWidth / imageRatio;
  const imageBounds = Number.isFinite(displayedWidth) && Number.isFinite(displayedHeight) && displayedHeight > 0
    ? { left: (frameSize.width - displayedWidth) / 2, top: frameSize.height - displayedHeight, width: displayedWidth, height: displayedHeight }
    : null;

  return <div ref={frameRef} className="relative size-full">
    <Image src={character.portrait.original} alt={`${character.name} 전신 이미지`} fill priority sizes="(max-width: 48rem) 100vw, 50vw" className="object-contain object-bottom drop-shadow-[0_1rem_1.5rem_rgba(91,48,64,0.2)]" onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
    {imageBounds && character.stickers && character.stickers.length > 0 && <div className="pointer-events-none absolute" style={imageBounds} aria-hidden="true">{character.stickers.map((sticker, index) => {
      const position = STICKER_POSITIONS[index % STICKER_POSITIONS.length];
      return <motion.div key={`${sticker.src}-${index}`} className="absolute size-[clamp(2.6rem,7vw,4.6rem)]" style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, translate: '-50% -50%' }} initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.7, rotate: position.rotate }} animate={{ opacity: 1, scale: sticker.size ?? 1, rotate: position.rotate }} transition={{ duration: reducedMotion ? 0 : 0.36, delay: reducedMotion ? 0 : STICKER_ENTER_DELAY + index * STICKER_STAGGER }}><Image src={sticker.src} alt="" fill sizes="4.6rem" className="object-contain drop-shadow-[0_0.25rem_0.35rem_rgba(91,48,64,0.24)]" /></motion.div>;
    })}</div>}
  </div>;
}

function CharacterInformation({ character, sessions, sessionLogLinks, reducedMotion }: { character: Character; sessions: PlayEntry[]; sessionLogLinks: SessionLogLink[]; reducedMotion: boolean | null }) {
  const { isAdmin } = useAuth();
  const [privateLinks, setPrivateLinks] = useState<CharacterLink[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    return subscribeToPrivateCharacterLinks(character.id, setPrivateLinks);
  }, [character.id, isAdmin]);

  const facts = [
    ['룰', character.rule], ['나이', character.age], ['성별', character.gender],
    ['종족', character.species], ['키 / 몸무게', character.heightWeight], ['직업', character.occupation],
    ['컬러', character.color ?? character.insane?.color],
  ].filter((item): item is string[] => Boolean(item[1]));
  const shinobigami = character.shinobigami;

  return <div className="space-y-[1.35rem]">
    {facts.length > 0 && <dl className="grid grid-cols-2 gap-x-[1rem] gap-y-[0.95rem] sm:grid-cols-3">{facts.map(([label, value], index) => <motion.div key={label} className="border-t border-[var(--atr-line)] pt-[0.45rem]" initial={{ opacity: 0, y: reducedMotion ? 0 : '0.65rem' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.35, delay: reducedMotion ? 0 : FACT_REVEAL_DELAY + index * FACT_REVEAL_STAGGER }}><dt className="pc-field-label">{label}</dt><dd className="text-sm leading-relaxed text-[var(--atr-text)]">{label === '컬러' && /^#[\da-f]{6}$/i.test(value) ? <span className="inline-flex items-center gap-[0.45rem]"><span className="size-[0.85rem] rounded-full border border-[var(--atr-line)]" style={{ backgroundColor: value }} aria-hidden="true" />{value}</span> : value}</dd></motion.div>)}</dl>}
    {character.coc && character.coc.characteristics.length > 0 && <section className="border-t border-[var(--atr-line)] pt-[1rem]"><h3 className="pc-field-label">특성치</h3><dl className="grid grid-cols-3 gap-[0.6rem] sm:grid-cols-4">{character.coc.characteristics.map((stat) => <div key={stat.label} className="rounded-[0.45rem] bg-white/45 p-[0.55rem]"><dt className="text-xs text-[var(--atr-soft)]">{stat.label}</dt><dd className="text-base text-[var(--atr-text)]">{stat.value}</dd></div>)}</dl></section>}
    {shinobigami && <section className="space-y-[0.55rem] border-t border-[var(--atr-line)] pt-[1rem]"><h3 className="pc-field-label">시노비가미</h3>{shinobigami.rank && <p className="text-sm">계급 · {shinobigami.rank}</p>}{(shinobigami.faction || shinobigami.subfaction) && <p className="text-sm">유파 · {[shinobigami.faction, shinobigami.subfaction].filter(Boolean).join(' / ')}</p>}{shinobigami.setting && <p className="whitespace-pre-wrap text-sm leading-relaxed">{shinobigami.setting}</p>}{shinobigami.secretArt && <p className="text-sm">오의 · {shinobigami.secretArt.name} / {shinobigami.secretArt.type}</p>}{shinobigami.ninpo.length > 0 && <p className="text-sm leading-relaxed">인법 · {shinobigami.ninpo.join(' · ')}</p>}</section>}
    {character.insane && character.insane.abilities.length > 0 && <section className="border-t border-[var(--atr-line)] pt-[1rem]"><h3 className="pc-field-label">어빌리티</h3><p className="text-sm leading-relaxed">{character.insane.abilities.join(' · ')}</p></section>}
    {character.personality && <section className="border-t border-[var(--atr-line)] pt-[1rem]"><h3 className="pc-field-label">설정과 성격</h3><p className="whitespace-pre-wrap text-sm leading-[1.8] text-[var(--atr-muted)]">{character.personality}</p></section>}
    <CharacterLinks character={character} privateLinks={isAdmin ? privateLinks : []} />
    <section className="border-t border-[var(--atr-line)] pt-[1rem]"><h3 className="pc-field-label">연결된 세션</h3>{sessions.length > 0 ? <ul className="space-y-[0.4rem]">{sessions.map((session) => { const href = sessionHref(session, sessionLogLinks); return <li key={session.id} className="text-sm text-[var(--atr-muted)]">{href ? <Link href={href} className="underline decoration-[var(--atr-accent)] underline-offset-[0.2rem] hover:text-[var(--atr-accent)]">{session.title}</Link> : session.title}<span className="ml-[0.5rem] text-xs text-[var(--atr-soft)]">{SESSION_STATUS[session.status]}</span></li>; })}</ul> : <p className="text-sm text-[var(--atr-soft)]">연결된 세션이 없습니다.</p>}</section>
  </div>;
}

export default function CharacterShowcase({ characters, sessionLogLinks = [] }: { characters: Character[]; sessionLogLinks?: SessionLogLink[] }) {
  const { isAdmin } = useAuth();
  const [characterList, setCharacterList] = useState(characters);
  const [activeId, setActiveId] = useState<string | null>(characters.length === 1 ? characters[0].id : null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [plays, setPlays] = useState<PlayEntry[]>([]);
  const [hasScrolled, setHasScrolled] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const selectionTimerRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: PARALLAX_SPRING_STIFFNESS, damping: PARALLAX_SPRING_DAMPING });
  const smoothY = useSpring(pointerY, { stiffness: PARALLAX_SPRING_STIFFNESS, damping: PARALLAX_SPRING_DAMPING });
  const tiltX = useTransform(smoothY, [-0.5, 0.5], [PARALLAX_ANGLE, -PARALLAX_ANGLE]);
  const tiltY = useTransform(smoothX, [-0.5, 0.5], [-PARALLAX_ANGLE, PARALLAX_ANGLE]);

  useEffect(() => {
    if (characters.length <= 1) return;
    const frame = requestAnimationFrame(() => setActiveId(characters[Math.floor(Math.random() * characters.length)].id));
    return () => cancelAnimationFrame(frame);
  }, [characters]);
  useEffect(() => subscribeToPlays(setPlays), []);
  useEffect(() => {
    const scroller = stageRef.current?.closest('.atr-file-content');
    const onScroll = () => setHasScrolled((scroller?.scrollTop ?? 0) > 0 || window.scrollY > 0);
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { scroller?.removeEventListener('scroll', onScroll); window.removeEventListener('scroll', onScroll); };
  }, []);
  useEffect(() => () => { if (selectionTimerRef.current !== null) window.clearTimeout(selectionTimerRef.current); }, []);

  const sortedCharacters = useMemo(
    () => [...characterList].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [characterList],
  );
  const active = activeId === null
    ? undefined
    : sortedCharacters.find((character) => character.id === activeId) ?? sortedCharacters[0];
  const shinobigamiMark = active
    ? getShinobigamiMark(active.shinobigami?.subfaction) ?? getShinobigamiMark(active.shinobigami?.faction)
    : undefined;
  const characterColor = active?.color ?? active?.insane?.color;
  const playById = new Map(plays.map((play) => [play.id, play]));
  const sessions = active?.sessionKeys.flatMap((key) => { const play = playById.get(key); return play ? [play] : []; }) ?? [];
  const resetPortraitTilt = () => { pointerX.set(0); pointerY.set(0); };
  const selectCharacter = (id: string) => {
    setActiveId(id);
    resetPortraitTilt();
    if (selectionTimerRef.current !== null) window.clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = window.setTimeout(() => {
      stageRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
      selectionTimerRef.current = null;
    }, reducedMotion ? 0 : ROSTER_SELECTION_DELAY_MS);
  };
  const updateCharacter = (updated: Character) => setCharacterList((current) => current.map((character) => character.id === updated.id ? updated : character));
  const deleteCharacter = () => setCharacterList((current) => current.filter((character) => character.id !== active?.id));

  return <section className="pc-showcase min-h-full" aria-busy={characterList.length > 0 && !active}>
    <div className="pc-showcase-top mx-auto flex max-w-[84rem] items-center justify-between gap-[1rem] px-[1.2rem] py-[1rem] md:px-[2.5rem]"><div><p className="text-xs uppercase tracking-[0.24em] text-[var(--atr-soft)]">Character Archive</p><h1 className="afterroll-title mt-[0.25rem] text-2xl text-[var(--atr-text)]">캐릭터 목록</h1></div><CharacterUploadButton /></div>
    {active ? <>
      <section ref={stageRef} className="pc-showcase-stage relative mx-auto grid min-h-[calc(100vh-7rem)] max-w-[84rem] items-center gap-[1rem] overflow-hidden rounded-[0.8rem] border border-[var(--atr-line)] bg-[linear-gradient(125deg,#fdfcf9_0%,#f7f6f3_55%,#f2f0ed_100%)] px-[1.2rem] pb-[4rem] pt-[4.5rem] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-0 md:px-[3rem] md:pb-[3rem] md:pt-[3rem]">
        <div className="pointer-events-none absolute left-[1.2rem] top-[1.1rem] z-[3] flex items-center gap-[0.7rem] text-xs uppercase tracking-[0.2em] text-[var(--atr-muted)] md:left-[3rem] md:top-[2rem]" aria-hidden="true"><span className="inline-block size-[0.45rem] rounded-full" style={{ backgroundColor: characterWash(characterColor, COLOR_ACCENT_ALPHA) }} />Character Select <span className="text-[var(--atr-soft)]">/ After the Roll</span></div>
        <div className="pointer-events-none absolute inset-x-[1.2rem] top-[3.15rem] h-[0.06rem] bg-[var(--atr-line)] md:inset-x-[3rem] md:top-[4rem]" aria-hidden="true" />
        <AnimatePresence mode="sync"><motion.div key={`wash-${active.id}`} className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse 72% 86% at 76% 43%, ${characterWash(characterColor, COLOR_WASH_CENTER_ALPHA)} 0%, ${characterWash(characterColor, COLOR_WASH_EDGE_ALPHA)} 48%, transparent 78%)` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.7 }} aria-hidden="true" /></AnimatePresence>
        <motion.div key={`orbit-${active.id}`} className="pointer-events-none absolute right-[-12%] top-[7%] size-[min(80vw,56rem)] rounded-full border" style={{ borderColor: characterWash(characterColor, 0.38) }} initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reducedMotion ? 0 : 0.9 }} aria-hidden="true" />
        <AnimatePresence mode="wait"><motion.div key={`number-${active.id}`} className="pointer-events-none absolute bottom-[7%] right-[3%] text-[clamp(8rem,26vw,27rem)] font-light leading-none tracking-[-0.09em]" style={{ color: characterWash(characterColor, 0.18) }} initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.35 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.9 }} transition={{ duration: reducedMotion ? 0 : TRANSITION_DURATION }} aria-hidden="true">{String(sortedCharacters.indexOf(active) + 1).padStart(2, '0')}</motion.div></AnimatePresence>
        <div className="relative order-1 mx-auto w-full max-w-[42rem] md:order-2 md:self-end">
          <AnimatePresence mode="wait"><motion.div key={active.id} className="relative h-[54vh] min-h-[22rem] w-full md:h-[78vh]" style={{ perspective: '80rem' }} initial={{ opacity: 0, x: reducedMotion ? 0 : '4rem', y: reducedMotion ? 0 : '1.5rem', scale: reducedMotion ? 1 : 0.84, rotate: reducedMotion ? 0 : 3 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : '-3rem', scale: reducedMotion ? 1 : 1.06, rotate: reducedMotion ? 0 : -2, transition: { duration: reducedMotion ? 0 : 0.25 } }} transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: PORTRAIT_SPRING_STIFFNESS, damping: PORTRAIT_SPRING_DAMPING, mass: PORTRAIT_SPRING_MASS }}>
            <motion.div className="pointer-events-none absolute inset-[12%] rounded-full blur-[2.5rem]" style={{ backgroundColor: characterWash(characterColor, 0.26) }} initial={{ opacity: 0, scale: 0.55 }} animate={{ opacity: reducedMotion ? 0.35 : [0, 0.8, 0.35], scale: 1 }} transition={{ duration: reducedMotion ? 0 : 0.9 }} aria-hidden="true" />
            <motion.button type="button" onClick={() => setOriginalUrl(active.portrait.original)} onPointerMove={(event) => { if (reducedMotion || event.pointerType === 'touch') return; const bounds = event.currentTarget.getBoundingClientRect(); pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5); pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5); }} onPointerLeave={resetPortraitTilt} onPointerCancel={resetPortraitTilt} onBlur={resetPortraitTilt} style={{ rotateX: reducedMotion ? 0 : tiltX, rotateY: reducedMotion ? 0 : tiltY }} className="relative block size-full cursor-zoom-in rounded-[0.5rem] focus-visible:outline-[0.15rem] focus-visible:outline-offset-[0.25rem] focus-visible:outline-[var(--atr-accent)]" aria-label={`${active.name} 원본 이미지 보기`}><CharacterPortrait character={active} reducedMotion={reducedMotion} /></motion.button>
            {!reducedMotion && <motion.div className="pointer-events-none absolute bottom-[14%] left-[8%] right-[8%] h-[0.08rem] origin-left" style={{ background: `linear-gradient(90deg, transparent, ${characterWash(characterColor, 0.6)}, transparent)` }} initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: [0, 1, 0], scaleX: [0, 1, 1] }} transition={{ duration: 0.9, times: [0, 0.55, 1] }} aria-hidden="true" />}
          </motion.div></AnimatePresence>
          {active.copyright?.name && <p className="relative mt-[0.4rem] text-center text-xs text-[var(--atr-soft)]">© {active.copyright.url ? <a href={active.copyright.url} target="_blank" rel="noreferrer" className="underline underline-offset-[0.2rem]">{active.copyright.name}</a> : active.copyright.name}</p>}
        </div>
        <div className="relative z-[2] order-2 w-full max-w-[38rem] md:order-1 md:self-center md:pr-[1.5rem]">
          <AnimatePresence mode="wait"><motion.div key={active.id} initial={{ opacity: 0, y: reducedMotion ? 0 : '1.5rem' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : '-1rem' }} transition={{ duration: reducedMotion ? 0 : TRANSITION_DURATION * 0.8 }}>
            <div className={`relative isolate mb-[1.5rem] overflow-hidden border-b border-[var(--atr-line-strong)] pb-[1.25rem] ${shinobigamiMark ? 'min-h-[10.5rem] md:min-h-[12.5rem]' : ''}`}>
              {shinobigamiMark && <div className="pointer-events-none absolute right-[1rem] top-[1rem] z-0 size-[7.5rem] opacity-[0.12] md:size-[9rem]" style={{ rotate: `${markRotation(active.id)}deg` }} aria-hidden="true"><Image src={shinobigamiMark} alt="" fill sizes="(max-width: 48rem) 7.5rem, 9rem" className="object-contain" /></div>}
              <div className="relative z-[1] flex flex-wrap items-center gap-[0.6rem] text-xs uppercase tracking-[0.18em] text-[var(--atr-soft)]"><span>PROFILE {String(sortedCharacters.indexOf(active) + 1).padStart(2, '0')}</span><span className="h-px w-[2.5rem] bg-[var(--atr-line-strong)]" /><span>{active.rule ?? 'CHARACTER'}</span></div>
              {active.alias && <p className="relative z-[1] mt-[1rem] text-sm tracking-[0.1em] text-[var(--atr-muted)]">{active.alias}</p>}
              <motion.h2 className="afterroll-title relative z-[1] mt-[0.25rem] text-5xl leading-tight text-[var(--atr-text)] md:text-6xl" initial={{ opacity: 0, x: reducedMotion ? 0 : '1.5rem' }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reducedMotion ? 0 : TRANSITION_DURATION, delay: reducedMotion ? 0 : INTRO_STAGGER }}>{active.name}</motion.h2>
              {active.catchphrase && <motion.p className="relative z-[1] mt-[0.8rem] border-l pl-[0.85rem] text-base italic leading-relaxed text-[var(--atr-muted)]" style={{ borderColor: characterWash(characterColor, COLOR_ACCENT_ALPHA) }} initial={{ opacity: 0, y: reducedMotion ? 0 : '0.7rem' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : TRANSITION_DURATION, delay: reducedMotion ? 0 : INTRO_STAGGER * 2 }}>“{active.catchphrase}”</motion.p>}
            </div>
            <div className="relative border-l-[0.15rem] bg-[rgba(255,253,253,0.62)] p-[1rem] backdrop-blur-[0.5rem] md:max-h-[42vh] md:overflow-y-auto md:p-[1.35rem]" style={{ borderColor: characterWash(characterColor, COLOR_ACCENT_ALPHA) }}>
              <p className="mb-[1rem] text-xs uppercase tracking-[0.2em] text-[var(--atr-soft)]">Character Dossier</p>
              <CharacterInformation character={active} sessions={sessions} sessionLogLinks={sessionLogLinks} reducedMotion={reducedMotion} />
            </div>
          </motion.div></AnimatePresence>
        </div>
        <div className="absolute bottom-[1rem] left-[1.2rem] z-[4] md:left-[3rem]"><CharacterManagementActions placement="inline" character={active} onUpdated={updateCharacter} onDeleted={deleteCharacter} /></div>
        <motion.p className={`pointer-events-none absolute bottom-[1rem] left-1/2 -translate-x-1/2 text-xs tracking-[0.18em] text-[var(--atr-soft)] ${isAdmin ? 'hidden sm:block' : ''}`} animate={{ opacity: hasScrolled ? 0 : 1, y: hasScrolled ? '0.5rem' : 0 }} aria-hidden="true">SCROLL TO EXPLORE ↓</motion.p>
      </section>
      <nav className="pc-roster relative border-t border-[var(--atr-line)] bg-[rgba(255,253,253,0.68)] px-[1rem] pb-[3rem] pt-[2.5rem]" aria-label="캐릭터 선택">
        <p className="mb-[1.5rem] text-center text-xs uppercase tracking-[0.24em] text-[var(--atr-soft)]">Choose a character · {sortedCharacters.length}</p>
        <LayoutGroup id="pc-character-roster"><div className="mx-auto flex max-w-[70rem] flex-wrap justify-center gap-[0.8rem] sm:gap-[1.25rem]">{sortedCharacters.map((character, index) => <motion.button key={character.id} type="button" onClick={() => selectCharacter(character.id)} initial={reducedMotion ? false : { opacity: 0, y: '1rem', scale: 0.9 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: reducedMotion ? 0 : 0.35, delay: reducedMotion ? 0 : index * ROSTER_REVEAL_STAGGER }} whileHover={{ y: '-0.4rem', transition: { delay: 0 } }} whileTap={{ scale: 0.94 }} className="group relative flex w-[5.7rem] flex-col items-center gap-[0.45rem] text-center sm:w-[6.8rem]" aria-label={`${character.name} 선택`} aria-pressed={character.id === active.id}>
          <span className="relative block size-[4.8rem] sm:size-[5.5rem]"><span className="relative block size-full overflow-hidden rounded-full border border-[var(--atr-line-strong)] bg-[rgba(232,169,186,0.18)] group-hover:border-[var(--atr-accent)]"><Image src={character.portrait.cropped} alt="" fill sizes="5.5rem" className="object-cover" /></span>{character.id === active.id && <motion.span layoutId="pc-active-icon-ring" className="pointer-events-none absolute -inset-[0.25rem] rounded-full border-[0.15rem]" style={{ borderColor: characterWash(characterColor, COLOR_ACCENT_ALPHA) }} transition={{ type: 'spring', stiffness: PORTRAIT_SPRING_STIFFNESS, damping: PORTRAIT_SPRING_DAMPING }} aria-hidden="true" />}</span>
          <span className={`text-xs leading-snug ${character.id === active.id ? 'text-[var(--atr-text)]' : 'text-[var(--atr-muted)]'}`}>{character.name}</span>
        </motion.button>)}</div></LayoutGroup>
      </nav>
    </> : characterList.length > 0 ? <div className="flex min-h-[92vh] items-center justify-center" role="status"><p className="text-sm tracking-[0.12em] text-[var(--atr-soft)]">캐릭터를 불러오는 중…</p></div> : <p className="py-[8rem] text-center text-sm text-[var(--atr-muted)]">아직 보관된 캐릭터가 없습니다.</p>}
    <AnimatePresence>{originalUrl && <motion.div role="dialog" aria-label="캐릭터 원본 이미지" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-[1rem]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOriginalUrl(null)}><button type="button" className="absolute right-[1.5rem] top-[1.5rem] z-[1] text-sm text-white" onClick={() => setOriginalUrl(null)}>닫기 ×</button><div className="relative h-[85vh] w-[85vw]" onClick={(event) => event.stopPropagation()}><Image src={originalUrl} alt={`${active?.name ?? '캐릭터'} 원본 이미지`} fill sizes="85vw" className="object-contain" /></div></motion.div>}</AnimatePresence>
  </section>;
}
