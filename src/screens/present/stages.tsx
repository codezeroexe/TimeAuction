import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { BidderTable, Clock, Progress, TechTitle, useLotFx } from '../../components/game/auction.tsx'
import { cc, matchLabel, UnitName } from '../../components/game/bits.tsx'
import LeaderboardTable from '../../components/game/LeaderboardTable.tsx'
import { TwistGraphic } from '../../components/game/twistGraphics.tsx'
import Starfield from '../../components/landing/Starfield.tsx'
import ShootingStars from '../../components/landing/ShootingStars.tsx'
import { Wordmark } from '../../components/landing/LandingSections.tsx'
import { calm, countUp, lowPower } from '../../components/ui/motion.ts'
import { currentLot, sidesOf } from '../../game/auction.ts'
import { BIG_MATCH_BID_SECONDS, BIG_MATCH_SIDES } from '../../game/draw.ts'
import { currentRoom, lobbyParticipants, lobbyWaiting } from '../../game/event.ts'
import { rankRows, type LeaderRow } from '../../game/leaderboard.ts'
import { MAX_CHARACTERISTICS, RULESETS, SOLUTION_WORDS } from '../../game/rules.ts'
import type { EventState, SessionStatus, SideId, Technology } from '../../game/types.ts'
import { RuleIcon, type RuleIconName } from '../../components/game/RuleIcon.tsx'
import { getTech } from '../../data/technologies.ts'
import { netShift, TWISTS, twistStrength, valuesForRun, type TwistStrength } from '../../data/scenario.ts'
import { pickView, roomNumber, type Room } from './show.ts'

/** The projector's stages. No buttons, links or click handlers live in this file: the screen is driven only by server state. */

export interface StageProps {
  event: EventState
  /** Every match, its clock brought up to date. */
  rooms: Room[]
  /** The room to show big: the presenter's focus, or the one named in the URL. */
  focus: string | null
  leaderboard: Omit<LeaderRow, 'rank'>[]
  offlineOf: (sessionId: string) => SideId[]
  /** Game IDs with a connected station; null when unknown (single-device mode). */
  online: string[] | null
  /** The LAN address stations join from, when the server has one. */
  join: string | null
}


const STATUS: Record<SessionStatus, { label: string; className: string }> = {
  ready: { label: 'Held', className: 'chip' },
  live: { label: 'Live', className: 'chip chip-wal chip-dot' },
  complete: { label: 'Finished', className: 'chip' },
}

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%'
const STRENGTH: Record<TwistStrength, string> = { mild: 'Mild', normal: 'Normal', severe: 'Severe' }
const isSealed = (r: Room) => !!r.run.twistHeld && !r.run.twistRevealedAt
const namesOf = (r: Room) => sidesOf(r.session).map((id) => r.session.sides[id].name)

