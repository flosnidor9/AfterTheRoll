import LiveTrpgLogReader from '@/components/trpg/LiveTrpgLogReader';
import { Suspense } from 'react';

export const metadata = { title: '로그 | After the Roll' };
export default function LiveReadPage() {
  return <Suspense fallback={<p role="status" className="p-[2rem] text-sm">로그를 불러오는 중…</p>}><LiveTrpgLogReader /></Suspense>;
}
