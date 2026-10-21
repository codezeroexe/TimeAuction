import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { useGame } from '../../state/GameContext.tsx'
import { useRoute, type Route } from '../../state/useRoute.ts'
import { sidesOf } from '../../game/auction.ts'
import { findSubmission } from '../../game/records.ts'
import { finalScore, scoreTotal } from '../../game/scoring.ts'
import { toast } from './toast.tsx'
import Rail from './Rail.tsx'
import Logo from './Logo.tsx'
import { isOn, subscribe, toggle } from './sfx.ts'
import { useEnterClass } from './useEnterClass.ts'

const CRUMBS: Record<Route, string> = {
  landing: 'home',
  register: 'register',
  lobby: 'lobby',
  match: 'match',
  auction: 'auction',
  summary: 'summary',
  log: 'bid log',
  twist: 'twist',
  mission: 'mission',
  solution: 'solution',
  results: 'results',
  leaderboard: 'leaderboard',
  feedback: 'feedback',
  replay: 'replay',
  rules: 'rules',
  admin: 'admin',
  score: 'score',
  present: 'Presentation',
  idle: 'Idle',
}

/** Light-mode frame shared by every participant screen. */
/** `fit`: a game screen that should fit the window without scrolling (scaled down when needed); long reading pages leave it off. */
export default function GameShell({ children, wide = false, fit = false }: { children: ReactNode; wide?: boolean; fit?: boolean }) {
  const { state, event, mode, mySide, isAdmin } = useGame()
  const { route } = useRoute()
  const player = state.player
  const session = state.run?.session
  const side = session ? (mySide ?? sidesOf(session)[0]) : null
  const unit = session && side ? session.sides[side] : undefined
  const width = wide ? 'max-w-7xl' : 'max-w-6xl'
  const main = useEnterClass<HTMLElement>()
  usePublishedNotice(event, state.gameId)
  const inner = useRef<HTMLDivElement>(null)
  useFit(fit, main, inner)

  return (
    <div className={`${fit ? 'fit-shell overflow-hidden' : 'page-shell'} bg-paper pb-[62px] text-ink selection:bg-accent/15 md:grid md:grid-cols-[84px_minmax(0,1fr)] md:pb-0`}>
      <Rail />
      <div className={`flex min-w-0 flex-col ${fit ? 'min-h-0' : ''}`}>
        <header className="sticky top-0 z-30 h-[60px] border-b border-line bg-paper/70 backdrop-blur">
          <div className="flex h-full items-center gap-3.5 px-5 sm:px-9">
            <a href={player ? '#/lobby' : '#'} className="flex items-center gap-2 font-display text-[21px] leading-none md:hidden" aria-label={player ? 'TimeAuction mission lobby' : 'TimeAuction home'}>
              <Logo size={30} />
              <span>
                Time<em className="text-accent">Auction</em>
              </span>
            </a>
            <span className="hidden min-w-0 truncate border-l border-line-strong pl-3.5 font-mono text-[13px] text-muted sm:block">
              timeauction / <b className="font-medium text-ink">{CRUMBS[route]}</b>
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-3 sm:gap-5">
              <ConnectionBadge />
              {player && (
                <dl className="flex items-center gap-5 text-sm">
                  <div className="hidden md:block">
                    <dt className="sr-only">{unit ? 'Unit' : player.team ? 'Team' : 'Player'}</dt>
                    <dd className="max-w-[16ch] truncate text-ink-soft">{unit?.name ?? player.team?.name ?? player.name}</dd>
                  </div>
                  <div className="chip chip-wal">
                    <span aria-hidden="true">◈</span>
                    <dt className="text-xs tracking-wide text-muted uppercase">
                      <span className="hidden sm:inline">Balance</span>
                      <span className="sm:hidden">CC</span>
                    </dt>
                    {unit ? <Balance value={unit.wallet.balance} /> : <dd className="font-mono text-muted">—</dd>}
                  </div>
                </dl>
              )}
            </div>
          </div>
        </header>
        {mySide && unit && (
          <p className="border-t border-line bg-accent-soft px-5 py-2 text-center text-[13px] text-accent sm:px-8">
            This station controls <strong className="font-semibold">Side {mySide} · {unit.name}</strong>. The other side is played from another station.
          </p>
        )}
        <main ref={main} className={`mx-auto ${width} w-full flex-1 px-5 sm:px-9 ${fit ? 'min-h-0 overflow-y-auto py-5 sm:py-6' : 'py-8 sm:py-12'}`}>
          {fit ? <div ref={inner}>{children}</div> : children}
        </main>
        <footer className={`border-t border-line ${fit ? 'hidden' : ''}`}>
          <nav aria-label="Secondary" className={`mx-auto flex ${width} w-full flex-wrap gap-x-6 gap-y-2 px-5 py-5 text-sm text-muted sm:px-9`}>
            <a href="#/rules" className="hover:text-ink">Rules</a>
            <a href="#/leaderboard" className="hover:text-ink">Leaderboard</a>
            {(mode === 'local' || isAdmin) && <a href="#/admin" className="hover:text-ink">Event administration</a>}
            <SoundToggle />
            <span className="sm:ml-auto">
              {mode === 'remote' ? 'Results are recorded by the event server' : 'Single-device mode · results stored on this device'}
            </span>
          </nav>
        </footer>
      </div>
    </div>
  )
}

