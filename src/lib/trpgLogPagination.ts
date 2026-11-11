import type { LogEntry } from '../components/trpg/TrpgLogReader';

const MAX_PAGE_ENTRIES = 80;
const MAX_PAGE_READING_WEIGHT = 12000;
const IMAGE_READING_WEIGHT = 240;
// Attributes can contain embedded images, styles, or even escaped roll formulas.
// None of those bytes represent additional reading material.
const HTML_TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

function readingWeight(html: string): number {
  const content = html.replace(/<!--[^]*?-->|<(style|script)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  const imageCount = (content.match(/<img\b/gi) ?? []).length;
  const text = content.replace(HTML_TAG, ' ').replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.length + imageCount * IMAGE_READING_WEIGHT;
}

/** Paginate by reading content, independently of image URLs and export markup. */
export function paginateEntries(entries: LogEntry[]): LogEntry[][] {
  const pages: LogEntry[][] = [];
  let current: LogEntry[] = [];
  let weight = 0;

  for (const entry of entries) {
    const entryWeight = readingWeight(entry.contentHtml) + entry.speaker.length;
    if (current.length && (current.length >= MAX_PAGE_ENTRIES || weight + entryWeight > MAX_PAGE_READING_WEIGHT)) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    current.push(entry);
    weight += entryWeight;
  }
  if (current.length) pages.push(current);
  return pages;
}
