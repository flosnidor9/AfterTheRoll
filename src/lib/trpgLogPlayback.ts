import type { LogEntry } from '../components/trpg/TrpgLogReader';

export function playbackLineId(sourceEntryId: string, lineIndex = 0): string {
  return `trpg-line-${encodeURIComponent(sourceEntryId)}-${lineIndex}`;
}

export function createReaderEntries(entries: LogEntry[]): LogEntry[] {
  return mergeConsecutiveCharacterEntries(entries.map((entry) => ({
    ...entry,
    sourceEntryIds: [entry.id],
    contentHtml: `<div data-trpg-source="${encodeURIComponent(entry.id)}">${entry.contentHtml}</div>`,
  })));
}

/** The reading view must never mutate the source messages used for playback. */
export function mergeConsecutiveCharacterEntries(entries: LogEntry[]): LogEntry[] {
  return entries.reduce<LogEntry[]>((merged, entry) => {
    const previous = merged.at(-1);
    const isSameCharacter =
      previous &&
      entry.kind === 'chat' &&
      previous.kind === 'chat' &&
      !entry.isNarrator &&
      !previous.isNarrator &&
      Boolean(entry.speaker) &&
      entry.speaker === previous.speaker &&
      entry.avatarSrc === previous.avatarSrc &&
      entry.isAside === previous.isAside &&
      entry.isWhisper === previous.isWhisper &&
      entry.whisperTo === previous.whisperTo;

    if (!isSameCharacter) merged.push({ ...entry, sourceEntryIds: [...(entry.sourceEntryIds ?? [entry.id])] });
    else {
      previous.contentHtml += `<div class="trpg-log-continuation">${entry.contentHtml}</div>`;
      previous.sourceEntryIds?.push(...(entry.sourceEntryIds ?? [entry.id]));
    }
    return merged;
  }, []);
}

export function createCinematicEntries(entries: LogEntry[], avatarMap: Record<string, string>): LogEntry[] {
  return entries.filter((entry) => !entry.isAside && !entry.isWhisper).flatMap((entry) => {
    // CCA groups original messages into .ln elements under one portrait.
    // Split only those explicit message boundaries; keep <br> within a message.
    const lines = entry.cinematicLines?.length ? entry.cinematicLines : [entry.contentHtml];
    return lines.map((contentHtml, index) => ({
      ...entry,
      id: `${entry.id}-line-${index}`,
      sourceEntryId: entry.id,
      sourceLineIndex: index,
      contentHtml,
      avatarSrc: entry.avatarSrc || avatarMap[entry.speaker] || null,
    }));
  });
}

export function findPlaybackPage(pages: LogEntry[][], sourceEntryId: string): number {
  return pages.findIndex((page) => page.some((entry) => (entry.sourceEntryIds ?? [entry.id]).includes(sourceEntryId)));
}

type PlaybackBounds = { top: number; bottom: number; index: number };

export function pinnedToolbarTop(slotTop: number, readerBottom: number, toolbarHeight: number): number {
  return Math.min(Math.max(slotTop, 0), readerBottom - toolbarHeight);
}

export function findTopPlaybackIndex(lines: PlaybackBounds[], contentTop: number, viewportBottom: number): number {
  const firstVisible = lines.find((line) => line.bottom > contentTop && line.top < viewportBottom);
  if (firstVisible) return firstVisible.index;
  return lines.find((line) => line.top >= contentTop)?.index ?? lines.at(-1)?.index ?? 0;
}
