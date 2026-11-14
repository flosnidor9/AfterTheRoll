'use client';

import Image from 'next/image';
import { memo, useCallback, type SyntheticEvent } from 'react';

type Props = {
  src: string;
  alt: string;
  className: string;
  onLoaded: (source: string) => void;
  onFailed: (source: string) => void;
  onRatio?: (source: string, ratio: number) => void;
};

// Next Image reassigns img.src when its error-handler ref changes. Keep both
// handlers stable so unrelated scene updates cannot restart GIF/APNG playback.
export default memo(function CinematicSceneImage({ src, alt, className, onLoaded, onFailed, onRatio }: Props) {
  const handleLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    onLoaded(src);
    const image = event.currentTarget;
    if (onRatio && image.naturalWidth > 0) onRatio(src, image.naturalHeight / image.naturalWidth);
  }, [src, onLoaded, onRatio]);
  const handleError = useCallback(() => onFailed(src), [src, onFailed]);

  return <Image src={src} alt={alt} fill sizes="100vw" unoptimized className={className} onLoad={handleLoad} onError={handleError} />;
});
