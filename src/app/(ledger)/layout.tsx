import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '../globals.css';
import Providers from '@/components/providers/Providers';
import AfterTheRollShell from '@/components/afterroll/AfterTheRollShell';
import { SITE_ORIGIN } from '@/lib/config/site';
import { getTendencyOgImageUrl } from '@/lib/config/tendencyOgImage';

const ongleipKonkon = localFont({
  variable: '--font-hand',
  src: '../fonts/ongleip-konkon.ttf',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const ogImage = await getTendencyOgImageUrl();

  return {
    metadataBase: SITE_ORIGIN,
    title: 'After the Roll | Personal Archive',
    description: 'A quieter archive for TRPG notes, logs, and after-session records.',
    openGraph: {
      title: 'After the Roll | Personal Archive',
      description: 'A quieter archive for TRPG notes, logs, and after-session records.',
      type: 'website',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImage],
    },
  };
}

export default function LedgerLayout({
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
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${ongleipKonkon.variable} after-roll-theme antialiased`}>
        <Providers>
          <AfterTheRollShell>{children}</AfterTheRollShell>
        </Providers>
      </body>
    </html>
  );
}
