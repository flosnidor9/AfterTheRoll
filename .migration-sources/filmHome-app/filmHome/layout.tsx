'use client';

import { ReactNode } from 'react';
import { MusicPlayerProvider } from '@/contexts/MusicPlayerContext';
import { AuthProvider } from '@/contexts/AuthContext';
import GlobalMusicPlayer from '@/components/music-player/GlobalMusicPlayer';
import FilmGNB from '@/components/layout/FilmGNB';
import { filmHomeTrack } from '@/lib/data/music';

export default function FilmHomeLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <MusicPlayerProvider track={filmHomeTrack}>
        <FilmGNB />
        <GlobalMusicPlayer />
        {children}
      </MusicPlayerProvider>
    </AuthProvider>
  );
}
