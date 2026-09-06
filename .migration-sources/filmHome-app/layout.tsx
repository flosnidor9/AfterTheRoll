import type { Metadata } from 'next';
import '../globals.css';
import Providers from '@/components/providers/Providers';
import { OG_IMAGE_URLS, SITE_ORIGIN } from '@/lib/config/site';

export const metadata: Metadata = {
  metadataBase: SITE_ORIGIN,
  title: 'Film Home | Personal Archive',
  description: 'A film-like archive for scenes, logs, and images that drift over time.',
  openGraph: {
    title: 'Film Home | Personal Archive',
    description: 'A film-like archive for scenes, logs, and images that drift over time.',
    type: 'website',
    images: [OG_IMAGE_URLS.film],
  },
  twitter: {
    card: 'summary_large_image',
    images: [OG_IMAGE_URLS.film],
  },
};

export default function FilmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="film-fonts antialiased bg-[var(--film-bg)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
