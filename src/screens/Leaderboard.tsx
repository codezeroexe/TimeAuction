import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import LeaderboardTable from '../components/game/LeaderboardTable.tsx'
import { Tag } from '../components/game/bits.tsx'
import { SIDE_IDS } from '../game/types.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate } from '../state/useRoute.ts'

export default function Leaderboard() {
  const { state, event, leaderboard, mySide } = useGame()
  const locked = event.settings.leaderboardLocked
  return (
    <GameShell>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Leaderboard</h1>
          <p className="mt-3 text-[15px] text-ink-soft">{event.settings.eventName}</p>
        </div>
        {locked ? <Tag tone="success">Locked · results FINAL</Tag> : <Tag>Open · results PROVISIONAL</Tag>}
      </div>
      <div className="mt-10">
        {/* A station that controls a side other than the hosting seat (first side) has no rows of its own on the host's match. */}
        <LeaderboardTable rows={leaderboard} currentGameId={mySide && mySide !== SIDE_IDS[0] ? null : state.gameId} />
      </div>
      <div className="mt-12 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row">
        {state.player ? (
          <>
            <Button onClick={() => navigate('feedback')}>Give feedback</Button>
            <Button variant="secondary" onClick={() => navigate('lobby')}>
              Back to lobby
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => navigate('landing')}>
            Back to home
          </Button>
        )}
      </div>
    </GameShell>
  )
}
