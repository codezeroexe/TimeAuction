import { useEffect, useRef } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button, { Arrow } from '../components/ui/Button.tsx'
import TechIcon from '../components/game/TechIcon.tsx'
import StatusTracker, { StatusTag } from '../components/game/StatusTracker.tsx'
import { Label, SideBadge, Tag } from '../components/game/bits.tsx'
import { calm, countUp } from '../components/ui/motion.ts'
import { rankRows } from '../game/leaderboard.ts'
import { sidesOf, techNeed } from '../game/auction.ts'
import { finalScore, RUBRIC, scoreTotal, signed, submissionStatus, toolPoints, toolTotal } from '../game/scoring.ts'
import type { CriterionEntry, CriterionId, Submission } from '../game/types.ts'
import { getTech } from '../data/technologies.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'
import { openSolutionFor } from '../state/solutionSide.ts'

const STEP_TEXT = {
  draft: 'Not submitted yet.',
  submitted: 'Locked and waiting for an event judge to accept it into the scoring queue.',
  awaiting: 'In the scoring queue. A judge has not started yet.',
  in_scoring: 'A judge is scoring this solution.',
  scored: 'Scored. Waiting for verification before it can be published.',
  verified: 'Verified. Waiting to be published to the leaderboard.',
  published: 'Published to the leaderboard.',
} as const

/** Decorative radar of the six criteria. The criteria list beside it is the accessible data. */
function Radar({ entries }: { entries: Record<CriterionId, CriterionEntry> }) {
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    return [Math.cos(a) * r * 110, Math.sin(a) * r * 110]
  }
  const ratio = (c: (typeof RUBRIC)[number]) => (entries[c.id].score ?? 0) / c.max
  const data = RUBRIC.map((c, i) => pt(i, ratio(c)))
  return (
    <svg viewBox="-170 -140 340 280" className="mx-auto w-full max-w-[440px] self-center" aria-hidden="true" focusable="false">
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={RUBRIC.map((_, i) => pt(i, k).join(',')).join(' ')} fill="none" className="stroke-line-strong" />
      ))}
      {RUBRIC.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={0} y1={0} x2={x} y2={y} className="stroke-line" />
      })}
      <g className="rad-poly">
        <polygon points={data.map((p) => p.join(',')).join(' ')} className="fill-accent/15 stroke-accent" strokeWidth={2} />
        {data.map(([x, y], i) => (
          <rect key={i} x={x - 3.5} y={y - 3.5} width={7} height={7} className="fill-accent" />
        ))}
      </g>
      {RUBRIC.map((c, i) => {
        const [x, y] = pt(i, 1.2)
        return (
          <text key={c.id} x={x} y={y} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9.5} className="fill-ink-soft">
            {c.label.split(' ')[0].toUpperCase()}
          </text>
        )
      })}
    </svg>
  )
}