const MIN_FIT = 0.72

/** Scales `inner` (CSS zoom, Chromium) so its natural height fits `main`; below MIN_FIT it stays at MIN_FIT and main scrolls. */
function useFit(fit: boolean, main: RefObject<HTMLElement | null>, inner: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const m = main.current
    const el = inner.current
    if (!fit || !m || !el) return
    const run = () => {
      const cs = getComputedStyle(m)
      const avail = m.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      el.style.zoom = '1' // measure unzoomed so there is no feedback loop
      const natural = el.offsetHeight
      const s = natural > avail && natural > 0 ? Math.max(MIN_FIT, avail / natural) : 1
      el.style.zoom = s === 1 ? '' : String(Math.floor(s * 1000) / 1000)
    }
    run()
    const ro = new ResizeObserver(run)
    ro.observe(m)
    ro.observe(el)
    // children changing height while zoom is applied still trigger el's observer; the reset-measure-set cycle settles in one pass
    return () => {
      ro.disconnect()
      el.style.zoom = ''
    }
  }, [fit, main, inner])
}

function SoundToggle() {
  const on = useSyncExternalStore(subscribe, isOn)
  return (
    <button type="button" aria-pressed={on} onClick={() => void toggle()} className="hover:text-ink">
      Sound: {on ? 'on' : 'off'}
    </button>
  )
}

/** The balance is always shown exactly; a change is explained by a short note beside it, never by animating the number. */
function Balance({ value }: { value: number }) {
  const prev = useRef(value)
  const [delta, setDelta] = useState<{ id: number; amount: number } | null>(null)
  useEffect(() => {
    if (value !== prev.current) {
      const amount = value - prev.current
      prev.current = value
      setDelta((d) => ({ id: (d?.id ?? 0) + 1, amount }))
    }
  }, [value])
  return (
    <dd className="relative font-semibold tabular-nums">
      {value.toLocaleString()} CC
      {delta && (
        <span key={delta.id} aria-hidden="true" className={`delta absolute top-full right-0 mt-0.5 text-xs font-medium whitespace-nowrap ${delta.amount < 0 ? 'text-danger' : 'text-success'}`}>
          {delta.amount < 0 ? '−' : '+'}
          {Math.abs(delta.amount).toLocaleString()} CC
        </span>
      )}
    </dd>
  )
}

function ConnectionBadge() {
  const { mode, connection } = useGame()
  const prev = useRef(connection)
  useEffect(() => {
    if (prev.current === 'online' && connection === 'reconnecting') toast('Connection to the event server lost. Retrying; nothing you do is recorded until it returns.', 'danger')
    if (prev.current === 'reconnecting' && connection === 'online') toast('Reconnected. Showing the latest confirmed state.', 'success')
    prev.current = connection
  }, [connection])

  if (mode === 'local')
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted sm:inline-flex" title="No event server: this device is its own authority">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <rect x="1.5" y="2" width="9" height="6.5" rx="1" />
          <path d="M4 10.5h4" strokeLinecap="round" />
        </svg>
        Single device
      </span>
    )
  const online = connection === 'online'
  return (
    <span role="status" className={`chip chip-dot ${online ? '' : 'chip-hot'}`}>
      {online ? (
        <>
          <span className="sm:hidden">Live</span>
          <span className="hidden sm:inline">Live · event server</span>
        </>
      ) : (
        'Reconnecting…'
      )}
    </span>
  )
}

/** Tells the participant, once, when one of their scores is published. */
function usePublishedNotice(ev: ReturnType<typeof useGame>['event'], gameId: string | null) {
  const scores = ev.scores
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    const published = Object.values(scores).filter((s) => s.gameId === gameId && s.status === 'published')
    if (seen.current) {
      for (const s of published) if (!seen.current.has(s.submissionId)) {
        const sub = findSubmission(ev, s.submissionId)?.submission
        toast(`Your score has been published: ${sub ? finalScore(s.entries, sub) : scoreTotal(s.entries)} (rubric ${scoreTotal(s.entries)} / 100 plus tool points).`, 'success')
      }
    }
    seen.current = new Set(published.map((s) => s.submissionId))
  }, [scores, ev, gameId])
}
