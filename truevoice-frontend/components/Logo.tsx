export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <svg width="1.1em" height="1.1em" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M16 2 4 6v9c0 7 5 12 12 15 7-3 12-8 12-15V6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="m10.5 15.5 4 4 7.5-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      TrueVoice
    </span>
  );
}