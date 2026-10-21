import { useState } from 'react'
import AdminShell, { Empty } from './AdminShell.tsx'
import Button from '../../components/ui/Button.tsx'
import TechIcon from '../../components/game/TechIcon.tsx'
import StatusTracker, { StatusTag } from '../../components/game/StatusTracker.tsx'
import { matchLabel } from '../../components/game/bits.tsx'
import { TwistValues } from '../../components/game/twistGraphics.tsx'
import { findSubmission } from '../../game/records.ts'
import { entryError, finalScore, missingCriteria, RUBRIC, RUBRIC_MAX, scoreTotal, signed, submissionStatus, toolPoints, toolTotal } from '../../game/scoring.ts'
import { CHARACTERISTICS, MISSIONS, TWISTS } from '../../data/scenario.ts'
import { getTech } from '../../data/technologies.ts'
import type { CriterionEntry, CriterionId, ScoreRecord } from '../../game/types.ts'
import { useGame, type ActionResult } from '../../state/GameContext.tsx'
import { hrefFor } from '../../state/useRoute.ts'

const field =
  'block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[15px] focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none aria-invalid:border-danger disabled:bg-paper disabled:text-ink-soft'

export default function ScorePanel({ param }: { param: string | null }) {
  const { event } = useGame()
  const r = param ? findSubmission(event, param) : undefined
  if (!r?.submission || !r.score)
    return (
      <AdminShell section="scoring">
        <Empty>
          This submission is not in the scoring workflow. <a className="underline" href={hrefFor('admin', 'scoring')}>Back to the scoring queue</a>
        </Empty>
      </AdminShell>
    )
  // Keyed so local edits reset if the record changes underneath (e.g. after a correction).
  return (
    <AdminShell section="scoring">
      <Panel key={`${r.score.submissionId}-${r.score.status}-${r.score.corrections.length}`} submissionId={param!} />
    </AdminShell>
  )
}

