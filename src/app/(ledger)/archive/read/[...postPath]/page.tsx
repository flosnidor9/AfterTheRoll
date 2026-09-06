import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  getAllTrpgPostParams,
  getLocalDecryptedTrpgPostHtml,
  getTrpgPost,
  getTrpgPostHtmlUrl,
} from '@/lib/data/trpg';
import { fromGallerySegments } from '@/lib/galleryPath';
import TrpgLogReader from '@/components/trpg/TrpgLogReader';
import EncryptedTrpgLogReader from '@/components/trpg/EncryptedTrpgLogReader';
import TrpgCastPanel from '@/components/trpg/TrpgCastPanel';
import { SITE_ORIGIN } from '@/lib/config/site';

const EMPTY_EXPORT_POST_PATH = ['__empty__', '__empty__'];
const TAG_PREFIX = /^[^:]+:\s*/;

type Props = {
  params: Promise<{ postPath: string[] }>;
};

function splitPostPath(postPath: string[]) {
  if (postPath.length < 2) return null;
  const decoded = fromGallerySegments(postPath);
  if (!decoded) return null;

  const segments = decoded.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  return {
    folderSlug: segments.slice(0, -1).join('/'),
    postSlug: segments[segments.length - 1],
  };
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const params = getAllTrpgPostParams().map(({ folderSlug, postSlug }) => ({
    postPath: [...folderSlug.split('/'), postSlug],
  }));

  return params.length > 0 ? params : [{ postPath: EMPTY_EXPORT_POST_PATH }];
}

export async function generateMetadata({ params }: Props) {
  const resolved = splitPostPath((await params).postPath);
  if (!resolved) return { metadataBase: SITE_ORIGIN, title: 'Not Found' };

  const post = getTrpgPost(resolved.folderSlug, resolved.postSlug);
  if (!post) return { metadataBase: SITE_ORIGIN, title: 'Not Found' };

  return {
    metadataBase: SITE_ORIGIN,
    title: `${post.title} | After the Roll`,
    description: post.description || post.title,
  };
}

export default async function TrpgReadPage({ params }: Props) {
  const postPath = (await params).postPath;
  if (postPath.join('/') === EMPTY_EXPORT_POST_PATH.join('/')) redirect('/');

  const resolved = splitPostPath(postPath);
  if (!resolved) notFound();

  const post = getTrpgPost(resolved.folderSlug, resolved.postSlug);
  const htmlUrl = getTrpgPostHtmlUrl(resolved.folderSlug, resolved.postSlug);
  if (!post || !htmlUrl) notFound();

  const localHtmlContent = post.encrypted
    ? getLocalDecryptedTrpgPostHtml(resolved.folderSlug, resolved.postSlug)
    : undefined;
  const shouldUseEncryptedReader = post.encrypted && process.env.NODE_ENV !== 'development';

  return (
    <main className="afterroll-read-shell afterroll-desk min-h-screen px-[1rem] pb-[4rem] pt-[5rem] text-[var(--ledger-ink)] md:px-[2rem] md:pt-[5.4rem]">
      <article className="afterroll-read-paper ledger-paper-sheet mx-auto max-w-[72rem] overflow-hidden rounded-[0.45rem]">
        <div className="afterroll-read-header border-b border-[var(--atr-line)] px-[1.2rem] py-[1.1rem] md:px-[1.5rem]">
          <Link
            href="/logs"
            className="ledger-note-card afterroll-note mb-[1rem] inline-flex items-center gap-[0.4rem] rounded-[0.25rem] px-[0.8rem] py-[0.45rem] text-[0.78rem] uppercase text-[var(--ledger-muted)] transition-colors hover:text-[var(--atr-accent)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>돌아가기</span>
          </Link>

          <p className="afterroll-meta mb-[0.5rem] text-[0.72rem] uppercase tracking-[0.18em] text-[var(--atr-accent)]">
            Log File Viewer
          </p>
          <div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.35rem]">
            <h1 className="afterroll-title text-[2.4rem] leading-[1.04] text-[var(--ledger-ink)]">
              {post.title}
            </h1>
            {post.date ? (
              <span className="afterroll-meta rounded-[0.2rem] border border-[var(--atr-line)] bg-[rgba(88, 125, 163,0.06)] px-[0.7rem] py-[0.22rem] text-[0.78rem] uppercase tracking-[0.09em] text-[var(--ledger-soft)]">
                {post.date}
              </span>
            ) : null}
          </div>
          {post.description ? (
            <p className="afterroll-body mt-[0.6rem] max-w-[42rem] text-[1.08rem] leading-[1.65] text-[var(--ledger-muted)]">
              {post.description}
            </p>
          ) : null}

          {post.gmName || post.cast.length > 0 ? (
            <TrpgCastPanel gmName={post.gmName} gmIconSrc={post.gmIconSrc} cast={post.cast} />
          ) : null}

          <div className="mt-[1rem] flex flex-wrap items-start gap-[0.5rem]">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="afterroll-meta rounded-full border border-[var(--atr-line)] bg-[rgba(88, 125, 163,0.055)] px-[0.7rem] py-[0.14rem] text-[0.78rem] text-[var(--ledger-muted)]"
              >
                {tag.replace(TAG_PREFIX, '')}
              </span>
            ))}
          </div>
        </div>

        <div className="afterroll-read-log-wrap px-[0.2rem] py-[0.2rem] md:px-[0.45rem] md:py-[0.45rem]">
          {shouldUseEncryptedReader ? (
            <EncryptedTrpgLogReader
              encryptedUrl={post.htmlUrl}
              fallbackAvatarSrc={post.gmIconSrc}
              gmName={post.gmName}
              cast={post.cast}
              mainChannels={post.mainChannels}
              whisperChannels={post.whisperChannels}
            />
          ) : (
            <TrpgLogReader
              htmlUrl={htmlUrl}
              htmlContent={localHtmlContent ?? undefined}
              fallbackAvatarSrc={post.gmIconSrc}
              gmName={post.gmName}
              cast={post.cast}
              mainChannels={post.mainChannels}
              whisperChannels={post.whisperChannels}
            />
          )}
        </div>
      </article>
    </main>
  );
}
