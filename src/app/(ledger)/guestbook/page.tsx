import FirebaseGuestbook from '@/components/guestbook/FirebaseGuestbook';

export const dynamic = 'force-static';

export default function AfterTheRollGuestbookPage() {
  return (
    <main className="afterroll-desk min-h-screen px-[1.1rem] pb-[4rem] pt-[5.4rem] md:px-[2rem]">
      <div className="mx-auto max-w-[52rem]">
        <header className="mb-[1.5rem] flex flex-wrap items-end justify-between gap-[0.85rem] border-b border-[var(--atr-line)] pb-[0.85rem]">
          <div>
            <p className="afterroll-meta text-[0.74rem] uppercase tracking-[0.14em] text-[var(--ledger-soft)]">Guestbook</p>
            <h1 className="afterroll-title mt-[0.18rem] text-[2.4rem] leading-none text-[var(--ledger-ink)]">
              방명록
            </h1>
          </div>
        </header>

        <FirebaseGuestbook
          collectionName="afterTheRollGuestbook"
          placeholder="방문해주셔서 감사해요"
          emptyMessage="아직 남겨진 흔적이 없습니다"
          theme="afterroll"
          canDeleteWhenSignedIn
        />
      </div>
    </main>
  );
}
