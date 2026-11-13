export type PlayDates = { startDate: string; endDate: string | null };

// Calendar records are authoritative, including single-session plays with no end date.
export function reconcilePlayDates<T extends PlayDates & { title: string }>(
  entry: T,
  calendarDates: PlayDates | undefined,
): T {
  if (!calendarDates || (
    entry.startDate === calendarDates.startDate && entry.endDate === calendarDates.endDate
  )) return entry;
  return { ...entry, ...calendarDates };
}
