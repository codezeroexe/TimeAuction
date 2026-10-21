import type { ReactNode } from 'react'

export type RuleIconName =
  | 'register'
  | 'bid'
  | 'adapt'
  | 'engineer'
  | 'compete'
  | 'wallet'
  | 'auction'
  | 'twist'
  | 'mission'
  | 'scoring'
  | 'leaderboard'
  | 'clock'
  | 'pass'
  | 'increment'
  | 'lots'
  | 'team'
  | 'solution'
  | 'verify'

const ICONS: Record<RuleIconName, ReactNode> = {
  register: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16.2c.7-1.4 1.7-2.1 3-2.1s2.3.7 3 2.1" />
      <path d="M14.5 10h3.5M14.5 13.5h3.5" />
    </>
  ),
  bid: (
    <>
      <rect x="11" y="3.5" width="8" height="4.5" rx="1" transform="rotate(45 15 5.75)" />
      <path d="M11.5 9.5 5.5 17.5" />
      <rect x="2.5" y="17.5" width="11" height="4" rx="1" />
    </>
  ),
  adapt: (
    <>
      <path d="M3 12h4l2.5-4.5 3 9L15 12h3" />
      <path d="M16 9.5 18.5 12 16 14.5" />
    </>
  ),
  engineer: (
    <>
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 2v2.5M16 9h-2.5M9 16v-2.5M2 9h2.5M4.2 4.2l1.8 1.8M14 14l-1.8-1.8M4.2 13.8l1.8-1.8M13.8 4.2 12 6" />
      <path d="M14 14l6.5 6.5" />
      <path d="M16.5 12.5l2-2a3 3 0 0 0 4 4l-2 2z" />
    </>
  ),
  compete: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v1.5A3 3 0 0 0 7 10.5M17 6h3v1.5a3 3 0 0 1-3 3" />
      <path d="M12 14v3M9 17h6M8 20.5h8" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="5.5" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M16 14.5h2" />
    </>
  ),
  auction: (
    <>
      <rect x="12" y="4" width="8" height="4" rx="1" transform="rotate(-30 16 6)" />
      <path d="M12.5 8.5 7 14" />
      <rect x="3" y="16" width="18" height="5" rx="1.5" />
      <path d="M2.5 12.5h2.5M5 8.5l1.8 1.5" />
    </>
  ),
  twist: (
    <>
      <circle cx="12" cy="13.5" r="8" />
      <path d="M12 2.5v3M10 2.5h4" />
      <path d="M13.5 9.5 10 14h4l-3.5 4.5" />
    </>
  ),
  mission: (
    <>
      <circle cx="10" cy="14" r="6.5" />
      <path d="M3.5 14.5c4.5 2.5 11 0 15-4.5" />
      <path d="M18.5 2.5v9M18.5 2.5h3.5l-1 2 1 2h-3.5" />
    </>
  ),
  scoring: (
    <>
      <rect x="4" y="4.5" width="16" height="17" rx="2.5" />
      <path d="M9 2.5h6v3.5H9z" />
      <path d="M12 10.2l1.05 2.13 2.35.34-1.7 1.66.4 2.34L12 15.6l-2.1 1.07.4-2.34-1.7-1.66 2.35-.34z" />
    </>
  ),
  leaderboard: (
    <>
      <rect x="2.5" y="11" width="6" height="9.5" rx="1" />
      <rect x="9" y="6" width="6" height="14.5" rx="1" />
      <rect x="15.5" y="13.5" width="6" height="7" rx="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="13.5" r="8" />
      <path d="M12 13.5 14.5 16" />
      <path d="M10 2.5h4M12 2.5v3" />
      <path d="M18.5 6.5l1.5-1.5" />
    </>
  ),
  pass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  increment: (
    <>
      <path d="M12 19.5V5" />
      <path d="M6.5 10.5 12 5l5.5 5.5" />
      <path d="M19.5 2.5v5M17 5h5" />
    </>
  ),
  lots: (
    <>
      <path d="M12 3l9 4.5-9 4.5-9-4.5z" />
      <path d="M3 12l9 4.5 9-4.5" />
      <path d="M3 16.5l9 4.5 9-4.5" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
      <path d="M15 4.8a3.3 3.3 0 0 1 0 6.4" />
      <path d="M17 14.7c2 .6 3.3 2.4 3.5 5.3" />
    </>
  ),
  solution: (
    <path d="M4 9h3.5a2.5 2.5 0 1 1 5 0H16v3.5a2.5 2.5 0 1 1 0 5V20H4z" />
  ),
  verify: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
    </>
  ),
}

/** Line icon in the Lucide/Feather style. Colour follows `currentColor`; size comes from `className`. */
export function RuleIcon({ name, className }: { name: RuleIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICONS[name]}
    </svg>
  )
}
