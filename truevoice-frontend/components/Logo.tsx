export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-bold tracking-tight ${className}`}>
      <svg
        viewBox="0 0 64 64"
        className="h-[1.65em] w-[1.65em] shrink-0 drop-shadow-[0_1px_2px_rgba(30,6,16,0.5)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="tv-champagne-bright" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5e3c8" />
            <stop offset="50%" stopColor="#d9bc98" />
            <stop offset="100%" stopColor="#a7835c" />
          </linearGradient>
          <linearGradient id="tv-champagne-mid" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ebd3b0" />
            <stop offset="55%" stopColor="#c5a179" />
            <stop offset="100%" stopColor="#8b6543" />
          </linearGradient>
          <linearGradient id="tv-burgundy-accent" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9d4262" />
            <stop offset="55%" stopColor="#6e1f3d" />
            <stop offset="100%" stopColor="#3b0d1f" />
          </linearGradient>
        </defs>

        {/* Right intertwined shield loop */}
        <path
          d="M32 54 C46 44 53 32 52 17 C51 11 43 9 36 13 C28 18 21 26 17 35"
          fill="none"
          stroke="#3b0d1f"
          strokeWidth="8.5"
          strokeLinecap="round"
        />
        <path
          d="M32 54 C46 44 53 32 52 17 C51 11 43 9 36 13 C28 18 21 26 17 35"
          fill="none"
          stroke="url(#tv-champagne-mid)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />

        {/* Left intertwined shield loop */}
        <path
          d="M32 54 C18 44 11 32 12 17 C13 11 21 9 28 13 C36 18 43 26 47 35"
          fill="none"
          stroke="#3b0d1f"
          strokeWidth="8.5"
          strokeLinecap="round"
        />
        <path
          d="M32 54 C18 44 11 32 12 17 C13 11 21 9 28 13 C36 18 43 26 47 35"
          fill="none"
          stroke="url(#tv-champagne-bright)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />

        {/* Bold diagonal checkmark weaving through the shield */}
        <path
          d="M21 27 L30 37 L56 10"
          fill="none"
          stroke="#3b0d1f"
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21 27 L30 37 L56 10"
          fill="none"
          stroke="url(#tv-champagne-bright)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21 27 L30 37 L56 10"
          fill="none"
          stroke="url(#tv-burgundy-accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.45"
        />
      </svg>
      TrueVoice
    </span>
  );
}