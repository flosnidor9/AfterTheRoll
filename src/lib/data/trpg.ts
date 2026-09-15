import fs from 'fs';
import path from 'path';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import matter from 'gray-matter';
import { getAllFolderSlugs } from '@/lib/data/folders';
import { TRPG_ARCHIVE_ROOT, TRPG_ASSET_PREFIX, TRPG_PUBLIC_ROOT } from '@/lib/trpgSource';

const TRPG_ROOT = TRPG_ARCHIVE_ROOT;
const DATE_TOKEN_PATTERN = /\d{4}[.-]\d{2}[.-]\d{2}/g;

export type TrpgCastEntry = {
  plName: string;
  pcName: string;
  iconSrc: string;
};

export type TrpgPostMeta = {
  slug: string;
  title: string;
  calendarEventId: string;
  playId: string;
  description: string;
  date: string;
  tags: string[];
  gmName: string;
  gmIconSrc: string;
  cast: TrpgCastEntry[];
  htmlPath: string;
  htmlUrl: string;
  sourceFormat: 'roll20' | 'ccfolia' | 'cca' | '';
  encrypted?: boolean;
  mainChannels?: string[];
  whisperChannels?: string[];
};

export type TrpgArchivePostMeta = TrpgPostMeta & {
  year: string;
  folderSlug: string;
  fullSlug: string;
  scenarioTitle: string;
};

function normalizeSlug(slug: string): string {
  return slug
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function toFolderAbs(folderSlug: string): string {
  return path.join(TRPG_ROOT, ...normalizeSlug(folderSlug).split('/'));
}

function toPostAbsPath(folderSlug: string, postSlug: string): string {
  return path.join(toFolderAbs(folderSlug), `${postSlug}.md`);
}

function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function ensureString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getLogEndDate(date: string): string {
  const dateTokens = date.match(DATE_TOKEN_PATTERN);
  const lastDate = dateTokens?.at(-1);
  return lastDate?.replaceAll('.', '-') ?? date;
}

function ensureCast(value: unknown): TrpgCastEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      return {
        plName: ensureString(record.plName),
        pcName: ensureString(record.pcName),
        iconSrc: ensureString(record.iconSrc),
      };
    })
    .filter((item): item is TrpgCastEntry => Boolean(item?.plName || item?.pcName));
}

function resolvePostMediaUrl(folderSlug: string, value: string): string {
  const mediaMatch = value.match(/^\/images\/afterTheRoll\/.+?\/media\/(.+)$/i);
  if (!mediaMatch) return value;

  // Roll20 exports can retain a mojibake folder name in metadata. The post's
  // actual folder is authoritative for its media assets.
  return `${TRPG_ASSET_PREFIX}/afterTheRoll/${normalizeSlug(folderSlug)}/media/${mediaMatch[1]}`;
}

function parsePostMeta(folderSlug: string, fileName: string): TrpgPostMeta | null {
  const postSlug = path.basename(fileName, '.md');
  const raw = fs.readFileSync(path.join(toFolderAbs(folderSlug), fileName), 'utf8');
  const { data } = matter(raw);

  const htmlPath = ensureString(data.htmlPath);
  if (!htmlPath) return null;

  return {
    slug: postSlug,
    title: ensureString(data.title, postSlug),
    calendarEventId: ensureString(data.calendarEventId),
    playId: ensureString(data.playId),
    description: ensureString(data.description),
    date: ensureString(data.date),
    tags: ensureArray(data.tags),
    gmName: ensureString(data.gmName),
    gmIconSrc: resolvePostMediaUrl(folderSlug, ensureString(data.gmIconSrc)),
    cast: ensureCast(data.cast).map((entry) => ({
      ...entry,
      iconSrc: resolvePostMediaUrl(folderSlug, entry.iconSrc),
    })),
    htmlPath,
    htmlUrl: toTrpgPublicUrl(folderSlug, htmlPath),
    sourceFormat: (['roll20', 'ccfolia', 'cca'].includes(ensureString(data.sourceFormat)) ? data.sourceFormat : '') as TrpgPostMeta['sourceFormat'],
    encrypted: !!data.locked,
    mainChannels: ensureArray(data.mainChannels).length > 0 ? ensureArray(data.mainChannels) : undefined,
    whisperChannels: ensureArray(data.whisperChannels).length > 0 ? ensureArray(data.whisperChannels) : undefined,
  };
}

function toTrpgPublicUrl(folderSlug: string, htmlPath: string): string {
  const normalizedFolder = normalizeSlug(folderSlug);
  const normalizedPath = htmlPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalizedPath.startsWith('images/')) return `${TRPG_ASSET_PREFIX}/${normalizedPath.slice('images/'.length)}`;
  return `${TRPG_ASSET_PREFIX}/afterTheRoll/${normalizedFolder}/${normalizedPath}`;
}

