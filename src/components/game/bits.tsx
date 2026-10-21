import type { ReactNode } from 'react'
import { sidesOf } from '../../game/auction.ts'
import type { GameUnit, MatchType, Session, SideId } from '../../game/types.ts'

export const MATCH_LABELS: Record<MatchType, string> = {
  ivi: 'Individual vs Individual',
  tvt: 'Team vs Team',
  ivt: 'Individual vs Team',
  ivbot: 'Individual vs ChronoBot',
  tvbot: 'Team vs ChronoBot',
  multi: 'Free-for-all',
}

export const matchTypeLabel = (matchType: MatchType, sideCount: number) =>
  matchType === 'multi' ? `Free-for-all (${sideCount})` : MATCH_LABELS[matchType]

/** Names the match from the first seat's point of view, e.g. "Team vs Individual". */
export function matchLabel(s: Pick<Session, 'matchType' | 'sides'>) {
  const kind = (u: GameUnit) => (u.kind === 'bot' ? 'ChronoBot' : u.kind === 'team' ? 'Team' : 'Individual')
  if (s.matchType === 'multi') return matchTypeLabel(s.matchType, sidesOf(s).length)
  const [first, second] = sidesOf(s).map((id) => s.sides[id])
  return s.matchType === 'ivt' ? `${kind(first)} vs ${kind(second)}` : MATCH_LABELS[s.matchType]
}

export { isHotSeat } from '../../game/auction.ts'

/** The side a screen speaks for: this station's own side, else the first seat (hot-seat and spectators). */
export const speakingSide = (s: Pick<Session, 'sides'>, mySide: SideId | null): SideId => mySide ?? sidesOf(s)[0]

/** Side marker: A is solid ink, B is outlined, so the two sides read apart without a second accent colour. */
export function SideBadge({ side, className = '' }: { side: SideId; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-[4px] text-[11px] font-semibold ${
        side === 'A' ? 'bg-ink text-white' : 'border border-ink text-ink'
      } ${className}`}
    >
      {side}
    </span>
  )
}

export function UnitName({ unit, you }: { unit: GameUnit; you?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <SideBadge side={unit.id} />
      <span className="truncate font-medium">{unit.name}</span>
      {you && <span className="text-xs text-muted">(you)</span>}
    </span>
  )
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'danger' }) {
  const tones = {
    neutral: 'border-line-strong text-ink-soft',
    accent: 'border-accent/40 bg-accent-soft text-accent',
    success: 'border-success/30 bg-success/5 text-success',
    danger: 'border-danger/30 bg-danger-soft text-danger',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`lbl ${className}`}>{children}</h2>
}

export const cc = (n: number) => `${n.toLocaleString()} CC`