function Heading({ kicker, title, aside }: { kicker: string; title: string; aside?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-5">
      <div>
        <p className="lbl">{kicker}</p>
        <h1 className="mt-2 font-display text-[4.5rem] leading-none">{title}</h1>
      </div>
      {aside && <p className="text-[1.6rem] text-ink-soft tabular-nums">{aside}</p>}
    </header>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="grid h-full place-items-center text-center font-display text-[3.5rem] leading-tight text-ink-soft text-balance">{children}</p>
}

/** The first stage: the player landing's dark sky, dial and wordmark. No controls, no links, no event name. Not in the zoomed frame, so it is full-bleed. */
/** Tilted orbits around the dial: [rx, ry, tilt°, seconds, clockwise, eras]. Each carries two eras half an orbit apart. */
const ORBITS: [number, number, number, number, boolean, [number, number]][] = [
  [430, 120, -16, 26, true, [1880, 2080]],
  [370, 190, 22, 34, false, [1920, 2040]],
  [300, 88, 6, 19, true, [1960, 2010]],
]

/** Drifting, twinkling dust behind the title: deterministic positions, sizes and timings. */
const DUST = Array.from({ length: 48 }, (_, i) => ({
  left: `${(i * 41 + 7) % 100}%`,
  top: `${(i * 67 + 13) % 100}%`,
  '--s': `${2 + (i % 4)}px`,
  '--d': `${14 + ((i * 7) % 16)}s`,
  '--delay': `${-((i * 3) % 20)}s`,
  '--dx': `${((i % 7) - 3) * 30}px`,
}))

function orbitPath(rx: number, ry: number, tilt: number, cw: boolean) {
  const t = (tilt * Math.PI) / 180
  const x = rx * Math.cos(t)
  const y = rx * Math.sin(t)
  const s = cw ? 1 : 0
  return `M ${x} ${y} A ${rx} ${ry} ${tilt} 1 ${s} ${-x} ${-y} A ${rx} ${ry} ${tilt} 1 ${s} ${x} ${y} Z`
}

/** Welcome: title left, the dial right with eras orbiting it on tilted paths; labels stay upright as they travel. */
export function Welcome() {
  const still = calm()
  // Low-power PCs and the console thumbnail iframe skip the heavy layers (second canvas, blurred aurora, dust).
  const lite = lowPower() || location.hash.startsWith('#/present/preview')
  return (
    <div className="landing projector-welcome relative isolate overflow-hidden">
      <Starfield />
      {lite ? null : (
        <>
          <div className="welcome-aurora" aria-hidden="true"><i /><i /><i /></div>
          <div className="welcome-dust" aria-hidden="true">
            {DUST.map((d, i) => <i key={i} style={d as CSSProperties} />)}
          </div>
          <ShootingStars className="welcome-shots" />
        </>
      )}
      <section className="relative z-10 mx-auto grid h-full max-w-[1600px] items-center gap-10 px-16 lg:grid-cols-[1fr_1.05fr]">
        <div className="enter">
          <p className="text-[1.6rem] font-medium tracking-[0.2em] text-(--l-muted) uppercase">Engineering Across Time</p>
          <Wordmark className="welcome-mark mt-6 block text-[clamp(5rem,10vw,10rem)]" />
          <p className="mt-10 font-display text-[clamp(2.2rem,3.6vw,3.6rem)] leading-tight">
            The Future Is Yours <em className="welcome-sweep text-(--l-accent)">to Engineer.</em>
          </p>
        </div>
        <div className="relative mx-auto aspect-square w-[min(62svh,40vw)]">
          <svg className="welcome-orbits" viewBox="-520 -520 1040 1040" aria-hidden="true">
            <defs>
              <radialGradient id="wplanet" cx="0.36" cy="0.32" r="0.8">
                <stop offset="0" stopColor="var(--l-planet-a)" />
                <stop offset="0.55" stopColor="var(--l-planet-b)" />
                <stop offset="1" stopColor="var(--l-bg)" />
              </radialGradient>
              <radialGradient id="whalo">
                <stop offset="0.55" stopColor="var(--l-galaxy)" stopOpacity="0.28" />
                <stop offset="1" stopColor="var(--l-galaxy)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle r="230" fill="url(#whalo)" className="welcome-halo" />
            <circle r="150" fill="url(#wplanet)" className="enter-dial" />
            {ORBITS.map(([rx, ry, tilt, dur, cw, eras]) => {
              const d = orbitPath(rx, ry, tilt, cw)
              const [x, y] = [rx * Math.cos((tilt * Math.PI) / 180), rx * Math.sin((tilt * Math.PI) / 180)]
              return (
                <g key={rx}>
                  <path d={d} className="welcome-orbit" />
                  {eras.map((e, i) => (
                    <g key={e} className="welcome-body" transform={still ? `translate(${i ? -x : x} ${i ? -y : y})` : undefined}>
                      <circle r="9" />
                      <text y="-22" textAnchor="middle">{e}</text>
                      {still ? null : <animateMotion dur={`${dur}s`} begin={`${-i * dur / 2}s`} repeatCount="indefinite" path={d} />}
                    </g>
                  ))}
                </g>
              )
            })}
          </svg>
        </div>
      </section>
    </div>
  )
}

/** The rules, pulled from the event's default ruleset and the draw constants. Read-only. */
export function Rules({ event }: StageProps) {
  const rules = RULESETS[event.settings.defaultRuleset]
  const cards: { title: string; icon: RuleIconName; body: string }[] = [
    {
      title: 'Budget',
      icon: 'wallet',
      body: `Every side starts with ChronoCoins (CC) set by the match size: 200 CC for each technology in the auction. Coins are the only money, and you can never bid more than you hold.`,
    },
    {
      title: 'Bidding',
      icon: 'bid',
      body: `Technologies come up one at a time. The first bid opens at the starting price; after that you can bid any amount at least ${rules.bidIncrement} CC above the current bid, in steps of ${rules.bidIncrement}. Every accepted bid resets the ${rules.bidSeconds} s clock. Passing is final for that technology. When the clock runs out, the highest bid wins.`,
    },
    {
      title: 'Pacing',
      icon: 'clock',
      body: `A ${rules.introSeconds} s countdown runs before bidding opens. After each result there is a ${rules.nextLotSeconds} s pause, then the next technology opens by itself. From ${BIG_MATCH_SIDES} sides the bid clock is ${BIG_MATCH_BID_SECONDS} s.`,
    },
    {
      title: 'Portfolio cap',
      icon: 'lots',
      body: 'From 3 sides, no side can win more than its fair share of technologies plus one. A side at its cap cannot bid again.',
    },
    {
      title: 'Timeline Twist',
      icon: 'twist',
      body: 'After the auction the host reveals the Timeline Twist. It changes what each technology is worth, after you have already paid for it.',
    },
    {
      title: 'Mission and scoring',
      icon: 'scoring',
      body: `Use as many of the technologies you won as you like (at least ${rules.solutionTechCount}), name ${MAX_CHARACTERISTICS} characteristics at most, and write a solution of at least ${SOLUTION_WORDS.min} words (about ${SOLUTION_WORDS.max} suggested)${event.settings.defaultTimed ? ` within ${rules.solutionSeconds / 60} minutes` : ''}. Judges score it out of 100, each technology adds or subtracts points by its twist value, and the leaderboard ranks everyone.`,
    },
  ]
  return (
    <section className="flex h-full flex-col gap-8">
      <Heading kicker="How to play" title="Rules" aside={`${rules.label} mode`} />
      <ul className="grid grid-cols-3 content-start gap-6">
        {cards.map((c, i) => (
          <li key={c.title} className="pn enter flex flex-col !p-5" style={{ '--i': i } as CSSProperties}>
            <div className="flex items-center gap-4">
              {/* Negative vertical margin keeps the 3rem icon from making the card taller than its title row. */}
              <RuleIcon name={c.icon} className="-my-3 h-12 w-12 shrink-0 text-accent" />
              <p className="lbl">{c.title}</p>
            </div>
            <p className="mt-3 text-[clamp(0.95rem,1.9vh,1.25rem)] leading-snug">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Players' setup steps. The address is the server's LAN URL (or this page's host when the server did not name one). Live count of registrations. */
export function Join({ event, join }: StageProps) {
  const count = lobbyParticipants(event).length
  const shown = useRef<HTMLSpanElement>(null)
  const last = useRef(0)
  useEffect(() => {
    countUp(shown.current, count, 900, '', last.current)
    last.current = count
  }, [count])
  const steps = [
    'Make sure this PC is on the event network.',
    'Open a browser and go to the address shown here.',
    'Enter your name or team name and register.',
    'Keep the tab open and watch the main screen. The host pairs you.',
  ]
  return (
    <section className="flex h-full flex-col gap-8">
      <Heading kicker="Players" title="How to join" />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-12">
        <ol className="grid gap-6 text-[2rem] leading-snug">
          {steps.map((t, i) => (
            <li key={t} className="enter grid grid-cols-[3rem_1fr] items-baseline gap-4 border-b border-line pb-5" style={{ '--i': i } as CSSProperties}>
              <span className="font-mono text-accent">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <div className="pn enter !p-10 text-center" style={{ '--i': 2 } as CSSProperties}>
          <p className="lbl">Go to</p>
          {/* Shown without "http://" so it fits on one line; browsers accept the bare address. */}
          <p className="mt-5 font-mono text-[clamp(2.4rem,3.6vw,4rem)] leading-none font-semibold whitespace-nowrap text-accent">{(join ?? location.host).replace(/^https?:\/\//, '')}</p>
          <p className="mt-10 font-display text-[4rem] leading-none">
            <span className="sr-only">{count} registered</span>
            <span ref={shown} aria-hidden="true" className="tabular-nums" />
            <span aria-hidden="true" className="ml-4 font-sans text-[1.6rem] text-muted">registered</span>
          </p>
        </div>
      </div>
    </section>
  )
}

export function Teams({ event, online }: StageProps) {
  // Only players in the current lobby whose station is connected right now; stale and closed registrations drop off.
  const people = lobbyParticipants(event).filter((p) => !online || online.includes(p.gameId))
  const shown = people.slice(0, 30)
  return (
    <section className="flex h-full flex-col gap-8">
      <Heading kicker="In the lobby" title="Teams and players" aside={`${people.length} ${online ? 'online' : 'registered'}`} />
      {people.length === 0 ? (
        <Notice>Nobody is in the lobby yet.</Notice>
      ) : (
        <>
          <ul className="grid grid-cols-5 gap-4">
            {shown.map((p, i) => (
              <li key={p.gameId} className="pn enter !px-5 !py-4" style={{ '--i': Math.min(i, 15) } as CSSProperties}>
                <p className="truncate text-[1.6rem] font-semibold">{p.player.team?.name ?? p.player.name}</p>
                <p className="mt-1 truncate text-[1.2rem] text-muted">{p.player.mode === 'team' ? `Team of ${p.player.team!.members.length}` : 'Individual'}</p>
              </li>
            ))}
          </ul>
          {people.length > shown.length && <p className="text-[1.4rem] text-muted">and {people.length - shown.length} more</p>}
        </>
      )}
    </section>
  )
}

export function Matchups({ event, rooms }: StageProps) {
  const waiting = lobbyWaiting(event).length
  const room = currentRoom(event, rooms)
  const names = room ? namesOf(room) : []
  const st = room ? STATUS[room.session.status] : null
  return (
    <section className="flex h-full flex-col gap-8">
      <Heading kicker={`${waiting} waiting for a match`} title="Matchup" />
      {!room || !st ? (
        <Notice>No matches yet. The host pairs waiting players into rooms.</Notice>
      ) : (
        <div className="pn grid flex-1 place-items-center !p-12 text-center">
          <div className="grid gap-8">
            <span className={`${st.className} mx-auto text-[1.2rem]`}>{st.label}</span>
            {names.length <= 2 ? (
              <p className="font-display text-[clamp(3rem,6vw,6.5rem)] leading-tight text-balance">{names.join('  vs  ')}</p>
            ) : (
              <ul className="flex flex-wrap justify-center gap-x-10 gap-y-4 font-display text-[clamp(2.2rem,3.6vw,4rem)] leading-tight">
                {names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <p className="text-[1.6rem] text-muted">{matchLabel(room.session)}</p>
          </div>
        </div>
      )}
    </section>
  )
}

export function Auction({ rooms, focus, offlineOf }: StageProps) {
  const live = rooms.filter((r) => r.session.status === 'live')
  const view = pickView(rooms, focus, live)
  if (view.kind === 'focus') return <RoomFocus room={view.room} number={roomNumber(rooms, view.room.room)} offline={offlineOf(view.room.room)} />
  if (view.kind === 'grid') return <RoomGrid rooms={view.rooms} all={rooms} offlineOf={offlineOf} />
  const held = rooms.filter((r) => r.session.status === 'ready').length
  return (
    <Notice>
      {held > 0 ? `${held} ${held === 1 ? 'match is' : 'matches are'} waiting for the host to start the auction.` : 'No live auctions right now.'}
    </Notice>
  )
}

/** One room, big: the clock, the lot and every side's standing. Read-only. */
function RoomFocus({ room, number, offline }: { room: Room; number: number; offline: SideId[] }) {
  const s = room.session
  if (s.status !== 'live') {
    return (
      <section className="grid h-full place-items-center text-center">
        <div>
          <p className="lbl">
            Room {number} · {matchLabel(s)}
          </p>
          <h1 className="mt-4 font-display text-[5rem] leading-none">{s.status === 'ready' ? 'Waiting to start' : 'Auction finished'}</h1>
          <p className="mt-5 text-[1.8rem] text-ink-soft">{namesOf(room).join(' vs ')}</p>
          {s.status === 'ready' && <p className="mt-3 text-[1.5rem] text-muted">The host starts the auction.</p>}
        </div>
      </section>
    )
  }
  return <LiveRoom room={room} number={number} offline={offline} />
}

function LiveRoom({ room, number, offline }: { room: Room; number: number; offline: SideId[] }) {
  const s = room.session
  const lot = currentLot(s)
  const tech = getTech(lot.techId)
  useLotFx(s.current, lot.status, lot.leader, null)
  return (
    <section className="flex h-full flex-col gap-4">
      <p className="lbl">
        Room {number} · {matchLabel(s)} · {sidesOf(s).length} players · Lot {s.current + 1} / {s.lots.length}
      </p>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-8">
        <div className="min-w-0 space-y-5">
          <TechTitle
            tech={tech}
            bargain={lot.techId === s.rules.wildcardTechId}
            offTheme={!!s.rules.offThemeTechIds?.includes(lot.techId)}
            stamp={lot.status === 'sold' ? { text: `SOLD · ${cc(lot.bid!)}`, won: false } : null}
          />
          <section aria-label="Auction clock" className="pn min-w-0 !p-0">
            <Clock big session={s} />
            <div className="grid grid-cols-2 border-t border-line">
              <div className="px-6 py-4">
                <p className="lbl">Current bid</p>
                <p className="mt-1 font-display text-5xl tabular-nums">
                  <span key={lot.bid ?? 'none'} className="flash">
                    {lot.bid === null ? '—' : cc(lot.bid)}
                  </span>
                </p>
              </div>
              <div className="min-w-0 border-l border-line px-6 py-4">
                <p className="lbl">Leading bidder</p>
                <p className="mt-2.5 text-2xl">{lot.leader ? <UnitName unit={s.sides[lot.leader]} /> : <span className="text-muted">No bids yet</span>}</p>
              </div>
            </div>
            {lot.status !== 'open' && (
              <p className="border-t border-line px-6 py-5 text-lg text-ink-soft">
                The next technology opens by itself in {Math.max(0, Math.ceil(lot.remainingMs / 1000))} s.
              </p>
            )}
          </section>
        </div>
        <section aria-labelledby="bidders-title" className="pn min-w-0 !p-0">
          <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
            <h2 id="bidders-title" className="lbl">
              Bidders
            </h2>
            <span className="text-sm text-muted">{sidesOf(s).length} sides</span>
          </div>
          <div className="px-4 pb-4">
            <BidderTable session={s} mine={null} offline={offline} size="lg" />
          </div>
        </section>
      </div>
      <Progress session={s} className="mt-2" />
    </section>
  )
}

/** Several live rooms and none named: a card per room, read-only. */
function RoomGrid({ rooms, all, offlineOf }: { rooms: Room[]; all: Room[]; offlineOf: (sessionId: string) => SideId[] }) {
  return (
    <ul className="grid grid-cols-2 gap-6 xl:grid-cols-3">
      {rooms.map((r) => {
        const s = r.session
        const lot = currentLot(s)
        const decided = s.lots.filter((l) => l.status === 'sold' || l.status === 'unsold').length
        const chip = lot.status !== 'open' ? 'Decided' : lot.phase === 'intro' ? 'Opening' : lot.running ? 'Running' : 'Paused'
        const off = offlineOf(r.room).length
        return (
          <li key={r.room} className="pn !p-6">
            <p className="lbl">
              Room {roomNumber(all, r.room)} · {sidesOf(s).length} players
              {off > 0 && <span className="text-danger"> · {off} disconnected</span>}
            </p>
            <p className="mt-3 font-display text-[2.6rem] leading-tight">{getTech(lot.techId).name}</p>
            <p className="mt-3 text-[1.8rem] tabular-nums">
              {lot.bid === null ? 'No bids' : cc(lot.bid)}
              <span className="text-muted"> · Leader: {lot.leader ? s.sides[lot.leader].name : 'none yet'}</span>
            </p>
            <p className="mt-4 flex items-baseline justify-between gap-4">
              <span className="text-[3.5rem] leading-none font-semibold text-danger tabular-nums">{Math.max(0, Math.ceil(lot.remainingMs / 1000))} s</span>
              <span className="text-[1.3rem] text-muted">
                <b className="font-semibold text-ink">{chip}</b> · {decided}/{s.lots.length} decided
              </span>
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export function Twist({ rooms, focus }: StageProps) {
  const done = rooms.filter((r) => r.session.status === 'complete')
  const view = pickView(rooms, focus, done)
  if (view.kind === 'focus') return <TwistRoom room={view.room} number={roomNumber(rooms, view.room.room)} />
  if (view.kind === 'grid')
    return (
      <section className="flex h-full flex-col gap-8">
        <Heading kicker="Timeline Twist" title="Several auctions finished" aside="The host shows one room at a time" />
        <ul className="grid grid-cols-2 gap-6 xl:grid-cols-3">
          {view.rooms.map((r) => (
            <li key={r.room} className="pn !p-6">
              <p className="lbl">Room {roomNumber(rooms, r.room)}</p>
              <p className="mt-3 font-display text-[2.4rem] leading-tight">{isSealed(r) ? 'Sealed' : TWISTS[r.run.twistId].title}</p>
              <p className="mt-2 text-[1.3rem] text-muted">{isSealed(r) ? 'Waiting for the host to reveal it' : 'Revealed'}</p>
            </li>
          ))}
        </ul>
      </section>
    )
  return <Notice>The Timeline Twist appears here once an auction has finished.</Notice>
}

function TwistRoom({ room, number }: { room: Room; number: number }) {
  const { run, session: s } = room
  if (s.status !== 'complete') return <Notice>Room {number} is still in its auction.</Notice>
  if (isSealed(room))
    return (
      <section className="grid h-full place-items-center text-center">
        <div>
          <div className="present-ring mx-auto" aria-hidden="true" />
          <p className="lbl mt-12">Room {number} · sealed</p>
          <h1 className="mt-3 font-display text-[5rem] leading-none">The Timeline Twist</h1>
          <p className="mt-5 text-[1.8rem] text-ink-soft">The host reveals it for every station.</p>
        </div>
      </section>
    )
  const twist = TWISTS[run.twistId]
  const strength = twistStrength(run.runId)
  const values = valuesForRun(twist, run.runId)
  const sold = s.lots.flatMap((l) => (l.status === 'sold' && l.leader ? [{ tech: getTech(l.techId), buyer: s.sides[l.leader].name, delta: values[l.techId]?.delta ?? 0 }] : []))
  const winners = sold.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta)
  const losers = sold.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta)
  const sides = sidesOf(s).map((id) => ({ id, name: s.sides[id].name, net: netShift(twist, s.sides[id].portfolio, strength) }))
  return (
    <section className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="lbl">
            Timeline Twist · Room {number} · {STRENGTH[strength]}
          </p>
          <h1 className="mt-2 font-display text-[4.5rem] leading-none">{twist.title}</h1>
        </div>
        <p className="max-w-[60%] text-right text-[1.6rem] leading-snug text-ink-soft text-balance">{twist.headline}</p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-10">
        <TwistGraphic twist={twist} />
        <TechList title="Winners" tone="success" rows={winners} />
        <TechList title="Losers" tone="danger" rows={losers} />
      </div>
      <div className="border-t border-line pt-5">
        <p className="lbl">Net shift by side</p>
        <ul className="mt-3 grid grid-cols-4 gap-x-8 gap-y-2 text-[1.4rem]">
          {sides.map((x) => (
            <li key={x.id} className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="truncate">{x.name}</span>
              <span className={`font-mono tabular-nums ${x.net > 0 ? 'text-success' : x.net < 0 ? 'text-danger' : 'text-muted'}`}>{sign(x.net)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function TechList({ title, rows, tone }: { title: string; rows: { tech: Technology; buyer: string; delta: number }[]; tone: 'success' | 'danger' }) {
  return (
    <div className="min-w-0">
      <p className={`lbl ${tone === 'success' ? 'text-success' : 'text-danger'}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[1.4rem] text-muted">None among the technologies sold.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.tech.id} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[1.5rem] font-semibold">{r.tech.name}</span>
                <span className="block truncate text-[1.2rem] text-muted">bought by {r.buyer}</span>
              </span>
              <span className={`font-mono text-[1.5rem] tabular-nums ${tone === 'success' ? 'text-success' : 'text-danger'}`}>{sign(r.delta)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Results({ leaderboard, event }: StageProps) {
  const ranked = rankRows(leaderboard)
  if (ranked.length === 0)
    return (
      <section className="grid h-full place-items-center text-center">
        <div>
          <p className="lbl">Results</p>
          <h1 className="mt-4 font-display text-[5rem] leading-none">Judges are scoring.</h1>
          <p className="mt-5 text-[1.8rem] text-ink-soft">Results soon.</p>
        </div>
      </section>
    )
  // Podium: the third place reveals first, then second, then first.
  const podium = ranked.filter((r) => r.rank <= 3)
  return (
    <section className="flex h-full flex-col gap-8">
      <Heading kicker={event.settings.leaderboardLocked ? 'Final' : 'Provisional'} title="Results" />
      <ol className="grid grid-cols-3 gap-6">
        {podium.map((r) => (
          <li key={r.submissionId} className="pn enter !p-7 text-center" style={{ '--i': 3 - r.rank } as CSSProperties}>
            <p className="lbl">Rank {r.rank}</p>
            <p className="mt-3 truncate text-[2.2rem] font-semibold">{r.unitName}</p>
            <p className="mt-3 font-display text-[4.5rem] leading-none tabular-nums">
              {r.total}
            </p>
            <p className="mt-2 text-[1.2rem] text-muted">{r.rubric} rubric {r.tools < 0 ? '−' : '+'} {Math.abs(r.tools)} tools</p>
          </li>
        ))}
      </ol>
      <div className="min-h-0 flex-1 overflow-hidden">
        <LeaderboardTable rows={leaderboard} currentGameId={null} plain />
      </div>
    </section>
  )
}
