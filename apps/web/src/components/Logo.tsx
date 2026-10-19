export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="NEXORA logo">
        <defs>
          <linearGradient id="nx-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6a5cff" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#nx-g)" />
        <path d="M20 46V18h5l14 19V18h5v28h-5L25 27v19z" fill="#fff" />
      </svg>
      {withText && (
        <span className="text-[15px] font-bold tracking-wide text-ink">
          NEXORA <span className="font-medium text-muted">BROWSER HUB</span>
        </span>
      )}
    </span>
  );
}
