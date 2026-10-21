import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button.tsx'
import TechIcon from './TechIcon.tsx'
import { cc, Label, SideBadge } from './bits.tsx'
import { clock, EVENT_LABELS } from './events.ts'
import { atPortfolioCap, currentLot, openingBid, sidesOf } from '../../game/auction.ts'
import { getTech } from '../../data/technologies.ts'
import type { Session, SideId, Technology } from '../../game/types.ts'
import { SFX } from '../ui/sfx.ts'

type BidderStatus = 'Won' | 'Leading' | 'In' | 'Passed' | 'Capped'

/** A side's standing on the current lot. Capped means it has hit the portfolio cap, so it cannot win this lot. */
function bidderStatus(s: Session, side: SideId): BidderStatus {
  const lot = currentLot(s)
  if (lot.leader === side) return lot.status === 'sold' ? 'Won' : 'Leading'
  if (lot.passed.includes(side)) return 'Passed'
  if (atPortfolioCap(s, side)) return 'Capped'
  return 'In'
}

const STATUS_ORDER: Record<BidderStatus, number> = { Won: 0, Leading: 0, In: 1, Capped: 2, Passed: 3 }
const STATUS_TONE: Record<BidderStatus, 'accent' | 'neutral' | 'danger'> = { Won: 'accent', Leading: 'accent', In: 'neutral', Capped: 'danger', Passed: 'neutral' }

/**
 * Every side in one table: name, wallet, technologies won, and standing on the current lot.
 * `size="lg"` is the projector variant (text at least 28px); the default fits a 1080p participant screen with 12 sides.
 */
