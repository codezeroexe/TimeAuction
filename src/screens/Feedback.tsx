import { useEffect, useState, type FormEvent } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import { FEEDBACK_COMMENT_MAX, feedbackErrors, type FeedbackInput } from '../game/event.ts'
import { useGame, type ActionResult } from '../state/GameContext.tsx'
import { navigate } from '../state/useRoute.ts'

const QUESTIONS: { id: 'overall' | 'auctionClarity' | 'missionDifficulty'; label: string; low: string; high: string }[] = [
  { id: 'overall', label: 'Overall game experience', low: 'Poor', high: 'Excellent' },
  { id: 'auctionClarity', label: 'How clear was the auction?', low: 'Confusing', high: 'Very clear' },
  { id: 'missionDifficulty', label: 'How difficult was the mission?', low: 'Too easy', high: 'Too hard' },
]

export default function FeedbackScreen() {
  const { state, event, mode, saveFeedback } = useGame()
  // Feedback belongs to the current run, or the most recent finished one after a replay has begun.
  const run = state.run?.session?.status === 'complete' ? state.run : [...state.pastRuns].reverse().find((r) => r.session?.status === 'complete')
  const existing = run ? event.feedback.find((f) => f.runId === run.runId) : undefined
  const [form, setForm] = useState<FeedbackInput>({ overall: 0, auctionClarity: 0, missionDifficulty: 0, comment: '' })
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)

  useEffect(() => {
    if (!state.player) navigate('register')
  }, [state.player])
  if (!state.player) return null

  const errors = feedbackErrors(form)
  const shown = submitted ? errors : {}

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!run || Object.keys(errors).length) return
    return saveFeedback(run.runId, form).then(setResult)
  }

  return (
    <GameShell>
      <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Feedback</h1>

      {!run ? (
        <p className="mt-5 max-w-xl text-[15px] text-ink-soft">Feedback opens once you have completed an auction in a run.</p>
      ) : run.runId === 'SEALED' ? (
        <p className="mt-5 max-w-xl text-[15px] text-ink-soft">Feedback opens after the Timeline Twist is revealed.</p>
      ) : existing ? (
        <section className="mt-8 max-w-xl" role="status">
          <p className="text-[15px] text-success">Thank you. Your feedback for run {existing.runId} was saved{mode === 'remote' ? '' : ' on this device'}.</p>
          <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
            {QUESTIONS.map((q) => (
              <div key={q.id} className="flex justify-between gap-6 py-2.5">
                <dt className="text-muted">{q.label}</dt>
                <dd className="tabular-nums">{existing[q.id]} / 5</dd>
              </div>
            ))}
            <div className="py-2.5">
              <dt className="text-muted">Comment</dt>
              <dd className="mt-1 whitespace-pre-wrap">{existing.comment || '—'}</dd>
            </div>
            <div className="flex justify-between gap-6 py-2.5">
              <dt className="text-muted">Saved</dt>
              <dd>{new Date(existing.submittedAt).toLocaleString()}</dd>
            </div>
          </dl>
          <div className="mt-8 flex gap-3">
            <Button onClick={() => navigate('lobby')}>Back to lobby</Button>
            <Button variant="secondary" onClick={() => navigate('leaderboard')}>
              Leaderboard
            </Button>
          </div>
        </section>
      ) : (
        <form noValidate onSubmit={submit} className="mt-8 max-w-2xl">
          <p className="text-[15px] text-ink-soft">
            For run <span className="font-mono text-[13px]">{run.runId}</span>. {mode === 'remote' ? 'Saved by the event server.' : 'Saved on this device only.'}
          </p>
          {QUESTIONS.map((q) => (
            <fieldset key={q.id} className="mt-8" aria-describedby={shown[q.id] ? `${q.id}-err` : undefined}>
              <legend className="text-sm font-medium">{q.label}</legend>
              <div className="mt-3 grid grid-cols-5 overflow-hidden rounded-full border border-line-strong">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label
                    key={n}
                    className={`cursor-pointer py-2.5 text-center text-sm font-medium tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                      form[q.id] === n ? 'bg-accent text-white' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <input type="radio" name={q.id} value={n} checked={form[q.id] === n} onChange={() => setForm({ ...form, [q.id]: n })} className="sr-only" />
                    {n}
                  </label>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-muted">
                <span>1 · {q.low}</span>
                <span>5 · {q.high}</span>
              </div>
              {shown[q.id] && <p id={`${q.id}-err`} className="mt-1.5 text-sm text-danger">{shown[q.id]}</p>}
            </fieldset>
          ))}
          <div className="relative mt-8">
            <textarea
              id="fb-comment"
              maxLength={FEEDBACK_COMMENT_MAX}
              rows={5}
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              className="peer block w-full rounded-[10px] border border-line-strong bg-paper/70 px-3.5 pt-6 pb-3 text-[15px] focus:border-accent focus:bg-accent-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <label htmlFor="fb-comment" className="pointer-events-none absolute left-3.5 top-2 lbl peer-focus:text-accent">
              Anything else? <span className="normal-case">(optional)</span>
            </label>
            <span className={`absolute top-2 right-3.5 font-mono text-xs tabular-nums ${form.comment.length > FEEDBACK_COMMENT_MAX ? 'text-danger' : 'text-muted'}`}>
              {form.comment.length} / {FEEDBACK_COMMENT_MAX}
            </span>
            {shown.comment && <p className="mt-1.5 text-sm text-danger">{shown.comment}</p>}
          </div>
          {result && !result.ok && <p className="mt-4 text-sm text-danger" role="alert">{result.message}</p>}
          <Button type="submit" className="mt-8 px-8 py-3">
            Save feedback
          </Button>
        </form>
      )}
    </GameShell>
  )
}
