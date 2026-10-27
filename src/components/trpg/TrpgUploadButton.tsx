'use client';

import { ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToPlays, type PlayEntry } from '@/lib/data/firebasePlays';
import { buildTrpgUploadFiles, commitTrpgUploadAtomically, encryptTrpgLogContent, resolveTrpgUploadTitle, saveTrpgPassword, type TrpgUploadDraft, type TrpgUploadMediaFile } from '@/lib/trpgUpload';
import { expandCcaArchive, isCompressedCcaArchive } from '@/lib/ccaArchive';

const LEGACY_MASTER_KEY_STORAGE_KEY = 'after-the-roll-master-key';
const CALENDAR_ID = '848efa2587af083c615b7c3581e818075a6489d1d0ce70c4ac3ef60880d0fbae%40group.calendar.google.com';
const CALENDAR_TIME_MIN = '2000-01-01T00:00:00+09:00';
const FORMAT_OPTIONS = [
  { value: 'roll20', label: 'Roll20' },
  { value: 'ccfolia', label: '코코포리아' },
  { value: 'cca', label: '코코포리아 (CCA)' },
] as const;

async function copyErrorMessage(message: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
      return true;
    }

    const textArea = document.createElement('textarea');
    textArea.value = message;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textArea);
    return copied;
  } catch {
    return false;
  }
}

type CastSelection = {
  plName: string;
  pcName: string;
  imageIndex: number | null;
};

type CalendarEvent = {
  id?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
};

type CalendarMatch = { eventId: string; title: string; startDate: string; endDate: string };

type PreparedRoll20Source = {
  html: string;
  mediaFiles: TrpgUploadMediaFile[];
  missingAssets: string[];
  mediaUrls: Record<string, string>;
};

const ROLL20_MEDIA_DIRECTORY = 'media';
const ROLL20_CONTENT_SELECTOR = '.content';
const ROLL20_LOCAL_URL_PATTERN = /^(?:\.\/)?[^:/?#]+(?:\/[^?#]+)?(?:[?#].*)?$/;

function fileNameFromUrl(value: string) {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? '';
  const segment = withoutQuery.split('/').at(-1) ?? '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function roll20MediaName(file: File, index: number) {
  const extension = file.name.includes('.') ? `.${file.name.split('.').at(-1)}` : '';
  const baseName = file.name.slice(0, file.name.length - extension.length)
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '') || `asset-${index + 1}`;
  return `${baseName}-${String(index + 1).padStart(3, '0')}${extension.toLowerCase()}`;
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

function createLocalImagePreviews(sources: string[], files: File[]) {
  const filesByName = new Map(files.map((file) => [file.name, file]));
  return Object.fromEntries(sources.flatMap((source) => {
    const file = filesByName.get(fileNameFromUrl(source));
    return file ? [[source, URL.createObjectURL(file)]] : [];
  }));
}

function hasSelectedLocalAsset(source: string, files: File[]) {
  return !ROLL20_LOCAL_URL_PATTERN.test(source) || files.some((file) => file.name === fileNameFromUrl(source));
}

async function prepareRoll20Source(html: string, files: File[]): Promise<PreparedRoll20Source> {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const content = document.querySelector<HTMLElement>(ROLL20_CONTENT_SELECTOR) ?? document.body;
  const assetFiles = files;
  const assetsByName = new Map(assetFiles.map((file) => [file.name, file]));
  const uploadedByFileName = new Map<string, string>();
  const mediaFiles: TrpgUploadMediaFile[] = [];
  const missingAssets = new Set<string>();
  const mediaUrls: Record<string, string> = {};

  const replaceUrl = (value: string) => {
    if (!ROLL20_LOCAL_URL_PATTERN.test(value)) return value;
    const originalName = fileNameFromUrl(value);
    const asset = assetsByName.get(originalName);
    if (!asset) {
      missingAssets.add(originalName);
      return value;
    }
    let uploadedName = uploadedByFileName.get(asset.name);
    if (!uploadedName) {
      uploadedName = roll20MediaName(asset, mediaFiles.length);
      uploadedByFileName.set(asset.name, uploadedName);
      mediaFiles.push({ name: uploadedName, content: '' });
    }
    const mediaUrl = `${ROLL20_MEDIA_DIRECTORY}/${uploadedName}`;
    mediaUrls[value] = mediaUrl;
    return mediaUrl;
  };

  content.querySelectorAll('script, style, link').forEach((node) => node.remove());
  content.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    if (image.getAttribute('src')?.includes('<$!')) image.removeAttribute('src');
  });
  content.querySelectorAll<HTMLElement>('[src], [href]').forEach((element) => {
    for (const attribute of ['src', 'href']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      if (attribute === 'src' && ROLL20_LOCAL_URL_PATTERN.test(value) && !assetsByName.has(fileNameFromUrl(value))) {
        missingAssets.add(fileNameFromUrl(value));
        element.removeAttribute(attribute);
        continue;
      }
      element.setAttribute(attribute, replaceUrl(value));
    }
  });

  for (const element of Array.from(content.querySelectorAll<HTMLElement>('[style*="url("]'))) {
    const style = element.getAttribute('style');
    if (!style) continue;
    element.setAttribute('style', style.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_, quote: string, url: string) => `url(${quote}${replaceUrl(url)}${quote})`));
  }

  await Promise.all(mediaFiles.map(async (mediaFile) => {
    const asset = [...uploadedByFileName.entries()].find(([, uploadedName]) => uploadedName === mediaFile.name)?.[0];
    const file = asset ? assetsByName.get(asset) : undefined;
    if (file) mediaFile.content = await readFileAsBase64(file);
  }));

  return { html: content.innerHTML, mediaFiles, missingAssets: [...missingAssets], mediaUrls };
}

function dateToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()).replaceAll('-', '.');
}

function tagsFromInput(value: string) {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

function calendarEventDate(event: CalendarEvent) {
  const value = event.start?.date ?? event.start?.dateTime;
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0].replaceAll('-', '.') : null;
}

const DATE_OR_RANGE_PATTERN = /^\d{4}\.\d{2}\.\d{2}(\s*~\s*\d{4}\.\d{2}\.\d{2})?$/;

function isValidDateOrRange(value: string) {
  if (!DATE_OR_RANGE_PATTERN.test(value)) return false;
  const dates = value.split('~').map((date) => date.trim());
  const isValidDate = (date: string) => {
    const [year, month, day] = date.split('.').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  };
  return dates.every(isValidDate) && (dates.length === 1 || dates[0] <= dates[1]);
}

function formatDateRange(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}

function groupCalendarMatches(matches: CalendarMatch[]) {
  const sessions = new Map<string, CalendarMatch>();

  for (const match of matches) {
    const sessionKey = normalizeTitle(match.title);
    const existing = sessions.get(sessionKey);
    if (!existing) {
      sessions.set(sessionKey, match);
      continue;
    }

    existing.startDate = existing.startDate < match.startDate ? existing.startDate : match.startDate;
    existing.endDate = existing.endDate > match.endDate ? existing.endDate : match.endDate;
  }

  return [...sessions.values()];
}

function buildLogTags(rule: string, playerCount: string, type: string, format: TrpgUploadDraft['format']) {
  const platform = format === 'roll20' ? 'Roll20' : '코코포리아';
  return [
    ...(rule ? [`룰: ${rule}`] : []),
    ...(playerCount ? [`인원수: ${playerCount}`] : []),
    ...(type ? [`유형: ${type}`] : []),
    `플랫폼: ${platform}`,
  ];
}

