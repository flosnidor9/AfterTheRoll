import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getAllLogPosts, getLogPostBySlug } from '@/lib/logs';
import LogCommentsSection from '@/components/log/LogCommentsSection';
import { SITE_ORIGIN } from '@/lib/config/site';

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllLogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getLogPostBySlug(slug);

  if (!post) {
    return { metadataBase: SITE_ORIGIN, title: 'Not Found | Log' };
  }

  return {
    metadataBase: SITE_ORIGIN,
    title: `${post.title} | Log`,
    description: post.content.slice(0, 140),
  };
}

export default async function LogDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = getLogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const dateLabel = post.date
    ? new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(post.date))
    : '';

  return (
    <main className="min-h-screen px-[1rem] pb-[4rem] pt-[4.5rem] md:px-[2rem] md:pb-[5rem] md:pt-[5rem]">
      <article className="mx-auto max-w-[56rem] p-0 md:rounded-[1rem] md:border md:border-white/15 md:bg-white/5 md:p-[2.5rem] md:backdrop-blur-xl">
        <Link
          href="/filmHome/log"
          className="mb-[1.5rem] inline-flex text-[0.9rem] text-white/70 transition-colors hover:text-white"
        >
          ← Back to Log
        </Link>

        <header className="mb-[2rem] border-b border-white/10 pb-[1.25rem]">
          <h1 className="font-serif text-[2rem] font-light text-white/95 md:text-[2.5rem]">{post.title}</h1>
          {dateLabel && <p className="mt-[0.6rem] text-[0.9rem] text-white/50">{dateLabel}</p>}
          {post.tags.length > 0 && (
            <div className="mt-[1rem] flex flex-wrap gap-[0.5rem]">
              {post.tags.map((tag) => (
                <span
                  key={`${post.slug}-${tag}`}
                  className="rounded-full border border-white/10 bg-white/5 px-[0.75rem] py-[0.25rem] text-[0.75rem] text-white/65"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="prose prose-invert max-w-none prose-headings:font-serif prose-headings:font-light prose-p:text-white/85 prose-p:leading-relaxed prose-a:text-white prose-a:underline prose-a:underline-offset-2 prose-strong:text-white prose-code:rounded prose-code:bg-white/10 prose-code:px-[0.4rem] prose-code:py-[0.2rem] prose-pre:border prose-pre:border-white/10 prose-pre:bg-white/5">
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>

        <LogCommentsSection postSlug={post.slug} />
      </article>
    </main>
  );
}