/** Exact total for assistive tech; the visible number counts up. */
/** Rubric, each selected technology's points, and the final score. */
function ToolBreakdown({ entries, sub }: { entries: Record<CriterionId, CriterionEntry>; sub: Submission }) {
  return (
    <dl className="mt-6 text-sm">
      <div className="flex justify-between border-b border-line py-2.5">
        <dt>Rubric subtotal</dt>
        <dd className="tabular-nums">{scoreTotal(entries)} / 100</dd>
      </div>
      {toolPoints(sub).map((t) => (
        <div key={t.techId} className="flex justify-between border-b border-line py-2.5">
          <dt>{getTech(t.techId).name} <span className="text-muted">(twist {t.delta > 0 ? '+' : ''}{t.delta}%)</span></dt>
          <dd className="tabular-nums">{signed(t.points)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-b border-line py-2.5">
        <dt>Tool points</dt>
        <dd className="tabular-nums">{signed(toolTotal(sub))}</dd>
      </div>
      <div className="flex justify-between py-2.5 font-semibold">
        <dt>Final score</dt>
        <dd className="tabular-nums">{finalScore(entries, sub)}</dd>
      </div>
    </dl>
  )
}

function BigScore({ total }: { total: number }) {
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (calm()) return
    countUp(el.current, total, 1300)
  }, [total])
  return (
    <>
      <span className="sr-only">{total}</span>
      <span ref={el} aria-hidden="true">{total}</span>
    </>
  )
}

export default function Results() {
  const { state, event, mode, leaderboard, mySide } = useGame()
  const run = state.run
  const s = run?.session

  useEffect(() => {
    if (!state.player) navigate('register')
    else if (!run || !s || !Object.values(run.solutions).some((x) => x?.submission)) navigate(routeForRun(run))
  }, [state.player, run, s])

  if (!run || !s) return null
  const humans = sidesOf(s).filter((id) => s.sides[id].controller === 'human')
  // Three or more human sides: a card grid, highest published score first. Two sides keep the detailed sections.
  const many = humans.length > 2
  // Other sides' technology choices are hidden from this station, so their totals come from the server's leaderboard row.
  const totalsOf = (sub: Submission, entries: Record<CriterionId, CriterionEntry>) => {
    const row = leaderboard.find((r) => r.submissionId === sub.submissionId)
    return row ? { total: row.total, rubric: row.rubric, tools: row.tools } : { total: finalScore(entries, sub), rubric: scoreTotal(entries), tools: toolTotal(sub) }
  }
  const publishedScore = (id: string) => {
    const sub = run.solutions[id]?.submission
    const sc = sub ? event.scores[sub.submissionId] : undefined
    return sc?.status === 'published' ? totalsOf(sub!, sc.entries).total : -1
  }
  const ordered = many ? [...humans].sort((a, b) => publishedScore(b) - publishedScore(a) || s.sides[a].name.localeCompare(s.sides[b].name)) : humans

  return (
    <GameShell fit wide={many}>
      <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Scoring and results</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        Event judges score each locked solution against the 100-point rubric, each selected technology adds or subtracts points by its twist value, a second step verifies it, and only then is
        it published. Scores are never generated automatically.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Tag>Run {run.runId}</Tag>
        <Tag tone={run.ranked ? 'success' : 'neutral'}>{run.ranked ? 'Ranked' : 'Unranked replay'}</Tag>
        <Tag>{mode === 'remote' ? 'Recorded by the event server' : 'Local result · not synchronized'}</Tag>
      </div>

      <div className={many ? 'mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'mt-12 space-y-8'}>
        {ordered.map((id) => {
          const sol = run.solutions[id]
          const sub = sol?.submission
          const score = sub ? event.scores[sub.submissionId] : undefined
          const status = submissionStatus(sol, score)
          const unit = s.sides[id]
          // A side that won too few technologies has nothing to submit: say so instead of offering the builder.
          const need = techNeed(s, id)
          const stepText = !sub && need.short ? `No solution to submit: won ${need.have} of the ${need.need} ${need.need === 1 ? 'technology' : 'technologies'} needed.${mode === 'remote' ? ' Watch the main screen for the results.' : ''}` : STEP_TEXT[status]
          if (many) {
            const rank = sub ? rankRows(leaderboard).find((x) => x.submissionId === sub.submissionId) : undefined
            return (
              <section key={id} aria-labelledby={`res-${id}`} className={`pn flex flex-col p-5 ${mySide === id ? 'ring-2 ring-accent' : ''}`}>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <h2 id={`res-${id}`} className="flex min-w-0 items-center gap-2.5 text-base font-semibold">
                    <SideBadge side={id} />
                    <span className="truncate">{unit.name}</span>
                    {mySide === id && <span className="shrink-0 text-xs font-normal text-accent">(you)</span>}
                  </h2>
                  <StatusTag status={status} />
                </div>
                {score?.status === 'published' ? (
                  <>
                  <p className="mt-4 font-display text-5xl tabular-nums">
                    {totalsOf(sub!, score.entries).total}
                  </p>
                  <p className="mt-1 text-xs text-muted">{totalsOf(sub!, score.entries).rubric} / 100 rubric {signed(totalsOf(sub!, score.entries).tools)} tool points</p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted">{stepText}</p>
                )}
                {rank && <span className="chip chip-wal mt-3 self-start">RANK {rank.rank} OF {leaderboard.length}</span>}
                {!sub && !(need.short && mode === 'remote') && (
                  <Button
                    variant="secondary"
                    className="mt-4 px-4 py-2 self-start"
                    onClick={() => {
                      openSolutionFor(id)
                      navigate('solution')
                    }}
                  >
                    {need.short ? 'Review options' : sol ? 'Continue solution' : 'Open solution builder'}
                  </Button>
                )}
              </section>
            )
          }
          return (
            <section key={id} aria-labelledby={`res-${id}`} className="border-t border-line pt-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 id={`res-${id}`} className="flex items-center gap-2.5 text-xl font-semibold">
                  <SideBadge side={id} />
                  {unit.name}
                </h2>
                <StatusTag status={status} />
              </div>
              <StatusTracker status={status} className="mt-6" />
              <p className="mt-4 text-[15px] text-ink-soft">{stepText}</p>

              {!sub && !(need.short && mode === 'remote') && (
                <Button
                  className="mt-5"
                  onClick={() => {
                    openSolutionFor(id)
                    navigate('solution')
                  }}
                >
                  {need.short ? 'Review options' : sol ? 'Continue solution' : 'Open solution builder'}
                </Button>
              )}

              {sub && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {sub.selectedTechIds.map((t) => (
                    <span key={t} className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm">
                      <TechIcon name={getTech(t).icon} className="h-4 w-4 text-accent" />
                      {getTech(t).name}
                    </span>
                  ))}
                </div>
              )}

              {score?.status === 'published' && (
                <div className="mt-8 grid gap-10 md:grid-cols-2 md:gap-16">
                  <div>
                    <Label>Final score</Label>
                    <p className="mt-2 font-display text-7xl tabular-nums">
                      <BigScore total={sub ? totalsOf(sub, score.entries).total : scoreTotal(score.entries)} />
                    </p>
                    <p className="mt-1 text-sm text-muted">Rubric {scoreTotal(score.entries)} / 100 {sub ? `${signed(totalsOf(sub, score.entries).tools)} tool points` : ''}</p>
                    {sub && (() => {
                      const r = rankRows(leaderboard).find((x) => x.submissionId === sub.submissionId)
                      return r && <span className="chip chip-wal mt-3">RANK {r.rank} OF {leaderboard.length}</span>
                    })()}
                    <p className="mt-2 text-sm text-muted">{event.settings.leaderboardLocked ? 'FINAL' : 'PROVISIONAL until the leaderboard is locked'}</p>
                    <dl className="mt-6 text-sm">
                      {RUBRIC.map((c, ci) => (
                        <div key={c.id} className="crit grid grid-cols-[1fr_auto] gap-x-3 border-b border-line py-2.5" style={{ '--d': ci } as React.CSSProperties}>
                          <dt>{c.label}</dt>
                          <dd className="text-right tabular-nums">
                            {score.entries[c.id].score} / {c.max}
                          </dd>
                          <dd className="bt col-span-full mt-2 h-1 bg-line" aria-hidden="true">
                            <i style={{ width: `${((score.entries[c.id].score ?? 0) / c.max) * 100}%` }} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {sub && sub.selectedTechIds.length > 0 && <ToolBreakdown entries={score.entries} sub={sub} />}
                  </div>
                  <Radar entries={score.entries} />
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:flex-wrap">
        <Button className="px-7 py-3" onClick={() => navigate('leaderboard')}>
          View leaderboard <Arrow />
        </Button>
        <Button variant="secondary" onClick={() => navigate('feedback')}>
          Give feedback
        </Button>
        {mode !== 'remote' && (
          <Button variant="secondary" onClick={() => navigate('replay')}>
            Play again (replay)
          </Button>
        )}
      </div>
    </GameShell>
  )
}
