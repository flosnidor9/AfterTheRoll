import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import FirebaseGuestbook from '@/components/guestbook/FirebaseGuestbook';
import DeploymentMarkdown from '@/components/deployments/DeploymentMarkdown';
import ProtectedDeploymentContent from '@/components/deployments/ProtectedDeploymentContent';
import { getAllDeploymentPosts, getDeploymentPost } from '@/lib/data/deployments';

const EMPTY_PARAMS = { year: '__empty__', slug: '__empty__' };
type Props = { params: Promise<{ year: string; slug: string }> };

function decodeSegment(segment: string) {
  try { return decodeURIComponent(segment); } catch { return null; }
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const posts = getAllDeploymentPosts().map((post) => ({ year: post.year, slug: post.slug }));
  return posts.length ? posts : [EMPTY_PARAMS];
}

export default async function DeploymentReadPage({ params }: Props) {
  const raw = await params;
  const year = decodeSegment(raw.year);
  const slug = decodeSegment(raw.slug);
  if (!year || !slug) notFound();
  if (year === EMPTY_PARAMS.year && slug === EMPTY_PARAMS.slug) redirect('/deployments');
  const post = getDeploymentPost(year, slug);
  if (!post) notFound();

  return (
    <main className="afterroll-desk min-h-screen px-[1.1rem] pb-[4rem] pt-[5.4rem] md:px-[2rem]">
      <article className="mx-auto max-w-[52rem]">
        <Link href="/deployments" className="afterroll-meta text-[0.78rem] text-[var(--atr-muted)]">← 배포 목록</Link>
        <header className="mt-[1rem] border-b border-[var(--atr-line)] pb-[1rem]">
          <p className="afterroll-meta text-[0.72rem] uppercase tracking-[0.12em] text-[var(--atr-accent)]">Deployment note</p>
          <div className="mt-[0.35rem] flex flex-wrap items-baseline gap-[0.65rem]"><h1 className="afterroll-title text-[2.2rem] leading-tight text-[var(--atr-text)]">{post.title}</h1><time className="afterroll-meta text-[0.75rem] text-[var(--atr-soft)]">{post.date}</time></div>
          {post.description ? <p className="afterroll-body mt-[0.55rem] text-[1rem] text-[var(--atr-muted)]">{post.description}</p> : null}
        </header>
        <section className="deployment-prose pt-[1.5rem]"><DeploymentMarkdown content={post.content} /></section>
        {post.privateUrl ? <ProtectedDeploymentContent privateUrl={post.privateUrl} /> : null}
        <section className="mt-[2.5rem] border-t border-[var(--atr-line)] pt-[1.5rem]">
          <h2 className="afterroll-title text-[1.45rem] text-[var(--atr-text)]">댓글</h2>
          <div className="mt-[1rem]"><FirebaseGuestbook collectionName={`afterTheRollDeploymentComments_${year}_${slug}`} placeholder="이 글에 대한 말을 남겨 주세요." emptyMessage="첫 댓글을 남겨 보세요." theme="afterroll" threaded likesEnabled /></div>
        </section>
      </article>
    </main>
  );
}
