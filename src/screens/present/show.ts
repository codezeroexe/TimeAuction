import type { rooms } from '../../game/event.ts'
import { SHOW_STAGES, type ShowDisplay, type ShowStage } from '../../game/types.ts'
import type { Kind } from '../../components/ui/motion.ts'

/** One match as the screens see it. `room` is the session ID that `show.focus` names. */
export type Room = ReturnType<typeof rooms>[number]

export type View<T> = { kind: 'focus'; room: T } | { kind: 'grid'; rooms: T[] } | { kind: 'none' }

/** What a screen shows: the named room; else the only candidate; else a grid of candidates; else nothing. */
export function pickView<T extends { room: string }>(all: T[], focus: string | null, candidates: T[]): View<T> {
  const named = focus ? all.find((r) => r.room === focus) : undefined
  if (named) return { kind: 'focus', room: named }
  if (candidates.length === 1) return { kind: 'focus', room: candidates[0] }
  if (candidates.length > 1) return { kind: 'grid', rooms: candidates }
  return { kind: 'none' }
}

/** Room n: position in the event's room order (oldest match first). */
export const roomNumber = (all: Room[], room: string) => all.findIndex((r) => r.room === room) + 1

export const STAGE_LABELS: Record<ShowStage, string> = {
  welcome: 'Welcome',
  rules: 'Rules',
  join: 'How to join',
  teams: 'Teams',
  matchups: 'Matchups',
  auction: 'Auction',
  twist: 'Twist',
  results: 'Results',
}

/** Transition into each stage (see motion.ts). */
export const STAGE_FX: Record<ShowStage, Kind> = {
  welcome: 'rain',
  rules: 'type',
  join: 'radar',
  teams: 'blinds',
  matchups: 'iris',
  auction: 'shutter',
  twist: 'tear',
  results: 'rise',
}

/** One stage forward or back, stopping at either end. */
export function stepStage(stage: ShowStage, dir: 1 | -1): ShowStage {
  const i = SHOW_STAGES.indexOf(stage)
  return SHOW_STAGES[Math.min(SHOW_STAGES.length - 1, Math.max(0, i + dir))]
}

/** Base projector zoom; the host's fit scales it. Same value as the fallback in `.present` (index.css). */
export const PRESENT_ZOOM = 1.25
export function displayVars(d: Omit<ShowDisplay, 'guides'>): Record<string, string> {
  return { '--present-zoom': String((PRESENT_ZOOM * d.scale) / 100), '--safe-t': `${d.top}vh`, '--safe-r': `${d.right}vw`, '--safe-b': `${d.bottom}vh`, '--safe-l': `${d.left}vw` }
}
