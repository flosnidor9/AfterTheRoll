import type { Metadata } from 'next';
import '../globals.css';
import PersistentHeroBackground from '@/components/hero/PersistentHeroBackground';
import { getMainHomeImagePaths } from '@/lib/data/images';
import Providers from '@/components/providers/Providers';
import { OG_IMAGE_URLS, SITE_ORIGIN } from '@/lib/config/site';

export const metadata: Metadata = {
  metadataBase: SITE_ORIGIN,
  title: 'Personal Archive',
  description: 'A personal archive for keeping, revisiting, and dwelling with collected work.',
  openGraph: {
    title: 'Personal Archive',
    description: 'A personal archive for keeping, revisiting, and dwelling with collected work.',
    type: 'website',
    images: [OG_IMAGE_URLS.main],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Personal Archive',
    description: 'A personal archive for keeping, revisiting, and dwelling with collected work.',
    images: [OG_IMAGE_URLS.main],
  },
};

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const imagePaths = getMainHomeImagePaths();

  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Inter:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>
          <PersistentHeroBackground imagePaths={imagePaths} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
