'use client';

type ResolutionButtonProps = {
  resolved: boolean;
  pending: boolean;
  onToggle: () => void;
  className: string;
};

export default function ResolutionButton({ resolved, pending, onToggle, className }: ResolutionButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={resolved}
      aria-label={resolved ? '반영완료 도장 해제' : '반영완료 도장찍기'}
      aria-busy={pending}
      className={className}
    >
      {resolved ? '해제' : '도장찍기'}
    </button>
  );
}
