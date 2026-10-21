import { useEffect, useRef, useState } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import TechIcon from '../components/game/TechIcon.tsx'
import { cc, isHotSeat, Label, matchLabel, SideBadge, speakingSide, Tag, UnitName } from '../components/game/bits.tsx'
import { Activity, BidderTable, Clock, Progress, TechTitle, useLotFx } from '../components/game/auction.tsx'
import { atPortfolioCap, bidBlocker, currentLot, isLastLot, nextValidBid, openingBid, portfolioCap, sidesOf, techNeed } from '../game/auction.ts'
import { getTech } from '../data/technologies.ts'
import type { Session, SideId, Technology } from '../game/types.ts'
import { useGame, type ActionResult } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'

export default function Auction() {
  const game = useGame()
  const { state } = game
  const session = state.run?.session
  const [feedback, setFeedback] = useState<(ActionResult & { lot: number }) | null>(null)

  // Interval reads the latest actions through a ref so it is created once per running lot, never duplicated.
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })

  const lot = session ? currentLot(session) : null
  // Any countdown (intro, bidding, result pause) runs on the server; this device only redraws it.
  const running = !!lot?.running
  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const t = performance.now()
      gameRef.current.tickClock(t - last)
      last = t
    }, 200)
    return () => window.clearInterval(id)
  }, [running, session?.sessionId, session?.current])

  useEffect(() => {
    if (!state.player) navigate('register')
    else if (routeForRun(state.run) !== 'auction') navigate(routeForRun(state.run))
  }, [state.player, state.run])

  const mine: SideId | null = game.mySide ?? (session && !isHotSeat(session) ? sidesOf(session)[0] : null)
  const outbid = useLotFx(session?.current ?? -1, lot?.status, lot?.leader ?? null, mine)

  if (!session || !lot || session.status !== 'live') return null

  const tech = getTech(lot.techId)
  const hot = isHotSeat(session, game.mySide)
  const seats = sidesOf(session)
  // Two sides keep one panel per side (hot-seat or two stations). Bigger matches show this station's side and a bidder table.
  const many = seats.length > 2
  const speaking = speakingSide(session, game.mySide)
  const urgent = lot.status === 'open' && lot.phase === 'open' && Math.ceil(lot.remainingMs / 1000) < 8
  // Single-device mode has no auctioneer, so this device keeps the clock and the next-lot controls. Remote players cannot touch them.
  const manual = game.mode === 'local'
  const act = (p: Promise<ActionResult>) => {
    const lotIndex = session.current
    return p.then((r) => setFeedback({ ...r, lot: lotIndex }))
  }
  // Feedback belongs to the lot it was given on; a new technology starts clean.
  const shown = feedback?.lot === session.current && lot.status === 'open' ? feedback : null

  return (
    <GameShell wide fit>
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 text-sm">
        <p className="font-medium">
          {matchLabel(session)}{' '}
          <span className="font-normal text-muted">
            · {session.rules.label} rules{game.mySide ? ` · ${seats.length === 2 ? 'two' : seats.length} stations` : hot ? ' · local hot-seat' : ''}
          </span>
        </p>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
          <div className="flex gap-1.5">
            <dt>Session</dt>
            <dd className="font-mono text-[13px] text-ink">{session.sessionId}</dd>
          </div>
          {session.runId !== 'SEALED' && (
            <div className="flex gap-1.5">
              <dt>Run</dt>
              <dd className="font-mono text-[13px] text-ink">{session.runId}</dd>
            </div>
          )}
        </dl>
      </div>

      <p className="mt-2 border-y border-line bg-surface px-5 py-2 text-sm">
        <strong className="font-semibold tracking-wide">HOW TO PLAY:</strong> Bid at least {session.rules.bidIncrement} CC above the current bid (quick buttons or
        typed amount). PASS if you don&rsquo;t want it.
      </p>

      <Progress session={session} className="mt-4" />

      {/* Mobile order: title, bidding desk, details. Desktop: details left, desk right. */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-x-8 lg:gap-y-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
        <TechTitle
          tech={tech}
          bargain={lot.techId === session.rules.wildcardTechId}
          offTheme={!!session.rules.offThemeTechIds?.includes(lot.techId)}
          compact
          stamp={lot.status === 'sold' ? { text: `SOLD · ${cc(lot.bid!)}`, won: lot.leader !== null && lot.leader === mine } : null}
        />
        <TechBody tech={tech} />

        <section aria-label="Bidding" className={`pn min-w-0 self-start p-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 max-lg:order-2 shadow-[0_1px_2px_rgb(14_26_51/0.04),0_8px_24px_-12px_rgb(14_26_51/0.12)] ${urgent ? 'pn-urgent' : ''}`}>
          {outbid > 0 && <span key={outbid} className="out-flash" aria-hidden="true" />}
          <Clock session={session} onStart={manual ? () => game.setClockRunning(true) : undefined} onPause={manual ? () => game.setClockRunning(false) : undefined} />
          <WalletBar session={session} mine={speaking} />

          <div className="grid grid-cols-2 border-t border-line">
            <div className="px-4 py-3 sm:px-6">
              <p className="lbl">Current bid</p>
              <p className="mt-1 font-display text-3xl tabular-nums sm:text-4xl">
                <span key={lot.bid ?? 'none'} className="flash">
                  {lot.bid === null ? '—' : cc(lot.bid)}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted">Starting bid {cc(openingBid(session.rules, lot.techId))}</p>
            </div>
            <div className="min-w-0 border-l border-line px-4 py-3 sm:px-6">
              <p className="lbl">Leading bidder</p>
              <p className="mt-2.5 text-[15px]">
                {lot.leader ? <UnitName unit={session.sides[lot.leader]} /> : <span className="text-muted">No bids yet</span>}
              </p>
            </div>
          </div>

          {lot.status === 'open' ? (
            <div className="border-t border-line">
              {(many ? [speaking] : seats).map((id) => (
                <SideControls
                  key={id}
                  session={session}
                  side={id}
                  you={game.mySide ? id === game.mySide : !hot && id === seats[0]}
                  remote={!game.controls(id)}
                  onBid={(amount) => act(game.bid(id, amount))}
                  onPass={() => act(game.pass(id))}
                />
              ))}
            </div>
          ) : (
            <Result session={session} onNext={manual ? () => game.advanceLot() : undefined} />
          )}

          {many && (
            <div className="border-t border-line px-6 py-4">
              <p className="lbl mb-2">Bidders · {seats.length} sides</p>
              <BidderTable session={session} mine={game.mySide} offline={game.offlineOf(session.sessionId)} />
            </div>
          )}

          <p aria-live="polite" className={`min-h-12 border-t border-line px-6 py-2 text-sm ${shown ? (shown.ok ? 'text-success' : 'text-danger') : 'text-muted'}`}>
            {shown?.message ?? 'Accepted and rejected actions appear here.'}
          </p>
        </section>

        <div className="flex min-w-0 flex-col gap-6 max-lg:order-4 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-8 xl:col-span-1 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:flex xl:gap-6">
          <Portfolios session={session} mine={mine} />
          <Activity session={session} mine={mine} hotSeat={hot && game.mode === 'local'} />
        </div>
      </div>
    </GameShell>
  )
}

