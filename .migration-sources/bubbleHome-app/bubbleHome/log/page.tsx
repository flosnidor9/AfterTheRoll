import FirebaseLogSection from '@/components/log/FirebaseLogSection';

export default function LogPage() {
  return (
    <main className="relative min-h-screen pt-[5rem] pb-[4rem] flex justify-center">
      <div className="w-full max-w-[38rem] px-[1rem]">
        {/* 헤더 */}
        <header className="mb-[3rem]">
          <h1 className="font-serif text-[2.5rem] font-light text-black/90 tracking-wide mb-[0.5rem]">
            Log
          </h1>
          <p className="text-[0.85rem] text-black/60">
            일상의 조각들
          </p>
        </header>

        <FirebaseLogSection />
      </div>
    </main>
  );
}
