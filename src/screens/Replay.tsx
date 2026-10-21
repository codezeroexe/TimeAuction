import { useEffect } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import { StatusTag } from '../components/game/StatusTracker.tsx'
import { Tag } from '../components/game/bits.tsx'
import { RUN_STATUS_LABEL, runStatus } from '../game/records.ts'
import { submissionStatus } from '../game/scoring.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate } from '../state/useRoute.ts'

/** Confirmation screen: a replay archives the current run untouched and starts an unranked one. */
export default function Replay() {
  const { state, event, mode, replay } = useGame()
  const run = state.run

  useEffect(() => {
    if (!state.player) navigate('register')
    else if (mode === 'remote') navigate('lobby')
  }, [state.player, mode])
  if (!state.player || mode === 'remote') return null

  const status = run ? runStatus(run) : null
  const subs = run ? Object.values(run.solutions).filter((s) => s?.submission) : []

  return (
    <GameShell>
      <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Start a replay?</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        A replay is a fresh attempt with a new Run ID, a new wallet (sized to the match: 200 CC per technology up for auction), an empty portfolio and a
        new event log. Replays are <strong className="font-semibold text-ink">unranked</strong>: they never appear on the
        leaderboard and never replace an earlier score.
      </p>

      {run && (
        <section className="mt-10 max-w-2xl border-y border-line py-6" aria-labelledby="current-run">
          <h2 id="current-run" className="lbl">
            Current run, kept exactly as it is
          </h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Run ID</dt>
            <dd className="font-mono text-[13px]">{run.runId}</dd>
            <dt className="text-muted">Ranking</dt>
            <dd>{run.ranked ? 'Ranked' : 'Unranked replay'}</dd>
            <dt className="text-muted">Status</dt>
            <dd>{RUN_STATUS_LABEL[status!]}</dd>
            {subs.map((s) => (
              <div key={s!.submission!.submissionId} className="contents">
                <dt className="text-muted">Submission</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px]">{s!.submission!.submissionId}</span>
                  <StatusTag status={submissionStatus(s!, event.scores[s!.submission!.submissionId])} />
                </dd>
              </div>
            ))}
          </dl>
          {status !== 'submitted' && status !== 'mission' && (
            <p className="mt-4 text-sm text-danger">This run is unfinished. It will be archived as it stands and cannot be resumed.</p>
          )}
          {subs.length > 0 && <p className="mt-4 text-sm text-muted">Its submission stays in the scoring workflow and can still be scored and published.</p>}
        </section>
      )}

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button
          className="px-8 py-3"
          onClick={() => replay().then((r) => r.ok && navigate('match'))}
        >
          Start unranked replay
        </Button>
        <Button variant="ghost" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
      <div className="mt-6">
        <Tag>{state.pastRuns.length + (run ? 1 : 0)} run{state.pastRuns.length + (run ? 1 : 0) === 1 ? '' : 's'} on record</Tag>
      </div>
    </GameShell>
  )
}
