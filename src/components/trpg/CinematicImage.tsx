'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

type Props = {
  src: string;
  alt: string;
  onComplete: () => void;
};

const FADE_SECONDS = 0.2;

export default function CinematicImage({ src, alt, onComplete }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reducedMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 z-20 bg-[#17191c]" aria-label="로그 이미지 장면">
      <motion.figure
        initial={{ opacity: 0 }}
        animate={{ opacity: status === 'ready' ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : FADE_SECONDS }}
        className="absolute inset-x-4 bottom-20 top-20 md:inset-x-[6vw] md:bottom-24 md:top-24"
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="100vw"
          unoptimized
          className="object-contain"
          onLoad={() => { setStatus('ready'); onComplete(); }}
          onError={() => { setStatus('error'); onComplete(); }}
        />
      </motion.figure>
      {status !== 'ready' && <p role="status" className="absolute inset-x-4 top-1/2 text-center text-sm text-stone-300">
        {status === 'loading' ? '이미지 불러오는 중…' : '이미지를 불러오지 못했습니다. 다음으로 넘겨 주세요.'}
      </p>}
      <p className="absolute inset-x-4 bottom-6 text-center text-xs text-stone-400">클릭·터치 또는 → 키로 다음</p>
    </div>
  );
}
