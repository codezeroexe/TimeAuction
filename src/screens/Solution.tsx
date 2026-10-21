import { useEffect, useRef, useState } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import TechIcon from '../components/game/TechIcon.tsx'
import { isHotSeat, Label, SideBadge, Tag } from '../components/game/bits.tsx'
import { calm } from '../components/ui/motion.ts'
import { SFX } from '../components/ui/sfx.ts'
import { sidesOf } from '../game/auction.ts'
import { signed, toolPoints } from '../game/scoring.ts'
import { checkSolution } from '../game/solution.ts'
import { DRAFT_GRACE_MS } from '../game/actions.ts'
import { MAX_CHARACTERISTICS, SOLUTION_TEXT_MAX, SOLUTION_WORDS } from '../game/rules.ts'
import { CHARACTERISTICS, MISSIONS, TWISTS } from '../data/scenario.ts'
import { getTech } from '../data/technologies.ts'
import type { Characteristic, Run, Session, SideId, SolutionDraft, SolutionState } from '../game/types.ts'
import { useGame, type ActionResult } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'
import { takePreferredSide } from '../state/solutionSide.ts'

export default function Solution() {
  const { state, controls } = useGame()
  const run = state.run
  const s = run?.session

  useEffect(() => {
    if (!run || run.phase !== 'solution') navigate(state.player ? routeForRun(run) : 'register')
  }, [run, state.player])

  const humans = s ? sidesOf(s).filter((id) => s.sides[id].controller === 'human' && controls(id)) : []
  const [side, setSide] = useState<SideId>(
    () => [takePreferredSide()].find((id) => id && humans.includes(id)) ?? humans.find((id) => !run?.solutions[id]?.submission) ?? humans[0] ?? (s ? sidesOf(s)[0] : ''),
  )

  if (!run || !s || run.phase !== 'solution') return null
  const hot = isHotSeat(s) && humans.length > 1
  const sol = run.solutions[side]

  return (
    <GameShell fit>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Engineer your solution</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-ink-soft">
            {MISSIONS[run.missionId].objective}{' '}
            <span className="text-accent">Under the {TWISTS[run.twistId].title}: {TWISTS[run.twistId].short}.</span>
          </p>
        </div>
        {sol && !sol.submission && sol.deadline !== null && <Countdown deadline={sol.deadline} />}
      </div>

      {hot && (
        <div role="tablist" aria-label="Choose side" className="mt-8 flex gap-1 border-b border-line">
          {humans.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={side === id}
              onClick={() => setSide(id)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                side === id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <SideBadge side={id} />
              {s.sides[id].name}
              {run.solutions[id]?.submission && <span className="text-xs text-success">· locked</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mt-10">
        {sol?.submission ? (
          <Locked run={run} session={s} sol={sol} hot={hot} onSwitch={(id) => setSide(id)} />
        ) : s.sides[side].portfolio.length < s.rules.solutionTechCount ? (
          <NotEnough session={s} side={side} />
        ) : sol ? (
          <Builder key={`${side}-${sol.startedAt}-${sol.reopened?.length ?? 0}`} run={run} session={s} side={side} sol={sol} />
        ) : (
          <NotStarted run={run} session={s} side={side} />
        )}
      </div>
    </GameShell>
  )
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

function Countdown({ deadline }: { deadline: number }) {
  const now = useNow(true)
  const left = Math.max(0, Math.ceil((deadline - now) / 1000))
  const mm = String(Math.floor(left / 60))
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="text-right">
      <p className="text-xs tracking-wide text-muted uppercase">{left > 0 ? 'Time remaining' : 'Time is up'}</p>
      <p className={`mt-1 text-4xl font-semibold tabular-nums ${left <= 30 ? 'text-danger' : ''}`} role="timer" aria-live="off">
        {mm}:{ss}
      </p>
    </div>
  )
}

function NotStarted({ run, session, side }: { run: Run; session: Session; side: SideId }) {
  const { startSolution } = useGame()
  return (
    <div className="max-w-xl">
      <p className="text-[15px] leading-relaxed text-ink-soft">
        {session.sides[side].name} has not started.{' '}
        {run.timed ? `The ${session.rules.solutionSeconds / 60}-minute clock starts when you press Start.` : 'This session is untimed.'}
      </p>
      <Button className="mt-5 px-7 py-3" onClick={() => startSolution(side)}>
        Start solution
      </Button>
    </div>
  )
}

function NotEnough({ session, side }: { session: Session; side: SideId }) {
  const { mode } = useGame()
  const u = session.sides[side]
  const need = session.rules.solutionTechCount
  return (
    <section className="max-w-2xl" aria-labelledby="not-enough">
      <h2 id="not-enough" className="font-display text-3xl">
        {u.name} acquired {u.portfolio.length} of the {need} {need === 1 ? 'technology' : 'technologies'} a solution needs
      </h2>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
        A solution uses at least {need} distinct {need === 1 ? 'technology' : 'technologies'} your unit owns. Technologies you did not win
        cannot be borrowed or added, so this run cannot produce a valid submission.
      </p>
      {u.portfolio.length > 0 && (
        <p className="mt-3 text-sm text-muted">Owned: {u.portfolio.map((t) => getTech(t).name).join(', ')}.</p>
      )}
      {mode === 'remote' ? (
        <div className="mt-8 border-t border-line pt-6">
          <p className="text-[15px] text-ink-soft">
            Your auction is complete and there is nothing to submit. Watch the main screen for the results, or tell the event team if you think this is wrong.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => navigate('leaderboard')}>View leaderboard</Button>
            <Button variant="secondary" onClick={() => navigate('lobby')}>
              Back to lobby
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 border-t border-line pt-6">
          <p className="text-sm text-ink-soft">
            Recovery: start a replay. It gets a new Run ID, keeps this run on record, and is <strong className="font-semibold">unranked</strong>.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => navigate('replay')}
            >
              Start a new run (unranked replay)
            </Button>
            <Button variant="secondary" onClick={() => navigate('lobby')}>
              Back to lobby
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function Builder({ run, session, side, sol }: { run: Run; session: Session; side: SideId; sol: SolutionState }) {
  const { updateDraft, submitSolution, autoSubmit, mode } = useGame()
  const [result, setResult] = useState<ActionResult | null>(null)
  const now = useNow(sol.deadline !== null)
  const expired = sol.deadline !== null && now > sol.deadline
  const unit = session.sides[side]
  const need = session.rules.solutionTechCount
  // Typing edits a local copy; it is saved to the authority shortly after each pause and before submitting.
  const [draft, setDraft] = useState<SolutionDraft>(sol.draft)
  const [save, setSave] = useState<'saved' | 'saving' | ActionResult>('saved')
  const pending = useRef<{ draft: SolutionDraft; timer: number } | null>(null)
  const check = checkSolution(draft, unit.portfolio, need)

  const flush = () => {
    const p = pending.current
    if (!p) return Promise.resolve({ ok: true, message: '' })
    window.clearTimeout(p.timer)
    pending.current = null
    setSave('saving')
    return updateDraft(side, p.draft).then((r) => {
      if (!pending.current) setSave(r.ok ? 'saved' : r)
      return r
    })
  }
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  useEffect(() => () => void flushRef.current(), [])

  const edit = (next: SolutionDraft) => {
    setDraft(next)
    setSave('saving')
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = { draft: next, timer: window.setTimeout(() => void flushRef.current(), 400) }
  }

  // Time up: save the last edit now; the event server then locks the draft by itself. Single-device mode locks it here.
  useEffect(() => {
    if (!expired || sol.submission) return
    void flushRef.current()
    if (mode !== 'local') return
    const t = window.setTimeout(() => void autoSubmit(side), DRAFT_GRACE_MS + 100)
    return () => window.clearTimeout(t)
  }, [expired, sol.submission, mode, autoSubmit, side])

  const submit = async () => {
    const saved = await flush()
    if (!saved.ok) return setResult(saved)
    setResult(await submitSolution(side))
  }

  const toggleTech = (id: string) =>
    edit({ ...draft, techIds: draft.techIds.includes(id) ? draft.techIds.filter((t) => t !== id) : [...draft.techIds, id] })
  const toggleChar = (id: Characteristic) =>
    edit({
      ...draft,
      characteristics: draft.characteristics.includes(id) ? draft.characteristics.filter((c) => c !== id) : [...draft.characteristics, id],
    })

  const wc = check.wordCount
  const wcTone = wc === 0 ? 'text-muted' : wc < SOLUTION_WORDS.min ? 'text-danger' : 'text-success'

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-16">
      <div>
        <fieldset disabled={expired}>
          <div className="flex items-baseline justify-between">
            <legend className="text-[13px] font-semibold tracking-wide text-muted uppercase">Technologies</legend>
            <span className={`text-sm tabular-nums ${draft.techIds.length >= need ? 'text-success' : 'text-ink-soft'}`}>
              {draft.techIds.length} selected
            </span>
          </div>
          <SystemGraph ids={draft.techIds} need={need} onRemove={expired ? undefined : toggleTech} />
          <ul className="mt-3 space-y-2">
            {session.lots.map(({ techId, status, leader }) => {
              const t = getTech(techId)
              const owned = unit.portfolio.includes(techId)
              const checked = draft.techIds.includes(techId)
              return (
                <li key={techId}>
                  <label
                    className={`tk has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${checked ? 'used' : ''} ${
                      owned ? 'cursor-pointer hover:translate-x-1 hover:border-accent' : 'cursor-not-allowed'
                    } ${owned ? '' : 'opacity-35'}`}
                  >
                    <input type="checkbox" className="sr-only" checked={checked} disabled={!owned} onChange={() => toggleTech(techId)} aria-label={t.name} />
                    <span className="ic">
                      <TechIcon name={t.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[15px] ${owned ? 'font-medium' : 'text-muted'}`}>{t.name}</span>
                      <span className="block text-[13px] text-muted">
                        {owned
                          ? `${checked ? 'Placed in system' : t.strengths[0]} · ${signed(toolPoints({ ...run, selectedTechIds: [techId] })[0].points)} pts`
                          : status === 'sold'
                            ? `Not acquired · owned by ${session.sides[leader!].name}`
                            : 'Not acquired · unsold'}
                      </span>
                    </span>
                    {checked && (
                      <svg viewBox="0 0 16 16" className="ml-auto h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>

        <fieldset disabled={expired} className="mt-10">
          <div className="flex items-baseline justify-between">
            <legend className="text-[13px] font-semibold tracking-wide text-muted uppercase">Characteristics</legend>
            <span className="text-sm text-ink-soft tabular-nums">
              {draft.characteristics.length}/{MAX_CHARACTERISTICS}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">Choose 1 to {MAX_CHARACTERISTICS} that your solution delivers.</p>
          <ul className="mt-3 space-y-1">
            {CHARACTERISTICS.map((c) => {
              const checked = draft.characteristics.includes(c.id)
              const full = !checked && draft.characteristics.length >= MAX_CHARACTERISTICS
              return (
                <li key={c.id}>
                  <label className={`flex items-start gap-3 rounded-md px-2 py-2 ${full ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-ink/[0.03]'}`}>
                    <input type="checkbox" className="mt-1 accent-accent" checked={checked} disabled={full} onChange={() => toggleChar(c.id)} aria-label={c.label} />
                    <span>
                      <span className="block text-[15px] font-medium">{c.label}</span>
                      <span className="block text-[13px] text-muted">{c.help}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      </div>

      <div>
        <div className="flex justify-end">
          <span className={`text-sm tabular-nums ${wcTone}`} aria-live="polite">
            {wc} words <span className="text-muted">· at least {SOLUTION_WORDS.min}, about {SOLUTION_WORDS.max} suggested</span>
          </span>
        </div>
        <p className={`mt-1 text-right text-xs ${typeof save === 'object' ? 'text-danger' : 'text-muted'}`} role="status">
          {save === 'saved' ? 'Draft saved' : save === 'saving' ? 'Saving draft…' : `Draft not saved: ${save.message}`}
        </p>
        <div className="fld">
          <textarea
            id="solution-text"
            maxLength={SOLUTION_TEXT_MAX}
            value={draft.text}
            readOnly={expired}
            onChange={(e) => edit({ ...draft, text: e.target.value })}
            rows={14}
            placeholder="Explain how your chosen technologies work together to keep a Mars settlement alive under your timeline twist…"
            aria-describedby="solution-hint"
            className="block"
          />
          <label htmlFor="solution-text">Your solution</label>
        </div>
        <p id="solution-hint" className="mt-2 text-sm text-muted">
          Name how each selected technology contributes, and how the system copes with your timeline twist.
        </p>

        <div className="mt-8 border-t border-line pt-6">
          <ul className="space-y-1.5 text-sm" aria-label="Submission checklist">
            <Check ok={!check.techs} text={check.techs ?? `${draft.techIds.length} acquired ${draft.techIds.length === 1 ? 'technology' : 'technologies'} selected`} />
            <Check ok={!check.characteristics} text={check.characteristics ?? `${draft.characteristics.length} characteristic${draft.characteristics.length > 1 ? 's' : ''} selected`} />
            <Check ok={!check.words} text={check.words ?? `${wc} words (at least ${SOLUTION_WORDS.min})`} />
          </ul>
          {expired && (
            <p className="mt-4 text-sm text-danger">
              Time is up and editing is locked. Your solution is being submitted automatically as it stands.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <HoldLock disabled={!check.valid} onDone={submit} />
            <p className="text-sm text-muted">Hold for one second. Locked submissions cannot be edited. Run {run.runId}.</p>
          </div>
          {result && !result.ok && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {result.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Slots follow the draft's technology order; clicking a filled slot removes it (checkboxes stay the keyboard route). */
function SystemGraph({ ids, need, onRemove }: { ids: string[]; need: number; onRemove?: (id: string) => void }) {
  const full = ids.length >= need
  // One slot per selected technology, plus an empty one to show more can be added.
  const slots = Math.max(need, ids.length + (onRemove ? 1 : 0))
  const H = 50 + (slots - 1) * 75
  const ys = Array.from({ length: slots }, (_, i) => 30 + i * 75)
  const cy = H / 2 + 5
  return (
    <svg viewBox={`0 0 560 ${H + 60}`} className="my-4 h-auto w-full" aria-hidden="true">
      {ys.map((y, i) => (
        <path key={i} className="ln" fill="none" stroke="var(--color-accent)" d={`M130 ${y + 25}C190 ${y + 25} 190 ${cy} 212 ${cy}`} opacity={ids[i] ? 1 : 0.15} />
      ))}
      {ys.map((y, i) => {
        const t = ids[i] ? getTech(ids[i]) : null
        return (
          <g key={i} transform={`translate(20 ${y})`} className={t && onRemove ? 'cursor-pointer' : ''} onClick={() => t && onRemove?.(ids[i])}>
            <rect width="110" height="50" rx="8" fill={t ? 'var(--color-accent-soft)' : 'none'} stroke={t ? 'var(--color-accent)' : 'var(--color-line-strong)'} strokeDasharray={t ? undefined : '5 5'} />
            <text x="55" y="30" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill={t ? 'var(--color-ink)' : 'var(--color-muted)'}>
              {t ? t.name.replace('Artificial Intelligence', 'AI') : `slot ${i + 1}`}
            </text>
          </g>
        )
      })}
      <g transform={`translate(260 ${cy})`}>
        <polygon points="-48,0 -24,-42 24,-42 48,0 24,42 -24,42" fill={full ? 'var(--color-accent)' : 'none'} stroke="var(--color-accent)" strokeWidth="1.6" />
        <text textAnchor="middle" y="5" fontWeight="700" fontSize="12" fill={full ? '#fff' : 'var(--color-accent)'}>
          MARS SYSTEM
        </text>
      </g>
      <g transform={`translate(410 ${cy})`}>
        <line x1="-90" x2="-48" y1="0" y2="0" stroke="var(--color-line-strong)" />
        <text y="-12" fontFamily="var(--font-mono)" fontSize="10" fill="var(--color-muted)">OUTPUT</text>
        <text y="8" fontFamily="var(--font-mono)" fontSize="12" fill="var(--color-ink-soft)">water · power · air</text>
      </g>
    </svg>
  )
}

const HOLD_MS = 1000

/** Hold (pointer, or Space/Enter) for 1s, then calls onDone. Releasing early cancels. Reduced motion shows a text percentage instead of a sweep. */
function HoldLock({ disabled, onDone }: { disabled: boolean; onDone: () => unknown }) {
  const fill = useRef<HTMLSpanElement>(null)
  const raf = useRef(0)
  const fired = useRef(false)
  const [pct, setPct] = useState<number | null>(null)
  const reduce = calm()

  const stop = () => {
    cancelAnimationFrame(raf.current)
    if (fill.current) fill.current.style.transform = 'scaleX(0)'
    if (!fired.current) setPct(null)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  const start = () => {
    if (disabled || fired.current || raf.current) return
    const t0 = performance.now()
    const f = (t: number) => {
      const k = Math.min(1, (t - t0) / HOLD_MS)
      if (fill.current) fill.current.style.transform = `scaleX(${k})`
      if (reduce) setPct(Math.round(k * 100))
      if (k < 1) {
        raf.current = requestAnimationFrame(f)
        return
      }
      raf.current = 0
      fired.current = true
      SFX.lock()
      Promise.resolve(onDone()).finally(() => {
        fired.current = false
        stop()
      })
    }
    raf.current = requestAnimationFrame(f)
  }
  const cancel = () => {
    stop()
    raf.current = 0
  }
  return (
    <>
    <Button
      className="hold px-8 py-3 whitespace-nowrap"
      aria-label="Hold to submit and lock"
      disabled={disabled}
      aria-describedby="hold-hint"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && cancel()}
      onBlur={cancel}
      onClick={(e) => {
        // Assistive tech activates with a synthetic click (detail 0) and no hold.
        if (e.detail === 0 && !disabled && !fired.current && !raf.current) {
          fired.current = true
          SFX.lock()
          Promise.resolve(onDone()).finally(() => {
            fired.current = false
          })
        }
      }}
    >
      <span ref={fill} className="fill" aria-hidden="true" />
      <span className="t">{pct !== null ? `Hold… ${pct}%` : 'Hold to submit & lock'}</span>
    </Button>
      <span id="hold-hint" className="sr-only">Hold for one second</span>
    </>
  )
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`flex items-start gap-2.5 ${ok ? 'text-success' : 'text-ink-soft'}`}>
      <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {ok ? <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /> : <circle cx="8" cy="8" r="5.5" />}
      </svg>
      <span>
        <span className="sr-only">{ok ? 'Done: ' : 'To do: '}</span>
        {text}
      </span>
    </li>
  )
}

function Locked({ run, session, sol, hot, onSwitch }: { run: Run; session: Session; sol: SolutionState; hot: boolean; onSwitch: (id: SideId) => void }) {
  const sub = sol.submission!
  const other = sidesOf(session).find((id) => id !== sub.sideId && session.sides[id].controller === 'human' && !run.solutions[id]?.submission)
  return (
    <section aria-labelledby="locked-title" role="status">
      <div className="flex flex-wrap items-center gap-3">
        <Tag tone="success">Submitted · locked</Tag>
        <span className="text-sm text-muted">
          {new Date(sub.submittedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}
        </span>
      </div>
      <h2 id="locked-title" className="mt-4 font-display text-4xl">
        {sub.unitName}&rsquo;s solution is saved
      </h2>
      <p className="mt-2 text-[15px] text-ink-soft">It can no longer be edited. Scoring and the leaderboard arrive in the next stage; no score has been given.</p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
        <blockquote className="border-l border-line-strong pl-6 text-[17px] leading-relaxed whitespace-pre-wrap">{sub.text}</blockquote>
        <div className="space-y-8">
          <div>
            <Label>Technologies</Label>
            <ul className="mt-3 space-y-2">
              {sub.selectedTechIds.map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[15px]">
                  <TechIcon name={getTech(t).icon} className="h-4 w-4 text-accent" />
                  {getTech(t).name}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Label>Characteristics</Label>
            <p className="mt-3 text-[15px]">{sub.characteristics.map((c) => CHARACTERISTICS.find((x) => x.id === c)!.label).join(' · ')}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-t border-line pt-5 text-sm">
            <dt className="text-muted">Submission</dt>
            <dd className="font-mono text-[13px]">{sub.submissionId}</dd>
            <dt className="text-muted">Session</dt>
            <dd className="font-mono text-[13px]">{sub.sessionId}</dd>
            <dt className="text-muted">Run</dt>
            <dd className="font-mono text-[13px]">
              {sub.runId} <span className="font-sans text-muted">· {sub.ranked ? 'ranked' : 'unranked'}</span>
            </dd>
            <dt className="text-muted">Game</dt>
            <dd className="font-mono text-[13px]">{sub.gameId}</dd>
            <dt className="text-muted">Words</dt>
            <dd className="tabular-nums">{sub.wordCount}</dd>
          </dl>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row">
        {hot && other && <Button onClick={() => onSwitch(other)}>Continue with {session.sides[other].name}</Button>}
        <Button variant={hot && other ? 'secondary' : 'primary'} onClick={() => navigate('results')}>
          View scoring status
        </Button>
      </div>
    </section>
  )
}
