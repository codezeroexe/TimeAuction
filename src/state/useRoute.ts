import { useSyncExternalStore } from 'react'
import { TR, play } from '../components/ui/motion.ts'
import { SFX } from '../components/ui/sfx.ts'
import type { Run } from '../game/types.ts'

const ROUTES = [
  'landing', 'register', 'lobby', 'match', 'auction', 'summary', 'log', 'twist', 'mission', 'solution',
  'results', 'leaderboard', 'feedback', 'replay', 'rules', 'admin', 'score', 'present', 'idle',
] as const
export type Route = (typeof ROUTES)[number]

/** `#/route` or `#/route/param`, e.g. `#/score/SUB-1A2B3C4D` or `#/admin/runs`. */
const parse = (): { route: Route; param: string | null } => {
  const [first, ...rest] = window.location.hash.replace(/^#\/?/, '').split('/')
  // `auctioneer` was renamed `present`; old links keep working.
  const r = first === 'auctioneer' ? 'present' : first
  return ROUTES.includes(r as Route) ? { route: r as Route, param: rest.length ? decodeURIComponent(rest.join('/')) : null } : { route: 'landing', param: null }
}

let loc = typeof window === 'undefined' ? { route: 'landing' as Route, param: null as string | null } : parse()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const commit = () => {
  // Re-read the hash so a transition that finishes late never restores a stale screen.
  loc = parse()
  emit()
  window.scrollTo(0, 0)
}
// One listener for the whole app. Auction and same-route (param) changes stay instant; everything else plays a transition.
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => {
  const next = parse()
  if (next.route === loc.route || next.route === 'auction' || loc.route === 'auction' || next.route === 'present' || loc.route === 'present') return commit()
  if (play(TR[next.route], commit, next.route === 'twist')) SFX.nav(TR[next.route])
})
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** Hash routing so the browser back button works between screens without a router dependency. */
export const useRoute = () => useSyncExternalStore(subscribe, () => loc)

export const hrefFor = (route: Route, param?: string) => (route === 'landing' ? '#' : `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}`)

export const navigate = (route: Route, param?: string) => {
  window.location.hash = hrefFor(route, param).slice(1)
}

/** Where a run currently stands. Screens redirect here when opened out of order. */
export function routeForRun(run: Run | null): Route {
  if (!run || !run.session || run.session.status === 'ready') return 'match'
  if (run.phase === 'setup') return 'match'
  if (run.phase === 'solution' && Object.values(run.solutions).some((s) => s?.submission)) return 'results'
  return run.phase
}
