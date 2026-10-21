import { useEffect } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import { isHotSeat, Label, SideBadge, speakingSide } from '../components/game/bits.tsx'
import { TwistGraphic, TwistValues } from '../components/game/twistGraphics.tsx'
import { sidesOf } from '../game/auction.ts'
import { TWISTS, twistStrength } from '../data/scenario.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'

const REACHED = ['twist', 'mission', 'solution']

export default function Twist() {
  const { state, acknowledgeTwist, mySide } = useGame()
  const run = state.run

  useEffect(() => {
    if (!run || !REACHED.includes(run.phase)) navigate(state.player ? routeForRun(run) : 'register')
  }, [run, state.player])

  if (!run || !REACHED.includes(run.phase)) return null
  const twist = TWISTS[run.twistId]
  const s = run.session
  const strength = twistStrength(run.runId)

  return (
    <GameShell fit>
      <div className="pn pn-hot p-6">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.6fr)] lg:gap-12">
          <div>
            <span className="chip chip-hot chip-dot">TIMELINE TWIST</span>
            {strength !== 'normal' && <span className="chip ml-2">{strength === 'mild' ? 'Mild' : 'Severe'}</span>}
            <h1 className="mt-3 font-display text-5xl leading-[0.95] text-danger sm:text-6xl">{twist.title}</h1>
            <p className="mt-3 font-display text-xl leading-snug text-ink-soft italic sm:text-2xl">{twist.headline}</p>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">{twist.world}</p>
          </div>
          <TwistGraphic twist={twist} />
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
        <section>
          <Label>New engineering constraints</Label>
          <ul className="mt-3 space-y-2 text-[15px] leading-snug">
            {twist.constraints.map((c) => (
              <li key={c} className="flex gap-3">
                <span aria-hidden="true" className="mt-[10px] h-px w-3 shrink-0 bg-ink" />
                {c}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <Label>What changes for your mission</Label>
          <ul className="mt-3 space-y-2 text-[15px] leading-snug">
            {twist.missionImpact.map((c) => (
              <li key={c} className="flex gap-3">
                <span aria-hidden="true" className="mt-[10px] h-px w-3 shrink-0 bg-accent" />
                {c}
              </li>
            ))}
          </ul>
        </section>
        {s && (
          <section>
            <Label>Your portfolio under this twist</Label>
            {isHotSeat(s, mySide) ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {sidesOf(s).map((id) => (
                  <section key={id} className="mt-3 min-w-0">
                    <p className="flex items-center gap-2.5 text-base font-semibold">
                      <SideBadge side={id} />
                      {s.sides[id].name}
                    </p>
                    <TwistValues twist={twist} runId={run.runId} techIds={s.lots.map((l) => l.techId)} owned={s.sides[id].portfolio} ownTag="Owned" />
                  </section>
                ))}
              </div>
            ) : (
              <TwistValues twist={twist} runId={run.runId} techIds={s.lots.map((l) => l.techId)} owned={s.sides[speakingSide(s, mySide)].portfolio} />
            )}
          </section>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Locked to run <span className="font-mono text-[13px] text-ink">{run.runId}</span>. It will not change on refresh.
        </p>
        <Button
          className="px-8 py-3 tracking-wide"
          onClick={() => acknowledgeTwist().then(() => navigate('mission'))}
        >
          Reveal the Future Mission
        </Button>
      </div>
    </GameShell>
  )
}
