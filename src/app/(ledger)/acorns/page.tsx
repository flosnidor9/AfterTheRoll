import AcornsSection from '@/components/acorns/AcornsSection';

export const dynamic = 'force-static';

export default function AcornsPage() {
  return (
    <main className="afterroll-desk min-h-screen px-[1.1rem] pb-[4rem] pt-[5.4rem] md:px-[2rem]">
      <div className="mx-auto max-w-[72rem]">
        <header className="mb-[1.5rem] border-b border-[var(--atr-line)] pb-[0.85rem]">
          <p className="afterroll-meta text-[0.74rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">Acorn List</p>
          <h1 className="afterroll-title mt-[0.18rem] text-[2.4rem] leading-none text-[var(--ledger-ink)]">
            도토리 목록
          </h1>
        </header>
        <AcornsSection />
      </div>
    </main>
  );
}
