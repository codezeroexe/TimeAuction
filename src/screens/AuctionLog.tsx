import { useEffect, useState } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import EventTable from '../components/game/EventTable.tsx'
import { useGame } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'

/** Read-only, append-only event history. Nothing here can alter an event. */
export default function AuctionLog() {
  const { state } = useGame()
  const s = state.run?.session
  const [money, setMoney] = useState(false)

  useEffect(() => {
    if (!s || s.status === 'ready') navigate(state.player ? routeForRun(state.run) : 'register')
  }, [s, state.run, state.player])

  if (!s) return null
  const events = money ? s.events.filter((e) => ['bid_accepted', 'bid_rejected', 'sold', 'purchase'].includes(e.type)) : s.events

  return (
    <GameShell wide>
      <button type="button" onClick={() => navigate(s.status === 'complete' ? 'summary' : 'auction')} className="text-sm text-muted transition-colors hover:text-ink">
        &larr; Back to {s.status === 'complete' ? 'summary' : 'auction'}
      </button>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Auction log</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-ink-soft">
            Every recorded event for session <span className="font-mono text-[13px]">{s.sessionId}</span>, in order. Coins only
            move on <em>Purchase</em> events.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={money} onChange={(e) => setMoney(e.target.checked)} className="accent-accent" />
          Bids and purchases only
        </label>
      </div>

      <EventTable session={s} events={events} />

      <div className="mt-8">
        <Button variant="secondary" onClick={() => navigate(s.status === 'complete' ? 'summary' : 'auction')}>
          Back to {s.status === 'complete' ? 'summary' : 'auction'}
        </Button>
      </div>
    </GameShell>
  )
}
