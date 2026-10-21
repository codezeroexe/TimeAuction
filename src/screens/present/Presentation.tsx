import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoginGate } from '../admin/AdminShell.tsx'
import { currentLot } from '../../game/auction.ts'
import { displayOf, rooms as roomsOf } from '../../game/event.ts'
import type { ShowDisplay, ShowStage } from '../../game/types.ts'
import { useGame } from '../../state/GameContext.tsx'
import { hello } from '../../state/remote.ts'
import { play } from '../../components/ui/motion.ts'
import { silence } from '../../components/ui/sfx.ts'
import { Auction, Join, Matchups, Results, Rules, Teams, Twist, Welcome, type StageProps } from './stages.tsx'
import { displayVars, STAGE_FX, type Room } from './show.ts'

/**
 * The projector screen (`#/present`). Judge sign-in, then whatever stage the host set.
 * `#/present/preview` is the host console's thumbnail: same screen, silent. `#/present/<session ID>` names a room to show big.
 */
export default function Presentation({ param }: { param: string | null }) {
  const game = useGame()
  const { event, mode, isAdmin, viewOf, tickFor, offlineOf, online, leaderboard } = game
  const preview = param === 'preview'
  const focusParam = param && !preview ? param : null
  const [join, setJoin] = useState<string | null>(null)
  const [stage, setStage] = useState<ShowStage>(event.show.stage)
  const shownStage = useRef(event.show.stage)

  const fit = displayOf(event.show)
  const { scale, top, right, bottom, left } = fit
  useEffect(() => {
    const root = document.documentElement.style
    const vars = displayVars({ scale, top, right, bottom, left })
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v)
    return () => {
      for (const k of Object.keys(vars)) root.removeProperty(k)
    }
  }, [scale, top, right, bottom, left])

  useEffect(() => {
    if (preview) silence()
  }, [preview])

  useEffect(() => {
    if (mode === 'remote') void hello().then((h) => setJoin(h?.join ?? null))
  }, [mode])

  // Stage changes ease over the old screen (play() swaps at once when motion is reduced or another transition is running).
  useEffect(() => {
    const next = event.show.stage
    if (next === shownStage.current) return
    shownStage.current = next
    play(STAGE_FX[next], () => setStage(next))
  }, [event.show.stage])

  // Each match's clock, read through the game context so a running countdown is shown smoothly.
  const rooms: Room[] = roomsOf(event).map((r) => ({ ...r, session: viewOf(r.gameId).run?.session ?? r.session }))

  // One interval for every running clock; it reads the latest rooms through a ref.
  const ref = useRef({ rooms, tickFor })
  useEffect(() => {
    ref.current = { rooms, tickFor }
  })
  useEffect(() => {
    let last = performance.now()
    const id = window.setInterval(() => {
      const t = performance.now()
      for (const r of ref.current.rooms) if (r.session.status === 'live' && currentLot(r.session).running) ref.current.tickFor(r.gameId, t - last)
      last = t
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const out = (node: ReactNode) => (
    <>
      {node}
      {fit.guides && <Guides d={fit} />}
    </>
  )
  if (mode === 'local') return out(<Frame><Message>The presentation screen needs the event server.</Message></Frame>)
  if (!isAdmin) return out(<Frame><div className="mx-auto max-w-md pt-10"><LoginGate /></div></Frame>)

  const props: StageProps = { event, rooms, focus: focusParam ?? event.show.focus, leaderboard, offlineOf, online, join }
  const body: Record<ShowStage, ReactNode> = {
    welcome: <Welcome />,
    rules: <Rules {...props} />,
    join: <Join {...props} />,
    teams: <Teams {...props} />,
    matchups: <Matchups {...props} />,
    auction: <Auction {...props} />,
    twist: <Twist {...props} />,
    results: <Results {...props} />,
  }
  // The welcome is the full-bleed brand card (the player landing's sky), so it is not put in the zoomed frame.
  if (stage === 'welcome') return out(<Welcome />)

  return out(
    <Frame>
      <div key={stage} className="enter flex h-full min-h-0 flex-col">
        {body[stage]}
      </div>
    </Frame>,
  )
}

/** Zoomed for the room (see `.present` in index.css). Sits below the credit strip. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="present">
      <div className="present-screen">{children}</div>
    </div>
  )
}

/** Calibration overlay (Show control, Projector fit, Guides). Outside the zoomed frame, fixed to the screen. */
function Guides({ d }: { d: ShowDisplay }) {
  return (
    <div className="present-guides" aria-hidden="true">
      <div className="present-safe">
        <span>
          Safe area · zoom {d.scale}% · top {d.top}% · right {d.right}% · bottom {d.bottom}% · left {d.left}%
        </span>
      </div>
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p className="grid h-full place-items-center text-center font-display text-[3rem] text-ink-soft">{children}</p>
}
