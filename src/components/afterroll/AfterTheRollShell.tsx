'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CubeIcon,
  FaceSmileIcon,
  IdentificationIcon,
  PhotoIcon,
  SparklesIcon,
  TicketIcon,
} from '@heroicons/react/24/solid';
import AdminLoginButton from '@/components/log/AdminLoginButton';

const NAV_ITEMS = [
  { label: '성향표', href: '/', exact: true, icon: FaceSmileIcon },
  { label: '캘린더', href: '/calendar', exact: false, icon: CalendarDaysIcon },
  { label: '플레이 목록', href: '/plays', exact: false, icon: CubeIcon },
  { label: '도토리 목록', href: '/acorns', exact: false, icon: SparklesIcon },
  { label: '공수표 목록', href: '/promises', exact: false, icon: TicketIcon },
  { label: '캐릭터 목록', href: '/characters', exact: false, icon: IdentificationIcon },
  { label: '갤러리', href: '/gallery', exact: false, icon: PhotoIcon },
  { label: '로그', href: '/logs', exact: false, icon: BookOpenIcon },
  { label: '배포', href: '/deployments', exact: false, icon: ChatBubbleLeftRightIcon },
  { label: '방명록', href: '/guestbook', exact: false, icon: ChatBubbleLeftRightIcon },
] as const;

function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function getActiveItem(pathname: string) {
  const path = normalizePath(pathname);
  return NAV_ITEMS.find((item) => {
    if (item.exact) return path === item.href;
    if (item.href === '/logs') return path === item.href || path.startsWith('/archive');
    return path === item.href || path.startsWith(`${item.href}/`);
  }) ?? NAV_ITEMS[0];
}

function getBreadcrumbs(pathname: string, activeLabel: string) {
  const path = normalizePath(pathname);
  if (path.startsWith('/archive/read')) return ['AfterTheRoll', '로그', '본문'];
  if (path.startsWith('/deployments/read')) return ['AfterTheRoll', '배포', '본문'];
  return ['AfterTheRoll', activeLabel];
}

export default function AfterTheRollShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeItem = useMemo(() => getActiveItem(pathname), [pathname]);
  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname, activeItem.label), [activeItem.label, pathname]);

  return (
    <div className="atr-file-shell">
      <aside className="atr-file-sidebar" aria-label="AfterTheRoll navigation">
        <Link href="/" className="atr-file-brand"><span className="atr-folder-icon" aria-hidden="true" /><span>AfterTheRoll</span></Link>
        <nav className="atr-file-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === activeItem.href;
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} className={isActive ? 'atr-file-nav-item atr-file-nav-active' : 'atr-file-nav-item'}><Icon className="atr-file-nav-icon" aria-hidden="true" /><span>{item.label}</span>{isActive ? <motion.span layoutId="atr-file-active" className="atr-file-active-mark" /> : null}</Link>;
          })}
        </nav>
        <div className="atr-sidebar-section atr-sidebar-auth"><p>관리</p><AdminLoginButton /></div>
      </aside>
      <section className="atr-file-window">
        <header className="atr-file-titlebar"><div className="atr-window-dots" aria-hidden="true"><span /><span /><span /></div><div className="atr-pathbar" aria-label="현재 경로">{breadcrumbs.map((crumb, index) => <span key={`${crumb}-${index}`}>{index > 0 ? <b>/</b> : null}{crumb}</span>)}</div></header>
        <main className="atr-file-content">{children}</main>
        <footer className="atr-file-statusbar"><span>{activeItem.label}</span><span>개인 아카이브</span></footer>
      </section>
    </div>
  );
}