function detectUploadFormat(html: string): TrpgUploadDraft['format'] {
  if ((/class=["'][^"']*icecandy-export/.test(html) && /data-skin=["']roll20/.test(html)) || /class=["'][^"']*\bmessage\b/.test(html)) {
    return 'roll20';
  }
  if (isCompressedCcaArchive(html) || /class=["'][^"']*\bcca-wrap\b/.test(html) || /article\.row|dice-result-card/.test(html)) return 'cca';
  return 'ccfolia';
}

function uniqueNames(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(Boolean)));
}

function extractSpeakers(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const icecandySpeakers = Array.from(document.querySelectorAll('[data-entry-id] [class~="float-left"] > span.text-foreground'))
    .map((element) => element.textContent);
  const roll20Speakers = Array.from(document.querySelectorAll('.message .by'))
    .map((element) => element.textContent?.replace(/:\s*$/, ''));
  const ccfoliaSpeakers = Array.from(document.querySelectorAll('body > p[style]'))
    .map((element) => element.querySelectorAll('span')[1]?.textContent);
  const ccaSpeakers = Array.from(document.querySelectorAll('article.row:not(.narrator)'))
    .map((element) => element.querySelector('.copy header b, .dice-result-card b')?.textContent);
  // CCA's compressed export has two row headers in the wild: older archives
  // use <header>, while current archives use the .kh (character heading) div.
  const compressedCcaSpeakers = Array.from(document.querySelectorAll('div.r.row .c > header > b, div.r.row .c > .kh > b'))
    .map((element) => element.textContent);

  return uniqueNames([...icecandySpeakers, ...roll20Speakers, ...ccfoliaSpeakers, ...ccaSpeakers, ...compressedCcaSpeakers]);
}

function extractImageSources(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const imageElements = Array.from(document.querySelectorAll('img[src]')).map((element) => element.getAttribute('src'));
  const backgroundImages = Array.from(html.matchAll(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi)).map((match) => match[1]);
  return Array.from(new Set([...imageElements, ...backgroundImages].filter((source): source is string => Boolean(source))));
}

function toggleCastSelection(current: CastSelection[], pcName: string, selected: boolean) {
  if (!selected) return current.filter((entry) => entry.pcName !== pcName);
  return [...current, { plName: '', pcName, imageIndex: null }];
}

function formatCastDescription(gmName: string, cast: CastSelection[]) {
  const plNames = uniqueNames(cast.map((entry) => entry.plName));
  if (!gmName.trim() && plNames.length === 0) return '';
  return `GM: ${gmName.trim()} · PL: ${plNames.join(', ')}`;
}

export default function TrpgUploadButton() {
  const { isAdmin, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const roll20AssetInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [source, setSource] = useState<{ name: string; html: string } | null>(null);
  const [roll20AssetFiles, setRoll20AssetFiles] = useState<File[]>([]);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [imageSources, setImageSources] = useState<string[]>([]);
  const [localImagePreviews, setLocalImagePreviews] = useState<Record<string, string>>({});
  const [castSelections, setCastSelections] = useState<CastSelection[]>([]);
  const [hoveredImageSource, setHoveredImageSource] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [recommendedDateRange, setRecommendedDateRange] = useState<string | null>(null);
  const [calendarMatches, setCalendarMatches] = useState<CalendarMatch[]>([]);
  const [selectedCalendarMatch, setSelectedCalendarMatch] = useState<CalendarMatch | null>(null);
  const [calendarSearchState, setCalendarSearchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [gmName, setGmName] = useState('');
  const [description, setDescription] = useState('');
  const [isDescriptionManual, setIsDescriptionManual] = useState(false);
  const [date, setDate] = useState(dateToday);
  const [plays, setPlays] = useState<PlayEntry[]>([]);
  const [rule, setRule] = useState('');
  const [playerCount, setPlayerCount] = useState('');
  const [playType, setPlayType] = useState('');
  const [format, setFormat] = useState<TrpgUploadDraft['format']>('roll20');
  const [mainChannels, setMainChannels] = useState('main');
  const [whisperChannels, setWhisperChannels] = useState('');
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const generatedDescriptionRef = useRef('');

  useEffect(() => {
    window.localStorage.removeItem('after-the-roll-github-token');
    window.localStorage.removeItem(LEGACY_MASTER_KEY_STORAGE_KEY);
  }, []);

  useEffect(() => subscribeToPlays(setPlays), []);

  useEffect(() => () => {
    Object.values(localImagePreviews).forEach((url) => URL.revokeObjectURL(url));
  }, [localImagePreviews]);

  useEffect(() => {
    const normalizedTitle = normalizeTitle(title);
    if (!open || !normalizedTitle) {
      setRecommendedDateRange(null);
      setCalendarMatches([]);
      setCalendarSearchState('idle');
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_API_KEY;
    if (!apiKey) {
      setRecommendedDateRange(null);
      setCalendarMatches([]);
      setCalendarSearchState('error');
      return;
    }

    let cancelled = false;
    void (async () => {
      setCalendarSearchState('loading');
      try {
        const params = new URLSearchParams({ key: apiKey, timeMin: CALENDAR_TIME_MIN, timeMax: new Date().toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' });
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?${params}`);
        if (!response.ok) throw new Error('Calendar request failed');
        const data = await response.json() as { items?: CalendarEvent[] };
        const matches: CalendarMatch[] = [];
        for (const event of data.items ?? []) {
          const eventTitle = event.summary?.trim() ?? '';
          const eventDate = calendarEventDate(event);
          if (!event.id || !eventTitle || !eventDate || !normalizeTitle(eventTitle).includes(normalizedTitle)) continue;
          matches.push({ eventId: event.id, title: eventTitle, startDate: eventDate, endDate: eventDate });
        }
        const sortedMatches = groupCalendarMatches(matches)
          .sort((a, b) => b.endDate.localeCompare(a.endDate) || a.title.localeCompare(b.title, 'ko'))
          .slice(0, 6);
        const exactMatch = sortedMatches.find((match) => normalizeTitle(match.title) === normalizedTitle);
        if (!cancelled) {
          setRecommendedDateRange(exactMatch ? formatDateRange(exactMatch.startDate, exactMatch.endDate) : null);
          setCalendarMatches(sortedMatches);
          setCalendarSearchState('idle');
        }
      } catch {
        if (!cancelled) {
          setRecommendedDateRange(null);
          setCalendarMatches([]);
          setCalendarSearchState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, title]);

  useEffect(() => {
    if (isDescriptionManual) return;

    const generatedDescription = formatCastDescription(gmName, castSelections);
    generatedDescriptionRef.current = generatedDescription;
    setDescription(generatedDescription);
  }, [castSelections, gmName, isDescriptionManual]);

  if (loading || !isAdmin) return null;

  const rules = Array.from(new Set(plays.map((play) => play.rule.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
  const playerCounts = Array.from(new Set(plays.map((play) => play.playerCount.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
  const playTypes = Array.from(new Set(plays.map((play) => play.type))).sort();

  const readSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const html = await file.text();
    const previewHtml = await expandCcaArchive(html);
    setSource({ name: file.name, html });
    setFormat(detectUploadFormat(html));
    setSpeakers(extractSpeakers(previewHtml));
    const nextImageSources = extractImageSources(previewHtml);
    setImageSources(nextImageSources);
    setLocalImagePreviews(createLocalImagePreviews(nextImageSources, roll20AssetFiles));
    setCastSelections([]);
    setHoveredImageSource(null);
    if (!title) setTitle(file.name.replace(/\.(source\.)?html?$/i, ''));
  };

  const readRoll20Assets = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setRoll20AssetFiles(files);
    const availableImageSources = imageSources.filter((source) => hasSelectedLocalAsset(source, files));
    setImageSources(availableImageSources);
    setLocalImagePreviews(createLocalImagePreviews(availableImageSources, files));
    setCastSelections([]);
    setHoveredImageSource(null);
  };

  const closeDialog = () => {
    setMasterKey('');
    setPassword('');
    setPasswordConfirm('');
    setOpen(false);
  };

  const resetForm = () => {
    setSource(null);
    setRoll20AssetFiles([]);
    setSpeakers([]);
    setImageSources([]);
    setLocalImagePreviews({});
    setCastSelections([]);
    setHoveredImageSource(null);
    setTitle('');
    setRecommendedDateRange(null);
    setCalendarMatches([]);
    setSelectedCalendarMatch(null);
    setCalendarSearchState('idle');
    setGmName('');
    setDescription('');
    setIsDescriptionManual(false);
    setDate(dateToday());
    setRule('');
    setPlayerCount('');
    setPlayType('');
    setFormat('roll20');
    setMainChannels('main');
    setWhisperChannels('');
    setLocked(false);
    setPassword('');
    setPasswordConfirm('');
    setStatus(null);
    generatedDescriptionRef.current = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (roll20AssetInputRef.current) roll20AssetInputRef.current.value = '';
  };

  const submit = async () => {
    const connectedPlay = selectedCalendarMatch
      ? plays.find((play) => normalizeTitle(play.title) === normalizeTitle(selectedCalendarMatch.title))
      : undefined;
    if (!source || !title.trim() || !isValidDateOrRange(date)) {
      setStatus('원본 HTML, 제목, 날짜를 확인해 주세요.');
      return;
    }
    if (!selectedCalendarMatch || !connectedPlay) {
      setStatus('캘린더 일정과 연결된 플레이를 선택한 뒤 로그를 올려 주세요.');
      return;
    }
    if (locked && (!password || password !== passwordConfirm || !masterKey)) {
      setStatus('비공개 로그의 비밀번호, 비밀번호 확인, 마스터키를 확인해 주세요.');
      return;
    }
    const accessToken = token.trim();
    if (!accessToken) {
      setStatus('GitHub fine-grained access token을 입력해 주세요.');
      return;
    }

    const roll20Source = format === 'roll20' ? await prepareRoll20Source(source.html, roll20AssetFiles) : null;
    const sourceHtml = roll20Source?.html ?? source.html;
    const draft: TrpgUploadDraft = {
      title: title.trim(), calendarEventId: selectedCalendarMatch.eventId, playId: connectedPlay.id, gmName: gmName.trim(), description: description.trim(), date,
      tags: buildLogTags(rule, playerCount, playType, format), format, locked,
      mainChannels: format === 'roll20' ? [] : tagsFromInput(mainChannels),
      whisperChannels: format === 'roll20' ? [] : tagsFromInput(whisperChannels),
      sourceFileName: source.name, sourceHtml: locked ? await encryptTrpgLogContent(sourceHtml, password) : sourceHtml,
      mediaFiles: roll20Source?.mediaFiles,
      cast: castSelections.map(({ plName, pcName, imageIndex }) => ({
        plName,
        pcName,
        iconSrc: imageIndex === null ? '' : roll20Source?.mediaUrls[imageSources[imageIndex] ?? ''] ?? imageSources[imageIndex] ?? '',
      })),
    };
    setSubmitting(true);
    setStatus('로그 파일과 메타데이터를 저장하는 중…');
    try {
      const resolvedDraft = await resolveTrpgUploadTitle(accessToken, draft);
      const folder = await commitTrpgUploadAtomically(accessToken, resolvedDraft);
      if (locked) {
        setStatus('비밀번호 목록을 안전하게 갱신하는 중…');
        const { passwordKey } = buildTrpgUploadFiles(resolvedDraft);
        await saveTrpgPassword(accessToken, masterKey, passwordKey, password);
      }
      const missingMediaNote = roll20Source?.missingAssets.length
        ? ` Roll20 내보내기에 들어 있지 않은 이미지 ${roll20Source.missingAssets.slice(0, 3).join(', ')}${roll20Source.missingAssets.length > 3 ? ' 등' : ''}은 제외했습니다.`
        : '';
      setStatus(`${folder} 업로드를 접수했습니다. 원본 로그를 정리한 뒤 사이트 배포가 자동으로 시작됩니다.${missingMediaNote}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed with an unknown error.';
      await copyErrorMessage(errorMessage);
      setStatus(error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewPath = source && title && date.match(/^\d{4}/)
    ? buildTrpgUploadFiles({ title, calendarEventId: selectedCalendarMatch?.eventId ?? '', playId: '', gmName, description, date, tags: buildLogTags(rule, playerCount, playType, format), format, locked, mainChannels: format === 'roll20' ? [] : tagsFromInput(mainChannels), whisperChannels: format === 'roll20' ? [] : tagsFromInput(whisperChannels), sourceFileName: source.name, sourceHtml: source.html, cast: castSelections.map(({ plName, pcName, imageIndex }) => ({ plName, pcName, iconSrc: imageIndex === null ? '' : imageSources[imageIndex] ?? '' })) }).folderPath
    : null;

  return (
    <>
      <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => setOpen(true)} className="ledger-stamp afterroll-meta rounded-[0.16rem] px-[0.78rem] py-[0.42rem] text-[0.78rem] uppercase tracking-[0.08em]">
        로그 올리기
      </motion.button>
      {open ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[rgba(32,28,25,0.52)] p-[1rem]" role="dialog" aria-modal="true" aria-label="TRPG 로그 올리기">
          <motion.div initial={{ opacity: 0, y: '1rem' }} animate={{ opacity: 1, y: 0 }} className="ledger-paper-sheet mx-auto my-[2rem] max-w-[44rem] p-[1rem] md:p-[1.4rem]">
            <div className="mb-[1rem] flex items-start justify-between gap-[1rem] border-b border-[var(--atr-line)] pb-[0.8rem]">
              <div><p className="afterroll-meta text-[0.72rem] uppercase tracking-[0.14em] text-[var(--atr-accent)]">Archive intake</p><h2 className="afterroll-title mt-[0.2rem] text-[2rem]">로그 올리기</h2></div>
              <button type="button" onClick={closeDialog} className="afterroll-meta text-[0.78rem] text-[var(--ledger-muted)]">닫기</button>
            </div>
            <div className="grid gap-[0.8rem] md:grid-cols-2">
              <Field label="로그 원본 HTML">
                <div className="flex items-center gap-[0.6rem]">
                  <input ref={fileInputRef} type="file" accept=".html,.htm,text/html" onChange={readSource} className="sr-only" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="ledger-index-tab shrink-0 rounded-[0.16rem] px-[0.65rem] py-[0.42rem] text-[0.78rem]">HTML 불러오기</button>
                  <span className="min-w-0 truncate text-[0.78rem] text-[var(--ledger-soft)]">{source?.name ?? '선택된 파일 없음'}</span>
                </div>
              </Field>
              {format === 'roll20' ? (
                <Field label="Roll20 _files 폴더">
                  <div className="flex items-center gap-[0.6rem]">
                    <input ref={roll20AssetInputRef} type="file" multiple onChange={readRoll20Assets} className="sr-only" {...{ webkitdirectory: '' }} />
                    <button type="button" onClick={() => roll20AssetInputRef.current?.click()} className="ledger-index-tab shrink-0 rounded-[0.16rem] px-[0.65rem] py-[0.42rem] text-[0.78rem]">폴더 선택</button>
                    <span className="min-w-0 truncate text-[0.78rem] text-[var(--ledger-soft)]">{roll20AssetFiles.length > 0 ? `${roll20AssetFiles.length}개 파일 선택됨` : 'HTML과 함께 내려받은 _files 폴더'}</span>
                  </div>
                  <p className="mt-[0.35rem] text-[0.72rem] text-[var(--ledger-soft)]">Roll20에서 받은 HTML의 이미지와 아바타를 기존 로그처럼 표시하려면 반드시 함께 선택해 주세요.</p>
                </Field>
              ) : null}
              <Field label="형식"><select value={format} onChange={(event) => setFormat(event.target.value as TrpgUploadDraft['format'])}>{FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              <Field label="제목">
                <input value={title} onChange={(event) => { setTitle(event.target.value); setSelectedCalendarMatch(null); }} autoComplete="off" />
                {calendarSearchState === 'loading' ? <p className="afterroll-meta mt-[0.35rem] text-[0.68rem] text-[var(--ledger-soft)]">캘린더 검색 중…</p> : null}
                {calendarMatches.length > 0 ? (
                  <div className="mt-[0.35rem] overflow-hidden rounded-[0.16rem] border border-[var(--atr-line)]">
                    {calendarMatches.map((match) => (
                      <button
                        key={match.eventId}
                        type="button"
                        onClick={() => { setSelectedCalendarMatch(match); setTitle(match.title); setDate(formatDateRange(match.startDate, match.endDate)); }}
                        className="flex w-full items-center justify-between gap-[0.5rem] border-b border-[var(--atr-line)] px-[0.42rem] py-[0.3rem] text-left last:border-b-0 hover:bg-[rgba(88,125,163,0.1)]"
                      >
                        <span className="min-w-0 truncate text-[0.75rem] text-[var(--ledger-ink)]">{match.title}</span>
                        <span className="afterroll-meta shrink-0 text-[0.66rem] text-[var(--ledger-soft)]">{formatDateRange(match.startDate, match.endDate)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedCalendarMatch ? <p className="afterroll-meta mt-[0.35rem] text-[0.68rem] text-[var(--atr-accent)]">선택한 캘린더 일정에 연결됨</p> : null}
                {recommendedDateRange ? <p className="afterroll-meta mt-[0.35rem] text-[0.68rem] text-[var(--atr-accent)]">같은 이름의 일정: {recommendedDateRange}</p> : null}
              </Field>
              <Field label="날짜 (YYYY.MM.DD ~ YYYY.MM.DD)"><input value={date} onChange={(event) => setDate(event.target.value)} placeholder="2026.08.28 ~ 2026.08.30" /></Field>
              <div className="md:col-span-2 grid gap-[0.65rem] md:grid-cols-2">
                <TagChipField label="룰" options={rules} value={rule} onChange={setRule} />
                <TagChipField label="인원수" options={playerCounts} value={playerCount} onChange={setPlayerCount} />
                <TagChipField label="유형" options={playTypes} value={playType} onChange={setPlayType} />
                <Field label="플랫폼">
                  <span className="afterroll-meta inline-flex rounded-full border border-[var(--atr-accent)] bg-[rgba(88,125,163,0.14)] px-[0.55rem] py-[0.2rem] text-[0.72rem] text-[var(--atr-accent)]">
                    {format === 'roll20' ? 'Roll20' : '코코포리아'}
                  </span>
                </Field>
              </div>
              {format !== 'roll20' ? <>
                <Field label="메인 채널 (쉼표로 구분)"><input value={mainChannels} onChange={(event) => setMainChannels(event.target.value)} placeholder="main" /></Field>
                <Field label="귓말 채널 (쉼표로 구분)"><input value={whisperChannels} onChange={(event) => setWhisperChannels(event.target.value)} placeholder="비밀 탭, GM 귓말" /></Field>
              </> : null}
              <div className="md:col-span-2">
              <Field label="공개 설정">
                <div className="flex flex-wrap items-center gap-[0.5rem] md:flex-nowrap">
                  <label className="flex items-center gap-[0.5rem] text-[0.9rem]"><input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} className="!h-[0.95rem] !w-[0.95rem] shrink-0" /> 비공개 로그</label>
                  {locked ? <label className="flex min-w-[10rem] flex-1 items-center gap-[0.45rem] text-[0.78rem] text-[var(--ledger-muted)]"><span className="shrink-0">마스터키</span><input id="trpg-master-key" name="trpg-master-key" type="password" value={masterKey} onChange={(event) => setMasterKey(event.target.value)} autoComplete="current-password" placeholder="TRPG_MASTER_KEY" /></label> : null}
                  {locked ? <label className="flex min-w-[10rem] flex-1 items-center gap-[0.45rem] text-[0.78rem] text-[var(--ledger-muted)]"><span className="shrink-0">로그 비밀번호</span><input type="text" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" placeholder="열람용 비밀번호" /></label> : null}
                  {locked ? <label className="flex min-w-[10rem] flex-1 items-center gap-[0.45rem] text-[0.78rem] text-[var(--ledger-muted)]"><span className="shrink-0">비밀번호 확인</span><input type="text" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="off" placeholder="한 번 더 입력" /></label> : null}
                </div>
                {locked ? <p className="afterroll-meta mt-[0.5rem] text-[0.72rem] text-[var(--ledger-soft)]">기존 비밀번호 목록을 갱신해 나중에 비밀번호를 복구할 수 있게 합니다.</p> : null}
              </Field>
              </div>
            </div>
            <Field label="CAST · GM 이름"><input value={gmName} onChange={(event) => setGmName(event.target.value)} placeholder="GM 이름" /></Field>
            {speakers.length > 0 ? (
              <Field label="발화자 미리보기 — CAST 연결">
                <p className="mb-[0.5rem] text-[0.78rem] text-[var(--ledger-soft)]">PC를 선택한 뒤 PL 이름과 HTML 안의 아이콘을 연결하세요. 선택한 항목만 MD에 기록됩니다.</p>
                <div className="grid gap-[0.55rem]">
                  {speakers.map((speaker) => {
                    const selection = castSelections.find((entry) => entry.pcName === speaker);
                    return (
                      <div key={speaker} className="rounded-[0.16rem] border border-[var(--atr-line)] p-[0.55rem]">
                        <label className="flex items-center gap-[0.5rem] text-[0.86rem] text-[var(--ledger-muted)]">
                          <input
                            type="checkbox"
                            checked={Boolean(selection)}
                            onChange={(event) => setCastSelections((current) => toggleCastSelection(current, speaker, event.target.checked))}
                            className="!h-[0.95rem] !w-[0.95rem] shrink-0"
                          />
                          <span>PC · {speaker}</span>
                        </label>
                        {selection ? (
                          <div className="mt-[0.55rem] grid gap-[0.45rem]">
                            <input
                              value={selection.plName}
                              onChange={(event) => setCastSelections((current) => current.map((entry) => entry.pcName === speaker ? { ...entry, plName: event.target.value } : entry))}
                              placeholder="PL 이름"
                              aria-label={`${speaker} PL 이름`}
                            />
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-[0.35rem]">
                              <button
                                type="button"
                                onClick={() => setCastSelections((current) => current.map((entry) => entry.pcName === speaker ? { ...entry, imageIndex: null } : entry))}
                                className={`flex aspect-square items-center justify-center rounded-[0.14rem] border text-[0.62rem] ${selection.imageIndex === null ? 'border-[var(--atr-accent)] bg-[rgba(88,125,163,0.1)] text-[var(--atr-accent)]' : 'border-[var(--atr-line)] text-[var(--ledger-soft)]'}`}
                                aria-label={`${speaker} 아이콘 선택 해제`}
                              >
                                NONE
                              </button>
                              {imageSources.map((source, imageIndex) => [source, imageIndex] as const).filter(([, imageIndex]) => selection.imageIndex === null || imageIndex === selection.imageIndex).map(([source, imageIndex]) => (
                                <button
                                  key={imageIndex}
                                  type="button"
                                  onClick={() => selection.imageIndex === imageIndex && setCastSelections((current) => current.map((entry) => entry.pcName === speaker ? { ...entry, imageIndex: null } : entry))}
                                  onDoubleClick={() => setCastSelections((current) => current.map((entry) => entry.pcName === speaker ? { ...entry, imageIndex } : entry))}
                                  className={`aspect-square rounded-[0.14rem] border bg-cover bg-top bg-no-repeat ${selection.imageIndex === imageIndex ? 'border-[var(--atr-accent)] ring-1 ring-[var(--atr-accent)]' : 'border-[var(--atr-line)]'}`}
                                  style={{ backgroundImage: `url("${localImagePreviews[source] ?? source}")` }}
                                  aria-label={`${speaker} 아이콘으로 HTML 이미지 ${imageIndex + 1} 선택`}
                                  onMouseEnter={() => setHoveredImageSource(localImagePreviews[source] ?? source)}
                                  onMouseLeave={() => setHoveredImageSource(null)}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Field>
            ) : source ? (
              <p className="afterroll-meta mt-[0.8rem] text-[0.72rem] text-[var(--ledger-soft)]">발화자 후보를 찾지 못했습니다. 이 파일은 CAST 없이 저장됩니다.</p>
            ) : null}
            <Field label="설명"><textarea value={description} onChange={(event) => { const nextDescription = event.target.value; setDescription(nextDescription); setIsDescriptionManual(nextDescription !== generatedDescriptionRef.current); }} rows={3} /></Field>
            <div className="mt-[0.8rem] border-t border-[var(--atr-line)] pt-[0.8rem]"><Field label="GitHub access token"><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="fine-grained token (Contents: Read and write)" autoComplete="off" /><p className="mt-[0.3rem] text-[0.72rem] text-[var(--ledger-soft)]">토큰과 마스터키는 저장하지 않습니다. 비공개 로그 저장소의 Contents 읽기·쓰기 권한이 필요합니다.</p></Field></div>
            {previewPath ? <p className="afterroll-meta mt-[0.8rem] text-[0.72rem] text-[var(--ledger-soft)]">저장 위치: {previewPath}</p> : null}
            {status ? <p className="mt-[0.8rem] whitespace-pre-wrap break-words text-[0.86rem] text-[var(--ledger-muted)]" role="status">{status}</p> : null}
            {hoveredImageSource ? (
              <div className="pointer-events-none fixed bottom-[1rem] right-[1rem] z-[110] w-[min(20rem,60vw)] rounded-[0.3rem] border border-[var(--atr-line)] bg-[rgba(251,252,253,0.98)] p-[0.3rem] shadow-[0_0.7rem_2rem_rgba(32,28,25,0.28)]">
                <div role="img" aria-label="아이콘 확대 미리보기" className="aspect-square w-full rounded-[0.16rem] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${hoveredImageSource}")` }} />
              </div>
            ) : null}
            <div className="mt-[1rem] flex justify-end gap-[0.6rem]"><button type="button" onClick={resetForm} disabled={submitting} className="ledger-index-tab afterroll-meta px-[0.8rem] py-[0.45rem] text-[0.78rem] disabled:opacity-50">초기화</button><button type="button" onClick={closeDialog} className="ledger-index-tab afterroll-meta px-[0.8rem] py-[0.45rem] text-[0.78rem]">취소</button><motion.button type="button" whileTap={{ scale: 0.98 }} onClick={submit} disabled={submitting} className="ledger-stamp afterroll-meta px-[0.9rem] py-[0.45rem] text-[0.78rem] disabled:opacity-50">{submitting ? '저장 중…' : '저장소에 올리기'}</motion.button></div>
          </motion.div>
        </div>
      ) : null}
    </>
  );
}

function TagChipField({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-[0.3rem]">
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(selected ? '' : option)}
                className={`afterroll-meta rounded-full border px-[0.55rem] py-[0.2rem] text-[0.72rem] transition-colors ${selected ? 'border-[var(--atr-accent)] bg-[rgba(88,125,163,0.14)] text-[var(--atr-accent)]' : 'border-[var(--atr-line)] bg-[rgba(255,250,239,0.62)] text-[var(--ledger-soft)] hover:bg-[rgba(88,125,163,0.08)]'}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : <p className="afterroll-meta text-[0.72rem] text-[var(--ledger-soft)]">플레이 목록에 등록된 항목이 없습니다.</p>}
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="mt-[0.8rem]"><span className="afterroll-meta mb-[0.32rem] block text-[0.72rem] uppercase tracking-[0.1em] text-[var(--ledger-soft)]">{label}</span><div className="[&_input]:w-full [&_input]:border [&_input]:border-[var(--atr-line)] [&_input]:bg-white/45 [&_input]:px-[0.6rem] [&_input]:py-[0.42rem] [&_input]:text-[0.9rem] [&_select]:w-full [&_select]:border [&_select]:border-[var(--atr-line)] [&_select]:bg-white/45 [&_select]:px-[0.6rem] [&_select]:py-[0.42rem] [&_select]:text-[0.9rem] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[var(--atr-line)] [&_textarea]:bg-white/45 [&_textarea]:px-[0.6rem] [&_textarea]:py-[0.42rem] [&_textarea]:text-[0.9rem]">{children}</div></div>;
}
