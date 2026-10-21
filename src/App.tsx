import { useEffect, useRef, useState, type JSX } from 'react'
import { GameProvider, useGame, type Boot } from './state/GameContext.tsx'
import { sidesOf } from './game/auction.ts'
import { stationDone } from './game/solution.ts'
import { navigate } from './state/useRoute.ts'
import { detectServer } from './state/remote.ts'
import { Toaster } from './components/ui/toast.tsx'
import Pointer from './components/ui/Pointer.tsx'
import Palette from './components/ui/Palette.tsx'
import Credit from './components/ui/Credit.tsx'
import { loadEvent } from './state/storage.ts'
import { useRoute, type Route } from './state/useRoute.ts'
import Landing from './screens/Landing.tsx'
import Registration from './screens/Registration.tsx'
import Lobby from './screens/Lobby.tsx'
import MatchSetup from './screens/MatchSetup.tsx'
import Auction from './screens/Auction.tsx'
import Summary from './screens/Summary.tsx'
import AuctionLog from './screens/AuctionLog.tsx'
import Twist from './screens/Twist.tsx'
import Mission from './screens/Mission.tsx'
import Solution from './screens/Solution.tsx'
import Results from './screens/Results.tsx'
import Leaderboard from './screens/Leaderboard.tsx'
import FeedbackScreen from './screens/Feedback.tsx'
import Replay from './screens/Replay.tsx'
import Rules from './screens/Rules.tsx'
import Admin from './screens/admin/Admin.tsx'
import Presentation from './screens/present/Presentation.tsx'
import Idle from './screens/Idle.tsx'
import ScorePanel from './screens/admin/ScorePanel.tsx'

const SCREENS: Record<Route, (p: { param: string | null }) => JSX.Element | null> = {
  landing: Landing,
  register: Registration,
  lobby: Lobby,
  match: MatchSetup,
  auction: Auction,
  summary: Summary,
  log: AuctionLog,
  twist: Twist,
  mission: Mission,
  solution: Solution,
  results: Results,
  leaderboard: Leaderboard,
  feedback: FeedbackScreen,
  replay: Replay,
  rules: Rules,
  admin: Admin,
  score: ScorePanel,
  present: Presentation,
  idle: Idle,
}

function Screens() {
  const { route, param } = useRoute()
  const Screen = SCREENS[route]
  return <Screen param={param} />
}

/** Idle after a finished match: a player PC with no input for this long goes to the attract screen. */
const AFTER_MATCH_IDLE_MS = 60_000
const NO_IDLE: Route[] = ['idle', 'present', 'admin', 'score']

function AfterMatchIdle({ route }: { route: Route }) {
  const { mode, isAdmin, state, controls, leaveStation } = useGame()
  const run = state.run
  const mineKey = run?.session ? sidesOf(run.session).filter((id) => run.session!.sides[id].controller === 'human' && controls(id)).join() : ''
  const armed = mode === 'remote' && !isAdmin && !NO_IDLE.includes(route) && run?.session?.status === 'complete'
  // Read at the deadline, so server pushes (which replace `run`) do not restart the countdown.
  const latest = useRef<() => boolean>(() => false)
  useEffect(() => {
    latest.current = () => stationDone(run, mineKey ? mineKey.split(',') : [], Date.now())
  })
  useEffect(() => {
    if (!armed) return
    let timer = 0
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        // Free the PC for the next player: the finished registration and its records stay on the server.
        if (latest.current()) void leaveStation().finally(() => navigate('idle'))
        else reset()
      }, AFTER_MATCH_IDLE_MS)
    }
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const
    for (const e of events) window.addEventListener(e, reset, { passive: true })
    reset()
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, reset)
    }
  }, [armed, leaveStation])
  return null
}

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null)
  const { route } = useRoute()
  useEffect(() => {
    // An event server, when one is reachable, is the authority; otherwise this device plays on its own.
    detectServer().then((up) => setBoot(up ? { mode: 'remote' } : { mode: 'local', load: loadEvent() }))
  }, [])
  if (!boot) return null
  return (
    <GameProvider boot={boot}>
      {route !== 'idle' && <Credit as="header" />}
      <Screens />
      <AfterMatchIdle route={route} />
      {/* The projector shows the screen only: no toasts, custom pointer or command palette. */}
      {route !== 'present' && route !== 'idle' && (
        <>
          <Toaster />
          <Pointer />
          <Palette />
        </>
      )}
    </GameProvider>
  )
}