function Panel({ submissionId }: { submissionId: string }) {
  const game = useGame()
  const r = findSubmission(game.event, submissionId)!
  const sub = r.submission!
  const rec = r.score!
  const editable = rec.status === 'awaiting' || rec.status === 'in_scoring'
  const [entries, setEntries] = useState<Record<CriterionId, CriterionEntry>>(rec.entries)
  const [raw, setRaw] = useState<Record<CriterionId, string>>(() => Object.fromEntries(RUBRIC.map((c) => [c.id, rec.entries[c.id].score?.toString() ?? ''])) as Record<CriterionId, string>)
  const [result, setResult] = useState<ActionResult | null>(null)
  const operator = game.event.settings.operator.trim()
  const status = submissionStatus(r.solution, rec)
  const twist = TWISTS[sub.twistId]
  const mission = MISSIONS[sub.missionId]

  const setScore = (id: CriterionId, text: string) => {
    setRaw({ ...raw, [id]: text })
    const n = text.trim() === '' ? null : Number(text)
    setEntries({ ...entries, [id]: { ...entries[id], score: n } })
  }
  const errors = RUBRIC.map((c) => [c.id, entryError(c.id, entries[c.id].score)] as const).filter(([, e]) => e)
  const missing = missingCriteria(entries)
  const total = scoreTotal(entries)
  const tools = toolPoints(sub)
  const canSubmit = editable && errors.length === 0 && missing.length === 0 && !!operator

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href={hrefFor('admin', 'scoring')} className="text-sm text-muted hover:text-ink">&larr; Scoring queue</a>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{sub.unitName}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono text-[13px]">{sub.submissionId}</span> · {matchLabel(r.session)} · {sub.ranked ? 'ranked' : 'unranked replay'}
          </p>
        </div>
        <StatusTag status={status} />
      </div>
      <StatusTracker status={status} className="mt-6" />

      <div className="mt-10 grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:gap-14">
        {/* What the judge scores against, all in one place */}
        <article aria-label="Submission under review" className="space-y-8">
          <section>
            <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Future Mission</h2>
            <p className="mt-2 font-display text-2xl leading-snug">{mission.objective}</p>
          </section>
          <section>
            <h2 className="text-[13px] font-semibold tracking-wide text-accent uppercase">Timeline Twist · {twist.title}</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {twist.constraints.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="mt-3 text-sm text-ink">{twist.judgeGuide}</p>
            <p className="mt-4 text-[13px] text-muted">Context only. Score by judgement.</p>
            <TwistValues twist={twist} runId={sub.runId} techIds={r.session.lots.map((l) => l.techId)} owned={sub.purchasedTechIds} ownTag="Bought" />
          </section>
          <section>
            <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Selected technologies</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {sub.selectedTechIds.map((t) => (
                <li key={t} className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm">
                  <TechIcon name={getTech(t).icon} className="h-4 w-4 text-accent" />
                  {getTech(t).name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted">
              Characteristics: {sub.characteristics.map((c) => CHARACTERISTICS.find((x) => x.id === c)!.label).join(', ')} · Acquired:{' '}
              {sub.purchasedTechIds.map((t) => getTech(t).name).join(', ')}
            </p>
          </section>
          <section>
            <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Solution · {sub.wordCount} words{sub.auto ? " · submitted automatically when time ran out" : ""}</h2>
            <p className="mt-3 border-l border-line-strong pl-5 text-[16px] leading-relaxed whitespace-pre-wrap">{sub.text}</p>
          </section>
          <p className="text-xs text-muted">
            Game {sub.gameId} · Run {sub.runId} · Session {sub.sessionId} · submitted {new Date(sub.submittedAt).toLocaleString()}
          </p>
        </article>

        <section aria-labelledby="rubric-title">
          <div className="flex items-baseline justify-between">
            <h2 id="rubric-title" className="text-[13px] font-semibold tracking-wide text-muted uppercase">Rubric</h2>
            <p className="font-display text-4xl tabular-nums" aria-live="polite">
              {total}
              <span className="ml-1 font-sans text-base text-muted">/ {RUBRIC_MAX}</span>
            </p>
          </div>
          <p className="mt-1 text-right text-xs text-muted">Rubric subtotal</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {RUBRIC.map((c) => {
              const err = entryError(c.id, entries[c.id].score)
              return (
                <li key={c.id} className="py-4">
                  <div className="grid grid-cols-[1fr_6.5rem] items-start gap-4">
                    <label htmlFor={`s-${c.id}`}>
                      <span className="block font-medium">{c.label}</span>
                      <span className="block text-[13px] text-muted">{c.id === 'twist' ? twist.judgeGuide : c.guide}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`s-${c.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={c.max}
                        step={1}
                        value={raw[c.id]}
                        disabled={!editable}
                        onChange={(e) => setScore(c.id, e.target.value)}
                        aria-invalid={!!err}
                        aria-describedby={err ? `e-${c.id}` : undefined}
                        className={`${field} text-right tabular-nums`}
                      />
                      <span className="text-sm whitespace-nowrap text-muted">/ {c.max}</span>
                    </div>
                  </div>
                  {err && <p id={`e-${c.id}`} className="mt-1.5 text-sm text-danger">{err}</p>}
                </li>
              )
            })}
          </ul>

          <div className="mt-6">
            <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Tool points (automatic)</h3>
            <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
              {tools.map((t) => (
                <li key={t.techId} className="flex justify-between py-2">
                  <span>{getTech(t.techId).name} <span className="text-muted">(twist {t.delta > 0 ? '+' : ''}{t.delta}%)</span></span>
                  <span className="tabular-nums">{signed(t.points)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-baseline justify-between">
              <span className="text-sm">Rubric {total} / 100 · tool points {signed(toolTotal(sub))} · final score</span>
              <span className="font-display text-4xl tabular-nums" aria-live="polite">{finalScore(entries, sub)}</span>
            </p>
          </div>

          {!operator && (
            <p className="mt-4 text-sm text-danger">{game.mode === 'remote' ? 'Sign in with your judge name so scoring actions are attributed to you.' : 'Enter an operator label in the header so scoring actions are attributed to someone.'}</p>
          )}
          {editable && missing.length > 0 && <p className="mt-4 text-sm text-muted">{missing.length} of 6 criteria still need a score before submission.</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            {editable && (
              <>
                <Button disabled={!canSubmit} className="px-6" onClick={() => game.submitScores(submissionId, entries).then(setResult)}>
                  Submit scores
                </Button>
                <Button variant="secondary" disabled={errors.length > 0} onClick={() => game.saveScoreDraft(submissionId, entries).then(setResult)}>
                  Save draft
                </Button>
              </>
            )}
            {rec.status === 'scored' && (
              <Button disabled={!operator} className="px-6" onClick={() => game.verifyScore(submissionId).then(setResult)}>
                Verify score
              </Button>
            )}
            {rec.status === 'verified' && (
              <Button disabled={!operator || game.event.settings.leaderboardLocked} className="px-6" onClick={() => game.publishScore(submissionId).then(setResult)}>
                Publish to leaderboard
              </Button>
            )}
            {rec.status === 'published' && <p className="self-center text-sm text-success">Published {rec.publishedAt && new Date(rec.publishedAt).toLocaleString()}. Visible on the leaderboard.</p>}
          </div>
          {result && <p className={`mt-3 text-sm ${result.ok ? 'text-success' : 'text-danger'}`} role="status">{result.message}</p>}
          {rec.status === 'verified' && game.event.settings.leaderboardLocked && <p className="mt-2 text-sm text-muted">The leaderboard is locked; unlock it to publish.</p>}

          <History rec={rec} />
          {!editable && <Correction rec={rec} onCorrect={(c, v, reason) => game.correctScore(submissionId, c, v, reason)} />}
        </section>
      </div>
    </>
  )
}

function History({ rec }: { rec: ScoreRecord }) {
  const rows: [string, string | undefined, string | undefined][] = [
    ['Queued', rec.queuedAt, rec.queuedBy],
    ['Draft saved', rec.draftSavedAt, undefined],
    ['Scored', rec.scoredAt, rec.scoredBy],
    ['Verified', rec.verifiedAt, rec.verifiedBy],
    ['Published', rec.publishedAt, rec.publishedBy],
  ]
  return (
    <section className="mt-10 border-t border-line pt-6" aria-labelledby="history">
      <h3 id="history" className="text-[13px] font-semibold tracking-wide text-muted uppercase">Record</h3>
      <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
        {rows.filter(([, at]) => at).map(([k, at, by]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>
              {new Date(at!).toLocaleString()}
              {by && <span className="text-muted"> · {by}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {rec.corrections.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {rec.corrections.map((c, i) => (
            <li key={i}>
              <span className="text-muted">{new Date(c.at).toLocaleString()} · {c.by}:</span> {RUBRIC.find((x) => x.id === c.criterion)!.label} {c.previous} → {c.corrected}. <span className="text-ink-soft">“{c.reason}”</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Correction({ rec, onCorrect }: { rec: ScoreRecord; onCorrect: (c: CriterionId, v: number, reason: string) => Promise<ActionResult> }) {
  const [open, setOpen] = useState(false)
  const [criterion, setCriterion] = useState<CriterionId>('relevance')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const max = RUBRIC.find((c) => c.id === criterion)!.max

  if (!open)
    return (
      <div className="mt-8">
        <Button variant="ghost" onClick={() => setOpen(true)}>Correct a score…</Button>
        {result?.ok && <p className="mt-2 text-sm text-success" role="status">{result.message}</p>}
      </div>
    )

  return (
    <form
      className="mt-8 rounded-md border border-line-strong bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await onCorrect(criterion, value.trim() === '' ? NaN : Number(value), reason)
        setResult(r)
        if (r.ok) setOpen(false)
      }}
    >
      <h3 className="font-semibold">Correction</h3>
      <p className="mt-1 text-sm text-ink-soft">
        The previous value, the new value and your reason are recorded. The score returns to SCORED and must be verified{rec.status === 'published' ? ' and published' : ''} again.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_7rem]">
        <label className="text-sm">
          Criterion
          <select value={criterion} onChange={(e) => setCriterion(e.target.value as CriterionId)} className={`${field} mt-1.5`}>
            {RUBRIC.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} (now {rec.entries[c.id].score} / {c.max})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          New value
          <input type="number" min={0} max={max} step={1} value={value} onChange={(e) => setValue(e.target.value)} className={`${field} mt-1.5 text-right tabular-nums`} />
        </label>
      </div>
      <label className="mt-4 block text-sm">
        Reason <span className="text-muted">(required)</span>
        <textarea rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={`${field} mt-1.5`} />
      </label>
      {result && !result.ok && <p className="mt-2 text-sm text-danger" role="alert">{result.message}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={reason.trim().length < 5 || value === ''}>Apply correction</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
