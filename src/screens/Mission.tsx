import { useEffect } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import TechIcon from '../components/game/TechIcon.tsx'
import { cc, isHotSeat, Label, SideBadge, Tag } from '../components/game/bits.tsx'
import { sidesOf } from '../game/auction.ts'
import { signed, toolPoints } from '../game/scoring.ts'
import { MISSIONS, TWISTS, valuesForRun } from '../data/scenario.ts'
import { getTech } from '../data/technologies.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'
import { openSolutionFor } from '../state/solutionSide.ts'

const REACHED = ['mission', 'solution']

export default function Mission() {
  const { state, startSolution, controls, mode } = useGame()
  const run = state.run
  const s = run?.session

  useEffect(() => {
    if (!run || !REACHED.includes(run.phase)) navigate(state.player ? routeForRun(run) : 'register')
  }, [run, state.player])

  if (!run || !s || !REACHED.includes(run.phase)) return null
  const mission = MISSIONS[run.missionId]
  const twist = TWISTS[run.twistId]
  const values = valuesForRun(twist, run.runId)
  const need = s.rules.solutionTechCount
  const humans = sidesOf(s).filter((id) => s.sides[id].controller === 'human' && controls(id))
  const hot = isHotSeat(s) && humans.length > 1

  return (
    <GameShell fit>
      <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Future Mission · {mission.title}</h1>
      <h2 className="mt-6 max-w-[24ch] font-display text-3xl leading-[1.08] text-accent sm:text-5xl">{mission.objective}</h2>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <section className="pn">
          <Label>Constraints on Mars</Label>
          <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-ink-soft">
            {mission.constraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
        <section className="pn">
          <Label>Success means</Label>
          <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-ink-soft">
            {mission.success.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
        <section className="pn">
          <Label className="text-accent">Under the {twist.title}</Label>
          <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-ink-soft">
            {twist.missionImpact.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {humans.map((id) => {
            const strong = s.sides[id].portfolio.filter((t) => (values[t]?.delta ?? 0) > 0)
            if (strong.length === 0) return null
            return (
              <p key={id} className="mt-4 text-sm text-ink-soft">
                <span className="font-semibold text-success">Strong here:</span>{' '}
                {hot && `${s.sides[id].name}: `}
                {strong.map((t) => `${getTech(t).name} +${values[t]!.delta}%`).join(', ')}
              </p>
            )
          })}
        </section>
      </div>

      <section className="mt-8 border-t border-line pt-10" aria-labelledby="resources">
        <Label>
          <span id="resources">Your resources</span>
        </Label>
        <p className="mt-2 text-sm text-muted">
          The solution uses at least {need} of your acquired technologies, as many as you like{run.timed ? ` and must be written within ${s.rules.solutionSeconds / 60} minutes of starting` : ''}. Each technology you select adds or subtracts points by its twist value.
        </p>
        <div className={`mt-6 grid gap-10 ${humans.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {humans.map((id) => {
            const u = s.sides[id]
            const enough = u.portfolio.length >= need
            const sol = run.solutions[id]
            return (
              <div key={id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2.5 text-lg font-semibold">
                    <SideBadge side={id} />
                    {!hot ? 'Your unit' : u.name}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted">Remaining </span>
                    <span className="font-semibold tabular-nums">{cc(u.wallet.balance)}</span>
                  </p>
                </div>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {u.portfolio.length === 0 && <li className="text-sm text-muted">No technologies acquired.</li>}
                  {u.portfolio.map((t) => (
                    <li key={t} className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-sm">
                      <TechIcon name={getTech(t).icon} className="h-4 w-4 text-accent" />
                      {getTech(t).name}
                      <span className="text-xs text-muted tabular-nums">{signed(toolPoints({ ...run, selectedTechIds: [t] })[0].points)} pts</span>
                    </li>
                  ))}
                </ul>
                {!enough && (
                  <p className="mt-3 text-sm text-danger">
                    {u.portfolio.length} of {need} {need === 1 ? 'technology' : 'technologies'} needed, so this side has no solution to submit.{' '}
                    {mode === 'remote' ? 'Your auction is complete: watch the main screen for the results.' : 'Recovery options are on the next screen.'}
                  </p>
                )}
                <div className="mt-5 flex items-center gap-3">
                  <Button
                    className="px-7 py-3 tracking-wide"
                    onClick={() =>
                      startSolution(id).then(() => {
                        openSolutionFor(id)
                        navigate('solution')
                      })
                    }
                  >
                    {sol?.submission ? 'View submission' : !enough ? (mode === 'remote' ? 'What happens next' : 'Review options') : sol ? 'Continue solution' : hot ? `Start solution · ${u.name}` : 'Start solution'}
                  </Button>
                  {sol?.submission && <Tag tone="success">Locked</Tag>}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </GameShell>
  )
}
