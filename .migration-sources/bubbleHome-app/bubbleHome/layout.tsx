'use client';

import { ReactNode } from 'react';
import { MusicPlayerProvider } from '@/contexts/MusicPlayerContext';
import GlobalMusicPlayer from '@/components/music-player/GlobalMusicPlayer';
import { bubbleHomeTrack } from '@/lib/data/music';

export default function BubbleHomeLayout({ children }: { children: ReactNode }) {
  return (
    <MusicPlayerProvider track={bubbleHomeTrack}>
      <GlobalMusicPlayer />
      {children}
    </MusicPlayerProvider>
  );
}
