'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LockClosedIcon } from '@heroicons/react/24/solid';
import type { TrpgArchivePostMeta } from '@/lib/data/trpg';
import { toGalleryPath } from '@/lib/galleryPath';
import TrpgUploadButton from '@/components/trpg/TrpgUploadButton';
import TrpgLogDeleteButton from '@/components/trpg/TrpgLogDeleteButton';

type Props = {
  posts: TrpgArchivePostMeta[];
  title: string;
  backHref?: string;
  backLabel?: string;
};

const TAG_FILTER_GROUPS = [
  { label: '룰', prefix: '룰: ' },
  { label: '인원수', prefix: '인원수: ' },
  { label: '유형', prefix: '유형: ' },
  { label: '플랫폼', prefix: '플랫폼: ' },
] as const;

function tagLabel(tag: string) {
  return TAG_FILTER_GROUPS.find(({ prefix }) => tag.startsWith(prefix))
    ? tag.replace(/^[^:]+:\s*/, '')
    : tag;
}

export default function TrpgArchiveClient({ posts, title, backHref, backLabel }: Props) {
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const uniqueTags = new Set<string>();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (tag.trim()) uniqueTags.add(tag);
    }
  }

  const tags = Array.from(uniqueTags).sort((a, b) => a.localeCompare(b, 'ko'));
  const filteredPosts =
    activeTags.length === 0
      ? posts
      : posts.filter((post) => activeTags.every((tag) => post.tags.includes(tag)));
  const groupedPosts = useMemo(() => {
    const groups = new Map<string, TrpgArchivePostMeta[]>();

    for (const post of filteredPosts) {
      const key = post.year || '미분류';
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(post);
      } else {
        groups.set(key, [post]);
      }
    }

    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0], 'en'));
  }, [filteredPosts]);

  function toggleTag(tag: string) {
    const group = TAG_FILTER_GROUPS.find(({ prefix }) => tag.startsWith(prefix));
    setActiveTags((current) => {
      if (current.includes(tag)) return current.filter((value) => value !== tag);
      if (!group) return [...current, tag];
      return [...current.filter((value) => !value.startsWith(group.prefix)), tag];
    });
  }

  return (
    <main className="afterroll-desk min-h-screen px-[1.1rem] pb-[4rem] pt-[5.4rem] text-[var(--ledger-ink)] md:px-[2rem]">
      <div className="mx-auto max-w-[72rem]">
        {backHref && backLabel ? (
          <Link
            href={backHref}
            className="ledger-paper-panel ledger-dashed afterroll-note mb-[1.25rem] inline-flex items-center gap-[0.4rem] rounded-[0.5rem] px-[0.9rem] py-[0.5rem] text-[1rem] text-[var(--ledger-muted)] transition-transform hover:-translate-y-[0.03rem]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>{backLabel}</span>
          </Link>
        ) : null}

        <header className="relative mb-[1.5rem] flex items-end justify-between gap-[1rem] border-b border-[var(--atr-line)] pb-[0.85rem]">
          <div><p className="afterroll-meta text-[0.74rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">Session Logs</p>
          <h1 className="afterroll-title mt-[0.18rem] text-[2.4rem] leading-none text-[var(--ledger-ink)]">{title}</h1></div>
          <TrpgUploadButton />
        </header>

        <section className="relative grid gap-[1rem] md:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="ledger-paper-sheet p-[0.8rem]">
            <p className="afterroll-meta mb-[0.65rem] text-[0.72rem] uppercase tracking-[0.14em] text-[var(--atr-accent)]">
              채널 필터
            </p>
            <div className="flex flex-wrap gap-[0.45rem] md:flex-col">
              <motion.button
                type="button"
                onClick={() => setActiveTags([])}
                whileTap={{ scale: 0.98 }}
                className={`afterroll-meta rounded-[0.08rem] px-[0.65rem] py-[0.42rem] text-left text-[0.78rem] transition-colors ${
                  activeTags.length === 0 ? 'ledger-index-tab-active' : 'ledger-index-tab'
                }`}
              >
                전체
              </motion.button>
              {TAG_FILTER_GROUPS.map((group) => {
                const groupTags = tags.filter((tag) => tag.startsWith(group.prefix));
                if (groupTags.length === 0) return null;
                return (
                  <div key={group.prefix} className="mt-[0.45rem]">
                    <p className="afterroll-meta mb-[0.25rem] text-[0.66rem] tracking-[0.08em] text-[var(--ledger-soft)]">{group.label}</p>
                    <div className="flex flex-wrap gap-[0.3rem] md:flex-col">
                      {groupTags.map((tag) => {
                        const isActive = activeTags.includes(tag);
                        return (
                          <motion.button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            whileTap={{ scale: 0.98 }}
                            className={`afterroll-meta rounded-[0.08rem] px-[0.65rem] py-[0.42rem] text-left text-[0.78rem] transition-colors ${
                              isActive ? 'ledger-index-tab-active' : 'ledger-index-tab'
                            }`}
                          >
                            {tag.slice(group.prefix.length)}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="ledger-paper-sheet p-[0.8rem]">
          <div className="afterroll-meta mb-[1rem] text-[0.78rem] uppercase tracking-[0.12em] text-[var(--ledger-soft)]">
            {activeTags.length === 0
              ? `${filteredPosts.length}개`
              : `${activeTags.join(' + ')} // ${filteredPosts.length}`}
          </div>

          <div className="space-y-[1rem]">
            {groupedPosts.map(([year, yearPosts]) => (
              <section key={year} className="space-y-[0.75rem]">
                <div className="flex items-end justify-between gap-[1rem] border-b border-[rgba(87,67,48,0.12)] pb-[0.35rem]">
                  <p className="afterroll-title text-[2rem] leading-none text-[var(--ledger-ink)]">{year}</p>
                  <p className="afterroll-meta text-[0.78rem] uppercase tracking-[0.12em] text-[var(--ledger-soft)]">{yearPosts.length}개 기록</p>
                </div>

                <ul className="space-y-[0.75rem]">
                  {yearPosts.map((post) => (
                    <li key={post.fullSlug} className="relative">
                      <Link
                        href={`/archive/read/${toGalleryPath(post.fullSlug)}`}
                        className="group relative grid gap-[0.65rem] border-l border-[var(--atr-line)] bg-[rgba(0,0,0,0.26)] px-[0.85rem] py-[0.75rem] pr-[4.5rem] transition duration-200 hover:border-[var(--atr-line-strong)] hover:bg-[rgba(88,125,163,0.07)] md:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <div className="relative z-[1] flex flex-col gap-[0.8rem] md:flex-row md:items-start md:justify-between md:gap-[1rem]">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-[0.65rem] gap-y-[0.25rem]">
                              <p className="afterroll-title text-[1.34rem] leading-[1.1] text-[var(--ledger-ink)] md:text-[1.55rem]">
                                {post.title}
                                {post.encrypted && (
                                  <span className="ml-[0.4rem] inline-flex align-middle text-[0.82rem] text-[var(--ledger-soft)]" aria-label="비공개 로그" title="비공개 로그">
                                    <LockClosedIcon aria-hidden="true" className="size-[0.82rem]" />
                                  </span>
                                )}
                              </p>
                              {post.date ? (
                                <span className="afterroll-meta rounded-[0.2rem] border border-[rgba(87,67,48,0.14)] bg-[rgba(255,250,239,0.72)] px-[0.5rem] py-[0.12rem] text-[0.78rem] uppercase tracking-[0.08em] text-[var(--ledger-soft)]">
                                  {post.date}
                                </span>
                              ) : null}
                            </div>
                            <div className="ledger-paper-rule mt-[0.4rem] w-full max-w-[7rem]" />
                            {post.description ? (
                              <p className="afterroll-body mt-[0.45rem] text-[0.98rem] leading-[1.68] text-[var(--ledger-muted)]">{post.description}</p>
                            ) : null}
                          </div>

                        </div>

                        {post.tags.length > 0 ? (
                          <div className="relative z-[1] mt-[0.9rem] flex flex-wrap items-start gap-[0.45rem]">
                            {post.tags.map((tag) => (
                              <span
                                key={`${post.fullSlug}-${tag}`}
                                className="afterroll-meta rounded-full border border-[var(--atr-line)] bg-[rgba(255,250,239,0.78)] px-[0.68rem] py-[0.14rem] text-[0.8rem] text-[var(--ledger-muted)]"
                              >
                                {tagLabel(tag)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </Link>
                      <div className="absolute right-[0.75rem] top-[0.7rem]">
                        <TrpgLogDeleteButton post={post} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          </div>
        </section>
      </div>
    </main>
  );
}