function TechBody({ tech }: { tech: Technology }) {
  const groups: [string, string[]][] = [
    ['Capabilities', tech.capabilities],
    ['Applications', tech.applications],
    ['Strengths', tech.strengths],
    ['Limitations', tech.limitations],
  ]
  return (
    <article aria-labelledby="tech-name" className="min-w-0 max-lg:order-3">
      <p className="mt-3 max-w-[62ch] text-[15px] leading-snug text-ink-soft">{tech.summary}</p>
      <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {groups.map(([title, items]) => (
          <section key={title}>
            <h2 className="text-sm font-semibold">{title}</h2>
            <ul className="mt-1.5 space-y-1 text-sm leading-snug text-ink-soft">
              {items.map((it) => (
                <li key={it} className="flex gap-2.5">
                  <span aria-hidden="true" className={`mt-[9px] h-px w-2.5 shrink-0 ${title === 'Limitations' ? 'bg-danger/60' : 'bg-line-strong'}`} />
                  {it}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  )
}

/** Wallet split: my balance against the rival's, as two segments. Visual only; balances are read above. */
function WalletBar({ session, mine }: { session: Session; mine: SideId }) {
  const rivals = sidesOf(session).filter((id) => id !== mine)
  const two = rivals.length === 1
  return (
    <div className="flex h-2.5 gap-[3px] px-6 pb-5" aria-hidden="true">
      <i className="bg-accent" style={{ flexGrow: session.sides[mine].wallet.balance }} />
      {rivals.map((id) => (
        <i key={id} className={two ? 'bg-danger' : 'bg-line-strong'} style={{ flexGrow: session.sides[id].wallet.balance }} />
      ))}
    </div>
  )
}

function SideControls({ session, side, you, remote, onBid, onPass }: { session: Session; side: SideId; you: boolean; remote: boolean; onBid: (amount: number) => unknown; onPass: () => unknown }) {
  const unit = session.sides[side]
  const lot = currentLot(session)
  const next = nextValidBid(session)
  const blocker = bidBlocker(session, side)
  const status = lot.leader === side ? 'Leading' : lot.passed.includes(side) ? 'Passed' : null
  const canPass = lot.running && lot.phase === 'open' && lot.leader !== side && !lot.passed.includes(side)
  const capped = atPortfolioCap(session, side)
  const need = techNeed(session, side)
  const base = lot.bid ?? next
  const quick = [50, 100].map((j) => base + j)
  const [typed, setTyped] = useState(String(next))
  // Reset the typed amount on a new lot, or when a rival's bid lifts the minimum above it; never while the player is typing.
  const [seen, setSeen] = useState(`${session.current}:${next}`)
  if (seen !== `${session.current}:${next}`) {
    const newLot = !seen.startsWith(`${session.current}:`)
    setSeen(`${session.current}:${next}`)
    if (newLot || Number(typed) < next) setTyped(String(next))
  }
  const typedErr = blocker ? null : bidBlocker(session, side, Number(typed))
  const sendTyped = () => {
    if (!blocker && !typedErr) onBid(Number(typed))
  }

  return (
    <div className="border-b border-line px-6 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <UnitName unit={unit} you={you} />
        <div className="flex items-center gap-3">
          {status && <Tag tone={status === 'Leading' ? 'accent' : 'neutral'}>{status}</Tag>}
          <span className="text-sm tabular-nums">
            <span className="sr-only">Available: </span>
            {cc(unit.wallet.balance)}
          </span>
        </div>
      </div>
      {you && unit.portfolio.length > 0 && (
        <p className="mt-1.5 text-[13px] text-muted">Owned: {unit.portfolio.map((t) => getTech(t).name).join(', ')}</p>
      )}
      {unit.controller === 'human' && remote ? (
        <p className="mt-2 text-[13px] text-muted">
          {status === 'Passed' ? 'Passed on this technology.' : status === 'Leading' ? 'Holds the bid.' : 'Bids from their own station. Their bids appear here as soon as the event server accepts them.'}
        </p>
      ) : unit.controller === 'human' ? (
        <>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Button onClick={() => onBid(next)} disabled={!!blocker} className="py-3 font-semibold tracking-wide">
              BID {next} CC
            </Button>
            <Button variant="secondary" onClick={onPass} disabled={!canPass} className="px-6 py-3 font-semibold tracking-wide">
              PASS
            </Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {quick.map((amount, i) => (
              <Button key={amount} variant="secondary" onClick={() => onBid(amount)} disabled={!!blocker || !!bidBlocker(session, side, amount)} className="py-2 text-[13px] font-semibold tabular-nums">
                +{(i + 1) * 50} · {amount} CC
              </Button>
            ))}
          </div>
          <div className="mt-3">
            <label htmlFor={`bid-${side}`} className="lbl">
              Your bid (CC)
            </label>
            <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
              <input
                id={`bid-${side}`}
                type="number"
                inputMode="numeric"
                step={session.rules.bidIncrement}
                min={next}
                max={unit.wallet.balance}
                value={typed}
                disabled={!!blocker}
                aria-invalid={!!typedErr}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    sendTyped()
                  }
                }}
                className="min-w-0 border border-line bg-surface px-3 py-2 text-sm tabular-nums"
              />
              <Button variant="secondary" onClick={sendTyped} disabled={!!blocker || !!typedErr} className="px-4 py-2 text-[13px] font-semibold">
                Bid this amount
              </Button>
            </div>
            {typedErr && <p className="mt-1 text-[13px] text-danger">{typedErr}</p>}
          </div>
          {capped && lot.status === 'open' && (
            <p className="mt-2 text-[13px] text-danger">You hold the maximum {portfolioCap(session)} technologies. You can watch the rest of the auction.</p>
          )}
          {blocker && !capped && lot.running && <p className="mt-2 text-[13px] text-muted">{blocker}</p>}
          {need.short && (
            <p className={`mt-2 text-[13px] ${need.reachable ? 'text-ink-soft' : 'text-danger'}`}>
              {need.reachable
                ? `A solution needs at least ${need.need} ${need.need === 1 ? 'technology' : 'technologies'}: you have ${need.have}, ${need.left} ${need.left === 1 ? 'lot' : 'lots'} left.`
                : `You can no longer win the ${need.need} ${need.need === 1 ? 'technology' : 'technologies'} a solution needs (you have ${need.have}, ${need.left} ${need.left === 1 ? 'lot' : 'lots'} left). You can keep bidding; there will be nothing to submit.`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-[13px] text-muted">
          {status === 'Passed'
            ? 'ChronoBot passed on this technology.'
            : status === 'Leading'
              ? 'ChronoBot holds the bid.'
              : 'Bids automatically after a short delay, only up to the value it places on this technology.'}
        </p>
      )}
    </div>
  )
}

function Result({ session, onNext }: { session: Session; onNext?: () => unknown }) {
  const lot = currentLot(session)
  const tech = getTech(lot.techId)
  const sold = lot.status === 'sold'
  const winner = sold ? session.sides[lot.leader!] : null
  return (
    <div className="border-t border-line px-6 py-6" role="status">
      <p className={`text-xs font-semibold tracking-[0.2em] ${sold ? 'text-success' : 'text-muted'}`}>{sold ? 'SOLD' : 'UNSOLD'}</p>
      <p className="mt-2 font-display text-3xl leading-tight">
        {sold ? (
          <>
            {tech.name} to {winner!.name} for {cc(lot.bid!)}
          </>
        ) : (
          <>{tech.name} received no bids</>
        )}
      </p>
      <p className="mt-2 text-sm text-muted">
        {sold
          ? `${cc(lot.bid!)} deducted once from ${winner!.name}. New balance ${cc(winner!.wallet.balance)}. Losing bids cost nothing.`
          : 'No coins changed hands and nobody owns it.'}
      </p>
      {onNext && (
        <Button className="mt-5 w-full py-3 tracking-wide" onClick={onNext}>
          {isLastLot(session) ? 'Auction complete · view summary' : 'Next technology'}
        </Button>
      )}
    </div>
  )
}

function Portfolios({ session, mine }: { session: Session; mine: SideId | null }) {
  const paid = (side: SideId, techId: string) => session.events.find((e) => e.type === 'purchase' && e.sideId === side && e.techId === techId)?.amount
  return (
    <section>
      <Label>Portfolios</Label>
      <div className={`mt-2 grid gap-4 ${sidesOf(session).length > 2 ? "sm:grid-cols-2" : ""}`}>
        {sidesOf(session).map((id) => {
          const u = session.sides[id]
          return (
            <div key={id}>
              <p className="flex items-center gap-2 text-sm">
                <SideBadge side={id} />
                <span className="font-medium">{id === mine ? 'Your technologies' : u.name}</span>
              </p>
              {u.portfolio.length === 0 ? (
                <p className="mt-2 text-sm text-muted">None acquired yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {u.portfolio.map((t) => (
                    <li key={t} className="flex items-center gap-3 py-1.5 text-sm">
                      <TechIcon name={getTech(t).icon} className="h-4 w-4 text-ink-soft" />
                      <span className="flex-1">{getTech(t).name}</span>
                      <span className="text-muted tabular-nums">{cc(paid(id, t) ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