export function BidderTable({ session, mine, offline = [], size = 'md' }: { session: Session; mine: SideId | null; offline?: SideId[]; size?: 'md' | 'lg' }) {
  const rows = sidesOf(session)
    .map((id) => ({ id, unit: session.sides[id], status: bidderStatus(session, id) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.unit.name.localeCompare(b.unit.name))
  const large = size === 'lg'
  // A full room (up to 12) must fit the projector: tighter rows once there are many bidders.
  const dense = large && rows.length > 8
  return (
    <table className={`w-full table-fixed border-collapse text-left ${large ? (dense ? 'text-[clamp(16px,2vh,22px)] leading-tight' : 'text-[clamp(18px,2.6vh,28px)] leading-tight') : 'text-sm'}`}>
      <caption className="sr-only">Bidders, sorted by standing on the current technology</caption>
      {/* The projector drops the Won column and narrows the rest so names fit at 1080p. */}
      <colgroup>
        <col />
        <col className="w-[24%]" />
        {!large && <col className="w-[12%]" />}
        <col className={large ? 'w-[20%]' : 'w-[28%]'} />
      </colgroup>
      <thead>
        <tr className={`border-b border-line text-muted ${large ? '' : 'text-xs'}`}>
          <th scope="col" className="py-2 pr-2 font-normal">Side</th>
          <th scope="col" className="py-2 pr-2 text-right font-normal">Wallet</th>
          {!large && <th scope="col" className="py-2 pr-2 text-right font-normal">Won</th>}
          <th scope="col" className="py-2 text-right font-normal">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map(({ id, unit, status }) => (
          <tr key={id} className={`${large ? (dense ? 'h-[clamp(30px,3.7vh,40px)]' : 'h-[clamp(36px,5.2vh,56px)]') : 'h-9'} ${mine === id ? 'bg-accent-soft' : ''} ${offline.includes(id) ? 'opacity-60' : ''}`}>
            <td className="min-w-0 pr-2">
              <span className="flex min-w-0 items-center gap-2">
                <SideBadge side={id} />
                <span className="truncate font-medium">{unit.name}</span>
                {mine === id && <span className="shrink-0 text-muted">(you)</span>}
                {offline.includes(id) && (
                  <span className="shrink-0 font-mono text-[0.7em] text-danger" title="Disconnected">
                    ● <span className="sr-only">Disconnected</span>
                    <span aria-hidden="true">off</span>
                  </span>
                )}
              </span>
            </td>
            <td className="pr-2 text-right font-mono whitespace-nowrap tabular-nums">{cc(unit.wallet.balance)}</td>
            {!large && <td className="pr-2 text-right tabular-nums">{unit.portfolio.length}</td>}
            <td className="text-right">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono font-medium whitespace-nowrap ${large ? 'text-[0.75em]' : 'text-xs'} ${
                  STATUS_TONE[status] === 'accent'
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : STATUS_TONE[status] === 'danger'
                      ? 'border-danger/30 bg-danger-soft text-danger'
                      : 'border-line-strong text-ink-soft'
                }`}
              >
                {status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Progress({ session, className = 'mt-8' }: { session: Session; className?: string }) {
  return (
    <div className={className}>
      <p className="text-sm">
        <span className="font-semibold">
          Technology {session.current + 1} of {session.lots.length}
        </span>
        <span className="text-muted"> · {session.lots.filter((l) => l.status === 'sold' || l.status === 'unsold').length} decided</span>
      </p>
      <div className="mt-3 overflow-x-auto">
        <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${session.lots.length}, minmax(88px, 1fr))` }}>
          {session.lots.map((l, i) => {
            const t = l.status === 'pending' ? null : getTech(l.techId)
            const state =
              l.status === 'sold' ? `sold to ${session.sides[l.leader!].name}` : l.status === 'unsold' ? 'unsold' : i === session.current ? 'current' : 'upcoming'
            const decided = l.status === 'sold' || l.status === 'unsold'
            return (
              <li
                key={i}
                aria-current={i === session.current ? 'step' : undefined}
                className={`truncate border-t-2 pt-2 text-[13px] ${
                  i === session.current ? 'border-danger bg-danger-soft text-ink' : decided ? 'border-accent text-ink-soft' : 'border-line-strong text-muted'
                }`}
              >
                {t ? t.name : 'Upcoming'}
                <span className="sr-only">, {state}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/** `bargain`: the half-price lot. `offTheme`: a "Wildcard" lot, off the run's twist. Neither says why. */
export function TechTitle({ tech, stamp, bargain = false, offTheme = false, compact = false }: { tech: Technology; stamp: { text: string; won: boolean } | null; bargain?: boolean; offTheme?: boolean; compact?: boolean }) {
  return (
    <div className={`strip relative flex min-w-0 items-start gap-4 self-start overflow-hidden rounded-[10px] border border-line bg-surface max-lg:order-1 sm:gap-5 ${compact ? 'p-4 sm:p-4' : 'p-5 sm:p-6'}`}>
      {stamp && (
        <span className={`stamp ${stamp.won ? 'won' : ''}`} role="status">
          {stamp.text}
        </span>
      )}
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface text-accent sm:h-14 sm:w-14">
        <TechIcon name={tech.icon} className="h-6 w-6 sm:h-7 sm:w-7" />
      </span>
      <div className="min-w-0">
        <h1 id="tech-name" className={`font-display text-[2.5rem] leading-[0.95] text-balance break-words ${compact ? 'sm:text-5xl' : 'sm:text-6xl'}`}>
          {tech.name}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {tech.category} · {tech.era}
        </p>
        {(bargain || offTheme) && (
          <p className="mt-3 flex flex-wrap gap-2">
            {bargain && <span className="chip chip-hot chip-dot">Bargain lot · half price</span>}
            {offTheme && <span className="chip">Wildcard</span>}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The active countdown of the current lot: intro (bidding opens in), bidding (time remaining) or the result pause (next technology in).
 * Start/pause controls are shown only when `onStart`/`onPause` are given (local single-device mode and the auctioneer).
 */
export function Clock({ session, onStart, onPause, big }: { session: Session; onStart?: () => unknown; onPause?: () => unknown; big?: boolean }) {
  const lot = currentLot(session)
  const phase = lot.status === 'open' ? lot.phase : 'decided'
  const bidding = phase === 'open'
  const total = (phase === 'intro' ? session.rules.introSeconds : phase === 'open' ? session.rules.bidSeconds : session.rules.nextLotSeconds) * 1000
  const secs = Math.ceil(lot.remainingMs / 1000)
  const lit = Math.min(30, Math.ceil((lot.remainingMs / total) * 30))
  const low = bidding && secs < 8
  const going = bidding && lot.running ? (secs === 3 ? 'Going once' : secs === 2 ? 'Going twice' : secs === 1 ? 'Last call' : '') : ''
  const label = phase === 'intro' ? 'Bidding opens in' : phase === 'open' ? 'Time remaining' : 'Next technology in'

  // A tick sound on each second boundary while the bidding clock runs (silent unless sound is switched on).
  const prev = useRef(secs)
  useEffect(() => {
    if (bidding && lot.running && secs < prev.current) {
      if (secs < 8) SFX.alarm(secs)
      else SFX.sec()
    }
    prev.current = secs
  }, [secs, bidding, lot.running])

  return (
    <div className="px-6 pt-5 pb-5">
      <div className={`flex items-end justify-between gap-4 ${big ? 'flex-wrap' : ''}`}>
        {/* Keyed by phase: each change of countdown eases in once (the existing `enter` motion), nothing else animates. */}
        <div key={phase} className="enter">
          <p className="lbl">{label}</p>
          <p
            className={`mt-1 ${big ? 'text-[clamp(4rem,14vh,8rem)]' : 'text-[4rem]'} leading-none font-semibold tracking-[-0.03em] tabular-nums ${bidding ? 'text-danger' : 'text-ink'}`}
            aria-live="off"
          >
            {Math.max(0, secs)}
            <span className="ml-1 text-xl font-normal text-muted">s</span>
          </p>
        </div>
        {lot.running
          ? onPause && (
              <Button variant="ghost" className="px-3 text-[13px]" onClick={onPause}>
                Pause
              </Button>
            )
          : onStart && <Button onClick={onStart}>{phase === 'intro' ? 'Start now' : 'Resume'}</Button>}
      </div>
      <div className="mt-3.5 grid grid-cols-[repeat(30,1fr)] gap-[3px]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total / 1000} aria-valuenow={Math.max(0, secs)}>
        {Array.from({ length: 30 }, (_, i) => (
          <i key={i} aria-hidden="true" className={`${big ? 'h-[clamp(20px,2.6vh,28px)]' : 'h-[22px]'} ${i < lit ? `${bidding ? 'bg-danger' : 'bg-accent'} ${low ? 'seg-lo' : ''}` : 'bg-line'}`} />
        ))}
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1.3em] font-semibold text-danger">
        {going}
      </p>
      <p className="mt-1 text-sm text-muted">
        {phase === 'intro'
          ? lot.running
            ? 'Read the technology. Bidding opens automatically.'
            : 'Paused. Bidding opens when the countdown resumes.'
          : phase === 'open'
            ? lot.running
              ? `Each accepted bid resets the clock to ${session.rules.bidSeconds} s.`
              : 'Paused. No bids are accepted until the clock resumes.'
            : lot.running
              ? 'Result shown. The next technology opens automatically.'
              : 'Paused. The next technology waits until the clock resumes.'}
      </p>
    </div>
  )
}

/** Step chart of the accepted bids on the current technology. Decorative: the same numbers are in the log below. */
export function BidChart({ session, mine, hotSeat = false }: { session: Session; mine: SideId | null; hotSeat?: boolean }) {
  const lot = currentLot(session)
  const start = openingBid(session.rules, lot.techId)
  const bids = session.events.filter((e) => e.type === 'bid_accepted' && e.techId === lot.techId && e.amount !== null)
  if (bids.length === 0) return null
  // Mine is accent, everyone else danger. With no station side (spectator) nobody is singled out; a single-device hot-seat's first side stands in for "mine".
  const focus = mine ?? (hotSeat ? sidesOf(session)[0] : null)
  const W = 600
  const H = 90
  const vals = bids.map((e) => e.amount!)
  const lo = Math.min(start, ...vals)
  const hi = Math.max(...vals, lo + 60)
  const x = (i: number) => (bids.length < 2 ? 0 : (i * W) / (bids.length - 1))
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * (H - 14) - 4
  const d = vals.map((v, i) => (i ? `H${x(i)}V${y(v)}` : `M0 ${y(v)}`)).join('')
  return (
    <div className="mt-2" aria-hidden="true">
      <p className="lbl text-right">CC per bid</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full overflow-visible">
        {[lo, Math.round((lo + hi) / 2), Math.round(hi)].map((v) => (
          <g key={v}>
            <line x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
            <text x="0" y={y(v) - 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--color-muted)">
              {v}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        {bids.map((e, i) => (
          <rect
            key={e.seq}
            x={x(i) - 4}
            y={y(vals[i]) - 4}
            width="8"
            height="8"
            fill={focus === null ? 'var(--color-ink-soft)' : e.sideId === focus ? 'var(--color-accent)' : 'var(--color-danger)'}
          />
        ))}
      </svg>
    </div>
  )
}

export function Activity({ session, mine, hotSeat = false }: { session: Session; mine: SideId | null; hotSeat?: boolean }) {
  const recent = session.events.slice(-5).reverse()
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <Label>Recent activity</Label>
        <span className="text-xs text-muted">{session.events.length} events recorded</span>
      </div>
      <BidChart session={session} mine={mine} hotSeat={hotSeat} />
      <ol className="mt-2 border-t border-line font-mono text-[13px]">
        {recent.map((e) => {
          const side = mine && e.sideId ? (e.sideId === mine ? 'text-accent' : 'text-danger') : ''
          return (
          <li key={e.seq} className="log-row grid grid-cols-[2.5rem_1fr_auto] gap-3 border-b border-dashed border-line py-1.5">
            <span className="text-muted tabular-nums">#{e.seq}</span>
            <span className={e.type === 'bid_rejected' ? 'text-danger' : e.type === 'sold' ? 'font-medium' : side}>
              <span className="sr-only">{EVENT_LABELS[e.type]}: </span>
              {e.note}
            </span>
            <time className="text-xs text-muted tabular-nums" dateTime={e.at}>
              {clock(e.at)}
            </time>
          </li>
          )
        })}
      </ol>
    </section>
  )
}

/**
 * Sound and highlight cues for the lot. Purely additive: nothing here waits on or blocks rendering.
 * Returns a counter that bumps whenever the lead moves away from this station's side.
 */
export function useLotFx(lotIndex: number, status: string | undefined, leader: SideId | null, mine: SideId | null) {
  const [outbid, setOutbid] = useState(0)
  const seen = useRef({ lotIndex, status, leader })
  useEffect(() => {
    const p = seen.current
    seen.current = { lotIndex, status, leader }
    if (p.lotIndex !== lotIndex) return
    if (mine && p.leader === mine && leader !== mine) {
      SFX.err()
      setOutbid((n) => n + 1)
    }
    if (p.status === 'open' && status === 'sold') {
      if (leader === mine) SFX.ok()
      else SFX.lock()
    }
  }, [lotIndex, status, leader, mine])
  return outbid
}