export function getTrpgPosts(folderSlug: string): TrpgPostMeta[] {
  const folderAbs = toFolderAbs(folderSlug);
  if (!fs.existsSync(folderAbs)) return [];

  return fs
    .readdirSync(folderAbs, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'content.md')
    .map((entry) => parsePostMeta(folderSlug, entry.name))
    .filter((post): post is TrpgPostMeta => Boolean(post))
    .sort((a, b) => {
      const dateCompare = getLogEndDate(b.date).localeCompare(getLogEndDate(a.date), 'ko');
      return dateCompare || a.title.localeCompare(b.title, 'ko');
    });
}

export function getTrpgPost(folderSlug: string, postSlug: string): TrpgPostMeta | null {
  const postPath = toPostAbsPath(folderSlug, postSlug);
  if (!fs.existsSync(postPath)) return null;
  return parsePostMeta(folderSlug, `${postSlug}.md`);
}

function resolvePublicHtmlAbs(folderSlug: string, htmlPath: string): string | null {
  const normalized = htmlPath.replace(/\\/g, '/');
  const absPath = normalized.startsWith('/')
    ? path.join(TRPG_PUBLIC_ROOT, normalized.replace(/^\/+/, ''))
    : path.join(toFolderAbs(folderSlug), normalized);

  const resolved = path.resolve(absPath);
  if (!resolved.startsWith(path.resolve(TRPG_ARCHIVE_ROOT))) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export function getTrpgPostHtml(folderSlug: string, postSlug: string): string | null {
  const post = getTrpgPost(folderSlug, postSlug);
  if (!post) return null;

  const htmlAbs = resolvePublicHtmlAbs(folderSlug, post.htmlPath);
  if (!htmlAbs) return null;
  const html = fs.readFileSync(htmlAbs, 'utf8');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

type EncryptedLogPayload = {
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

function isEncryptedLogPayload(value: unknown): value is EncryptedLogPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return ['salt', 'iv', 'ciphertext', 'authTag'].every((key) => typeof payload[key] === 'string');
}

function getLocalTrpgPasswords(): Record<string, string> | null {
  const plainPasswordsPath = path.join(process.cwd(), 'passwords.json');
  const encryptedPasswordsPath = path.join(process.cwd(), 'passwords.enc.json');

  try {
    return JSON.parse(fs.readFileSync(plainPasswordsPath, 'utf8')) as Record<string, string>;
  } catch {
    // The local plaintext file is optional and may be intentionally absent.
  }

  const masterKey = process.env.TRPG_MASTER_KEY;
  if (!masterKey || !fs.existsSync(encryptedPasswordsPath)) return null;

  try {
    const payload = JSON.parse(fs.readFileSync(encryptedPasswordsPath, 'utf8')) as unknown;
    if (!isEncryptedLogPayload(payload)) return null;

    const key = pbkdf2Sync(masterKey, Buffer.from(payload.salt, 'hex'), 100000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
    return JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'hex')), decipher.final()]).toString('utf8'),
    ) as Record<string, string>;
  } catch {
    return null;
  }
}

export function getLocalDecryptedTrpgPostHtml(folderSlug: string, postSlug: string): string | null {
  if (process.env.NODE_ENV !== 'development') return null;

  const post = getTrpgPost(folderSlug, postSlug);
  if (!post) return null;

  const htmlAbs = resolvePublicHtmlAbs(folderSlug, post.htmlPath);
  if (!htmlAbs) return null;

  try {
    const payload = JSON.parse(fs.readFileSync(htmlAbs, 'utf8')) as unknown;
    if (!isEncryptedLogPayload(payload)) return fs.readFileSync(htmlAbs, 'utf8');

    const passwords = getLocalTrpgPasswords();
    if (!passwords) return null;
    const passwordKey = `${normalizeSlug(folderSlug)}/${postSlug}`;
    const password = passwords[passwordKey] ?? passwords[postSlug];
    if (!password) return null;

    const key = pbkdf2Sync(password, Buffer.from(payload.salt, 'hex'), 100000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function getTrpgPostHtmlUrl(folderSlug: string, postSlug: string): string | null {
  const post = getTrpgPost(folderSlug, postSlug);
  return post?.htmlUrl ?? null;
}

export function getAllTrpgPostParams(): Array<{ folderSlug: string; postSlug: string }> {
  return getAllFolderSlugs('trpg').flatMap((folderSlug) =>
    getTrpgPosts(folderSlug).map((post) => ({
      folderSlug,
      postSlug: post.slug,
    })),
  );
}

export function getAllTrpgPosts(): TrpgArchivePostMeta[] {
  return getAllFolderSlugs('trpg')
    .flatMap((folderSlug) => {
      const segments = folderSlug.split('/').filter(Boolean);
      const year = segments[0] ?? '';
      const scenarioTitle = segments.at(-1) ?? folderSlug;

      return getTrpgPosts(folderSlug).map((post) => ({
        ...post,
        year,
        folderSlug,
        fullSlug: `${folderSlug}/${post.slug}`,
        scenarioTitle,
      }));
    })
    .sort((a, b) => {
      const dateCompare = getLogEndDate(b.date).localeCompare(getLogEndDate(a.date), 'ko');
      return dateCompare || a.title.localeCompare(b.title, 'ko');
    });
}
