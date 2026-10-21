/** Ringed-planet mark. The dot on the ring is `.lg-p` (orbits, speeds up when the parent link is hovered). */
export default function Logo({ size, ink = 'var(--color-ink)', accent = 'var(--color-accent)' }: { size: number; ink?: string; accent?: string }) {
  return (
    <svg viewBox="-36 -36 72 72" width={size} height={size} fill="none" aria-hidden="true" className="lg shrink-0">
      <g transform="rotate(-24)">
        <path d="M-30 0A30 10 0 0 1 30 0" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />
      </g>
      <circle r="15.5" fill={accent} />
      <path d="M-9 -9a13 13 0 0 1 14 -3" stroke="#fff" strokeOpacity=".55" strokeWidth="2.5" strokeLinecap="round" />
      <g transform="rotate(-24)">
        <path d="M-30 0A30 10 0 0 0 30 0" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />
        <g className="lg-p">
          <circle cx="30" r="4.5" fill={ink} />
        </g>
      </g>
    </svg>
  )
}
