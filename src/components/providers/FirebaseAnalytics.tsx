'use client';

import { useEffect } from 'react';
import { app } from '@/lib/firebase';

export default function FirebaseAnalytics() {
  useEffect(() => {
    let cancelled = false;

    async function initializeAnalytics() {
      const { getAnalytics, isSupported } = await import('firebase/analytics');

      if (await isSupported() && !cancelled) {
        getAnalytics(app);
      }
    }

    void initializeAnalytics().catch((error: unknown) => {
      console.warn('Firebase Analytics initialization failed:', error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
