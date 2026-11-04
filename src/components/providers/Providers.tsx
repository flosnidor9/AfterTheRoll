'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import FirebaseAnalytics from './FirebaseAnalytics';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FirebaseAnalytics />
      {children}
    </AuthProvider>
  );
}
