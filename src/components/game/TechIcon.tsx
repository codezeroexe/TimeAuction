import type { ReactNode } from 'react'
import type { TechIcon as Name } from '../../game/types.ts'

/** One authored icon set: 24px grid, 1.5 stroke, round joins. */
const PATHS: Record<Name, ReactNode> = {
  electricity: <path d="M13 2.5 5.5 13.5h5.5l-1 8 7.5-11h-5.5l1-8Z" />,
  battery: (
    <>
      <rect x="3" y="7" width="16" height="10" rx="2" />
      <path d="M21 10.5v3M7 10v4M10.5 10v4M14 10v4" />
    </>
  ),
  robotics: (
    <>
      <path d="M4 21h8M8 21v-3l3.5-6.5" />
      <circle cx="12" cy="11" r="1.6" />
      <path d="M13.2 10l4.3-3.5M17.5 6.5l2 1.5M17.5 6.5l1-2.3" />
      <circle cx="8" cy="18" r="1.2" />
    </>
  ),
  gps: (
    <>
      <path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </>
  ),
  ai: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21" />
      <path d="M10 14l2-4 2 4M10.6 12.8h2.8" />
    </>
  ),
  comms: (
    <>
      <path d="M12 21v-9M9 21h6" />
      <circle cx="12" cy="9" r="1.5" />
      <path d="M8.5 6.5a5 5 0 0 0 0 5M15.5 6.5a5 5 0 0 1 0 5M5.5 3.5a9 9 0 0 0 0 10.5M18.5 3.5a9 9 0 0 1 0 10.5" />
    </>
  ),
  life: (
    <>
      <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
      <path d="M5 19l8-8" />
    </>
  ),
  shelter: (
    <>
      <path d="M3 20h18" />
      <path d="M5 20v-6a7 7 0 0 1 14 0v6" />
      <path d="M9.5 20v-4h5v4" />
    </>
  ),
}

export default function TechIcon({ name, className = 'h-6 w-6' }: { name: Name; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
