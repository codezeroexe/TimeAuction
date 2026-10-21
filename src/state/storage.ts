import { DEFAULT_DISPLAY, DEFAULT_SHOW, emptyEvent, mergeDisplay } from '../game/event.ts'
import { makeId } from '../game/ids.ts'
import { RULESETS } from '../game/rules.ts'
import { SHOW_STAGES, type EventState, type Lot, type Participant, type Run, type Session, type ShowState } from '../game/types.ts'

export const STORAGE_KEY = 'timeauction:game'

export type LoadResult =
  | { kind: 'ok'; state: EventState; migratedFrom?: number }
  | { kind: 'corrupt'; raw: string; error: string }

/** v4 sessions have no lot phase and no intro/result timings: fill them with the defaults (open lots are bidding, decided lots are decided). */
function upgradeSession(session: Session): Session {
  const base = RULESETS[session.rules.id] ?? RULESETS.normal
  const lots: Lot[] = session.lots.map((l) => ({ ...l, phase: l.phase ?? (l.status === 'pending' ? 'intro' : l.status === 'open' ? 'open' : 'decided') }))
  return {
    ...session,
    rules: { ...session.rules, introSeconds: session.rules.introSeconds ?? base.introSeconds, nextLotSeconds: session.rules.nextLotSeconds ?? base.nextLotSeconds },
    lots,
  }
}

const upgradeRun = (r: Run): Run => (r.session ? { ...r, session: upgradeSession(r.session) } : r)

/** Upgrades v1/v2 single-player saves into a v6 event, and v3–v5 events to v6 (sessions get lot phases and timings; the projector show state gets its default). Returns null when the shape is unrecognisable. */
export function migrate(raw: unknown, at: string): { state: EventState; from?: number } | null {
  const s = raw as Record<string, unknown> | null
  if (!s || typeof s !== 'object') return null
  if (s.version === 3 || s.version === 4 || s.version === 5 || s.version === 6) {
    const ev = s as unknown as EventState
    const valid =
      typeof ev.eventId === 'string' &&
      Array.isArray(ev.participants) &&
      ev.participants.every((p) => p && typeof p.gameId === 'string' && p.player && Array.isArray(p.pastRuns)) &&
      typeof ev.scores === 'object' && ev.scores !== null &&
      Array.isArray(ev.feedback) &&
      Array.isArray(ev.audit) &&
      typeof ev.settings === 'object' && ev.settings !== null
    if (!valid) return null
    const participants = ev.participants.map((p: Participant) => ({ ...p, run: p.run ? upgradeRun(p.run) : null, pastRuns: p.pastRuns.map(upgradeRun) }))
    let show: ShowState = ev.show && SHOW_STAGES.includes(ev.show.stage) ? ev.show : { ...DEFAULT_SHOW }
    if (show.display !== undefined) {
      const fit = mergeDisplay(DEFAULT_DISPLAY, show.display)
      if (fit) show = { ...show, display: fit }
      else {
        show = { ...show }
        delete show.display
      }
    }
    return { state: { ...ev, version: 6, participants, show }, from: s.version === 6 ? undefined : (s.version as number) }
  }
  if (s.version === 1 || s.version === 2) {
    const base = emptyEvent(at)
    const player = s.player as Participant['player'] | undefined
    if (!player) return { state: base, from: s.version as number }
    const p: Participant = {
      gameId: (s.gameId as string | undefined) ?? player.id ?? makeId('GAME'),
      player,
      run: (s.run as Participant['run']) ?? null,
      pastRuns: (s.pastRuns as Participant['pastRuns']) ?? [],
    }
    if (!Array.isArray(p.pastRuns)) return null
    return { state: { ...base, participants: [{ ...p, run: p.run ? upgradeRun(p.run) : null, pastRuns: p.pastRuns.map(upgradeRun) }], activeGameId: p.gameId }, from: s.version as number }
  }
  return null
}

/** Never silently replaces unreadable data: a corrupt save is reported so the user can choose what to do. */
export function loadEvent(read: () => string | null = () => localStorage.getItem(STORAGE_KEY), at = new Date().toISOString()): LoadResult {
  let raw: string | null
  try {
    raw = read()
  } catch {
    return { kind: 'ok', state: emptyEvent(at) } // storage unavailable: play this session in memory
  }
  if (!raw) return { kind: 'ok', state: emptyEvent(at) }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { kind: 'corrupt', raw, error: `Saved data is not valid JSON (${(e as Error).message}).` }
  }
  const m = migrate(parsed, at)
  if (!m) return { kind: 'corrupt', raw, error: 'Saved data has an unrecognised shape or version.' }
  // A reload is an unmount: any live lot resumes paused so no time passes unseen.
  for (const p of m.state.participants) {
    const lot = p.run?.session?.lots[p.run.session.current]
    if (lot?.running) lot.running = false
  }
  return { kind: 'ok', state: m.state, migratedFrom: m.from }
}

export function saveEvent(state: EventState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable (private mode / quota); the game still runs for this session.
  }
}
