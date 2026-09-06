import FirebaseGuestbook from '@/components/guestbook/FirebaseGuestbook';

export default function GuestbookPage() {
  return (
    <main className="relative min-h-screen pt-[5rem] pb-[4rem] flex justify-center">
      <div className="w-full max-w-[48rem] px-[1.5rem]">
        {/* 헤더 */}
        <header className="mb-[3rem]">
          <h1 className="font-serif text-[2.5rem] font-light text-black/90 tracking-wide mb-[0.5rem]">
            Guestbook
          </h1>
          <p className="text-[0.85rem] text-black/60">
            방문해줘서 고마워요
          </p>
        </header>

        <FirebaseGuestbook />
      </div>
    </main>
  );
}
