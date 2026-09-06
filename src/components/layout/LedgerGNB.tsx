'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { label: 'Calendar', href: '/', exact: true },
  { label: 'Logs', href: '/logs', exact: false },
  { label: 'Plays', href: '/plays', exact: false },
];

export default function LedgerGNB() {
  const pathname = usePathname();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-[var(--atr-line)] bg-[rgba(2,7,6,0.76)] px-[0.8rem] py-[0.65rem] backdrop-blur-[1rem] md:px-[2rem]">
      <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-[1rem]">
        <Link
          href="/"
          className="afterroll-meta shrink-0 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--atr-accent)]"
        >
          Afterimage Archive
        </Link>
        <ul className="flex items-center gap-[0.35rem] md:gap-[0.55rem]">
        {NAV_ITEMS.map(({ label, href, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith('/archive');

          return (
            <li key={href} className="relative">
              <Link
                href={href}
                className="afterroll-note relative inline-flex h-[2rem] items-center rounded-[0.25rem] border px-[0.72rem] text-[0.72rem] uppercase tracking-[0.12em] transition-colors duration-200 md:px-[0.9rem]"
                style={{
                  borderColor: isActive ? 'var(--atr-line-strong)' : 'var(--atr-line)',
                  color: isActive ? 'var(--atr-accent)' : 'var(--atr-muted)',
                  background: hoveredHref === href || isActive ? 'rgba(88, 125, 163, 0.075)' : 'rgba(245, 248, 251, 0.72)',
                  boxShadow: isActive ? '0 0 1rem rgba(88, 125, 163, 0.16)' : 'none',
                }}
                onMouseEnter={() => setHoveredHref(href)}
                onMouseLeave={() => setHoveredHref(null)}
              >
                {label}

                {isActive ? (
                  <motion.span
                    layoutId="ledger-nav-active"
                    className="absolute inset-x-[0.45rem] bottom-[0.22rem] h-[0.08rem] rounded-full bg-[var(--atr-accent)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                ) : null}

                {!isActive && hoveredHref === href ? (
                  <motion.span
                    layoutId="ledger-nav-hover"
                    className="absolute inset-x-[0.5rem] bottom-[0.24rem] h-[0.06rem] rounded-full bg-[var(--atr-accent-2)]"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    exit={{ scaleX: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
        </ul>
      </div>
    </nav>
  );
}
