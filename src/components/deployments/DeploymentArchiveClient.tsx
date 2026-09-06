"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LockClosedIcon } from "@heroicons/react/24/solid";
import type { DeploymentPost } from "@/lib/data/deployments";
import { toGalleryPath } from "@/lib/galleryPath";
import DeploymentUploadButton from "./DeploymentUploadButton";
import DeploymentManageButton from "./DeploymentManageButton";

export default function DeploymentArchiveClient({
  posts,
}: {
  posts: DeploymentPost[];
}) {
  return (
    <main className="afterroll-desk min-h-screen px-[1.1rem] pb-[4rem] pt-[5.4rem] md:px-[2rem]">
      <div className="mx-auto max-w-[52rem]">
        <header className="mb-[1.5rem] flex items-end justify-between gap-[1rem] border-b border-[var(--atr-line)] pb-[0.85rem]">
          <div>
            <p className="afterroll-meta text-[0.74rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">
              Deployment notes
            </p>
            <h1 className="afterroll-title mt-[0.18rem] text-[2.4rem] leading-none text-[var(--ledger-ink)]">
              배포
            </h1>
          </div>
          <DeploymentUploadButton />
        </header>
        <div className="space-y-[0.7rem]">
          {posts.map((post) => (
            <motion.article
              key={`${post.year}/${post.slug}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-[0.6rem] border-b border-[var(--atr-line)]"
            >
              <Link
                href={`/deployments/read/${toGalleryPath(`${post.year}/${post.slug}`)}`}
                className="min-w-0 flex-1 py-[0.9rem] transition-colors hover:bg-white/45"
              >
                <div className="flex flex-wrap items-baseline gap-[0.55rem]">
                  <h2 className="afterroll-title text-[1.35rem] text-[var(--atr-text)]">
                    {post.title}
                  </h2>
                  {post.privateUrl ? (
                    <LockClosedIcon
                      className="size-[0.78rem] text-[var(--atr-soft)]"
                      aria-label="보호 내용 포함"
                    />
                  ) : null}
                  <time className="afterroll-meta text-[0.72rem] text-[var(--atr-soft)]">
                    {post.date}
                  </time>
                </div>
                {post.description ? (
                  <p className="afterroll-body mt-[0.35rem] text-[0.9rem] text-[var(--atr-muted)]">
                    {post.description}
                  </p>
                ) : null}
                {post.tags.length ? (
                  <div className="mt-[0.55rem] flex flex-wrap gap-[0.35rem]">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[var(--atr-line)] px-[0.5rem] py-[0.1rem] text-[0.72rem] text-[var(--atr-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
              <div className="shrink-0 pt-[0.9rem]">
                <DeploymentManageButton post={post} />
              </div>
            </motion.article>
          ))}
          {posts.length === 0 ? (
            <p className="py-[3rem] text-center text-[0.9rem] text-[var(--atr-muted)]">
              아직 등록된 배포 글이 없습니다.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
