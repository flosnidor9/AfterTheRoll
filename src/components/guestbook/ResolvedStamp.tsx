'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type ResolvedStampProps = {
  resolved: boolean;
};

const STAMP_ROTATION = -9;
const STAMP_INITIAL_SCALE = 1.25;
const STAMP_DURATION = 0.2;
const STAMP_OPACITY = 0.58;
const STAMP_CLASS_NAME = 'inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm border-4 border-double border-current px-3 py-2 text-2xl font-black leading-none tracking-widest text-[var(--atr-accent)] md:px-4 md:py-3 md:text-3xl';

export default function ResolvedStamp({ resolved }: ResolvedStampProps) {
  const reduceMotion = useReducedMotion();

  return (
    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end">
      <AnimatePresence initial={false}>
      {resolved && (
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, scale: STAMP_INITIAL_SCALE, rotate: STAMP_ROTATION }}
          animate={{ opacity: STAMP_OPACITY, scale: 1, rotate: STAMP_ROTATION }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : STAMP_DURATION }}
          className={STAMP_CLASS_NAME}
        >
          반영완료
        </motion.span>
      )}
      </AnimatePresence>
    </span>
  );
}
