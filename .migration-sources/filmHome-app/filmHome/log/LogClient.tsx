'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { LogPost } from '@/lib/logs';

type LogClientProps = {
  posts: LogPost[];
};

type SortOrder = 'desc' | 'asc';

export default function LogClient({ posts }: LogClientProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    posts.forEach((post) => {
      post.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [posts]);

  const filteredAndSortedPosts = useMemo(() => {
    let filtered = posts;

    if (selectedTag) {
      filtered = filtered.filter((post) => post.tags.includes(selectedTag));
    }

    return [...filtered].sort((a, b) => {
      if (sortOrder === 'desc') {
        return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
      }
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }, [posts, selectedTag, sortOrder]);

  return (
    <div className="min-h-screen px-[2rem] pb-[4rem] pt-[4rem]">
      <div className="mx-auto max-w-[56rem]">
        <div className="mb-[3rem]">
          <div className="mb-[1.5rem] flex items-end justify-between">
            <div>
              <h1 className="font-serif text-[2.5rem] font-light tracking-wide text-white/90">Log</h1>
              <p className="mt-[0.5rem] text-[0.95rem] text-white/50">마크다운으로 작성한 로그 아카이브</p>
            </div>

            <motion.button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="rounded-[0.5rem] border border-white/10 bg-white/5 px-[1rem] py-[0.5rem] text-[0.85rem] font-light tracking-wide text-white/70 transition-all hover:border-white/20 hover:bg-white/10"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {sortOrder === 'desc' ? '최신순' : '오래된순'}
            </motion.button>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-[0.5rem]">
              <motion.button
                onClick={() => setSelectedTag(null)}
                className={`rounded-full px-[0.875rem] py-[0.5rem] text-[0.85rem] font-light tracking-wide transition-all ${
                  selectedTag === null
                    ? 'border border-white/30 bg-white/15 text-white/90'
                    : 'border border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                전체
              </motion.button>
              {allTags.map((tag) => (
                <motion.button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`rounded-full px-[0.875rem] py-[0.5rem] text-[0.85rem] font-light tracking-wide transition-all ${
                    selectedTag === tag
                      ? 'border border-white/30 bg-white/15 text-white/90'
                      : 'border border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10'
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {tag}
                </motion.button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-[1rem]">
          {filteredAndSortedPosts.length === 0 ? (
            <div className="py-[4rem] text-center text-[0.95rem] text-white/50">
              {selectedTag ? `'${selectedTag}' 태그의 글이 없습니다.` : '아직 작성된 글이 없습니다.'}
            </div>
          ) : (
            filteredAndSortedPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/filmHome/log/${post.slug}`}
                className="group block rounded-[0.75rem] focus-visible:outline-none focus-visible:ring-[0.125rem] focus-visible:ring-white/40"
              >
                <motion.article
                  className="rounded-[0.75rem] border border-white/10 bg-white/5 p-[1.5rem] transition-all hover:border-white/20 hover:bg-white/10"
                  whileHover={{ y: -2 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="mb-[0.5rem] flex items-baseline justify-between gap-[1rem]">
                    <h2 className="min-w-0 font-serif text-[1.25rem] font-light text-white/90 transition-colors group-hover:text-white">
                      {post.title}
                    </h2>
                    <span className="shrink-0 text-[0.85rem] text-white/40">{formatDate(post.date)}</span>
                  </div>

                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-[0.5rem]">
                      {post.tags.map((tag) => (
                        <span
                          key={`${post.slug}-${tag}`}
                          className="rounded-full border border-white/10 bg-white/5 px-[0.75rem] py-[0.25rem] text-[0.75rem] text-white/60"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.article>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
