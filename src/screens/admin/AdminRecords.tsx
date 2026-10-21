import { useState, type ReactNode } from 'react'
import { Empty, SectionTitle } from './AdminShell.tsx'
import Button from '../../components/ui/Button.tsx'
import ReasonAction from '../../components/ui/ReasonAction.tsx'
import { downloadText } from '../../components/ui/download.ts'
import EventTable from '../../components/game/EventTable.tsx'
import LeaderboardTable from '../../components/game/LeaderboardTable.tsx'
import { StatusTag } from '../../components/game/StatusTracker.tsx'
import { cc, matchLabel, SideBadge, Tag } from '../../components/game/bits.tsx'
import { sidesOf } from '../../game/auction.ts'
import { checkEvent, checkRun } from '../../game/integrity.ts'
import { collectSubmissions, RUN_STATUS_LABEL, runStatus, runsOf } from '../../game/records.ts'
import { finalScore, scoreTotal, submissionStatus } from '../../game/scoring.ts'
import { summarise } from '../../game/summary.ts'
import { CHARACTERISTICS, MISSIONS, TWISTS } from '../../data/scenario.ts'
import { getTech } from '../../data/technologies.ts'
import type { ActionResult } from '../../state/GameContext.tsx'
import { useGame } from '../../state/GameContext.tsx'
import { navigate } from '../../state/useRoute.ts'

const techNames = (ids: string[]) => (ids.length ? ids.map((t) => getTech(t).name).join(', ') : '—')

export function Runs() {
  const { event } = useGame()
  const runs = event.participants.flatMap((p) => runsOf(p).map((run) => ({ p, run })))
  const [selected, setSelected] = useState<string | null>(null)
  const sel = runs.find((r) => r.run.runId === selected)

  return (
    <>
      <SectionTitle title="Runs & auctions">Every saved run, including archived replays and cancelled runs. Inspect one to audit its auction.</SectionTitle>
      {runs.length === 0 ? (
        <Empty>No runs yet. A run is created when a participant sets up a match.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-y border-line text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                {['Run ID', 'Game Unit', 'Match', 'Rules', 'Ranking', 'Status', ''].map((h) => (
                  <th key={h} className="py-2.5 pr-4 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map(({ p, run }) => (
                <tr key={run.runId} className={selected === run.runId ? 'bg-accent-soft/60' : undefined}>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">{run.runId}</td>
                  <td className="py-2.5 pr-4">{p.player.team?.name ?? p.player.name}</td>
                  <td className="py-2.5 pr-4 text-ink-soft">{run.session ? matchLabel(run.session) : '—'}</td>
                  <td className="py-2.5 pr-4 text-ink-soft">{run.session?.rules.label ?? '—'}</td>
                  <td className="py-2.5 pr-4">{run.ranked ? 'Ranked' : 'Unranked'}</td>
                  <td className="py-2.5 pr-4">{RUN_STATUS_LABEL[runStatus(run)]}</td>
                  <td className="py-2.5 text-right">
                    {run.session && run.session.status !== 'ready' && (
                      <Button variant="ghost" className="px-3 py-1.5" onClick={() => setSelected(selected === run.runId ? null : run.runId)} aria-expanded={selected === run.runId}>
                        {selected === run.runId ? 'Close' : 'Inspect'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel?.run.session && (() => {
        const s = sel.run.session
        const sum = summarise(s)
        const issues = checkRun(sel.p, sel.run)
        return (
          <section className="mt-12 border-t border-line pt-8" aria-labelledby="inspect">
            <h2 id="inspect" className="font-display text-3xl">
              Run {sel.run.runId}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Session <span className="font-mono text-[13px] text-ink">{s.sessionId}</span> · Game <span className="font-mono text-[13px] text-ink">{s.gameId}</span>
              {s.stationId && <> · Station <span className="font-mono text-[13px] text-ink">{s.stationId}</span></>}
              {sel.run.cancelled && <> · cancelled by {sel.run.cancelled.by}: {sel.run.cancelled.reason}</>}
            </p>
            <ul className="mt-4 space-y-1 text-sm">
              {issues.length === 0 && <li className="text-success">Integrity checks pass: event order, checksum chain, purchases and wallets reconcile.</li>}
              {issues.map((i, k) => (
                <li key={k} className={i.severity === 'error' ? 'text-danger' : 'text-muted'}>
                  {i.severity === 'error' ? 'Error' : 'Note'}: {i.message}
                </li>
              ))}
            </ul>
            <div className="mt-8 grid gap-10 lg:grid-cols-2">
              <table className="w-full border-y border-line text-left text-sm">
                <caption className="pb-2 text-left text-[13px] font-semibold tracking-wide text-muted uppercase">Outcomes</caption>
                <tbody className="divide-y divide-line">
                  {s.lots.map((l) => (
                    <tr key={l.techId}>
                      <td className="py-2 pr-3">{getTech(l.techId).name}</td>
                      <td className="py-2 pr-3">{l.status === 'sold' ? 'SOLD' : l.status === 'unsold' ? 'UNSOLD' : l.status}</td>
                      <td className="py-2 pr-3">{l.status === 'sold' ? s.sides[l.leader!].name : '—'}</td>
                      <td className="py-2 text-right tabular-nums">{l.status === 'sold' ? cc(l.bid!) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full border-y border-line text-left text-sm">
                <caption className="pb-2 text-left text-[13px] font-semibold tracking-wide text-muted uppercase">Wallet reconciliation</caption>
                <tbody className="divide-y divide-line">
                  {sidesOf(s).map((id) => (
                    <tr key={id}>
                      <td className="py-2 pr-3"><span className="inline-flex items-center gap-2"><SideBadge side={id} />{sum[id].name}</span></td>
                      <td className="py-2 pr-3 tabular-nums">{cc(sum[id].initial)} − {cc(sum[id].spent)} = {cc(sum[id].final)}</td>
                      <td className={`py-2 text-right ${sum[id].reconciled ? 'text-success' : 'text-danger'}`}>{sum[id].reconciled ? 'Reconciled' : 'Mismatch'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-10 text-[13px] font-semibold tracking-wide text-muted uppercase">Event log · {s.events.length} events</h3>
            <EventTable session={s} className="mt-3" />
          </section>
        )
      })()}
    </>
  )
}

export function Submissions() {
  const { event, queueSubmission, reopenSubmission } = useGame()
  const records = collectSubmissions(event).reverse()
  const [results, setResults] = useState<Record<string, ActionResult>>({})

  return (
    <>
      <SectionTitle title="Solution submissions">
        Every solution created in a run. Only locked submissions can enter scoring; participants cannot edit them. Reopening requires a reason and voids any
        score in progress.
      </SectionTitle>
      {records.length === 0 ? (
        <Empty>No solutions yet. They appear here once a participant starts the solution stage.</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {records.map((r) => {
            const unit = r.session.sides[r.sideId]
            const sub = r.submission
            const status = submissionStatus(r.solution, r.score)
            const key = sub?.submissionId ?? `${r.run.runId}-${r.sideId}`
            const fields: [string, ReactNode][] = [
              ['Game ID', <span key="g" className="font-mono text-[13px]">{r.participant.gameId}</span>],
              ['Run ID', <span key="r" className="font-mono text-[13px]">{r.run.runId} · {r.run.ranked ? 'ranked' : 'unranked'}</span>],
              ['Match type', matchLabel(r.session)],
              ['Acquired portfolio', techNames(unit.portfolio)],
              ['Selected technologies', techNames(sub?.selectedTechIds ?? r.solution.draft.techIds)],
              ['Characteristics', (sub?.characteristics ?? r.solution.draft.characteristics).map((c) => CHARACTERISTICS.find((x) => x.id === c)!.label).join(', ') || '—'],
              ['Timeline Twist', TWISTS[r.run.twistId].title],
              ['Future Mission', MISSIONS[r.run.missionId].title],
              ['Word count', sub ? String(sub.wordCount) : '—'],
              ['Submitted', sub ? new Date(sub.submittedAt).toLocaleString() : 'Not submitted'],
            ]
            return (
              <li key={key} className="py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2.5 text-lg font-semibold">
                    <SideBadge side={r.sideId} />
                    {unit.name}
                    {sub && <span className="font-mono text-[13px] font-normal text-muted">{sub.submissionId}</span>}
                  </p>
                  <StatusTag status={status} />
                </div>
                <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  {fields.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[10rem_1fr] gap-3">
                      <dt className="text-muted">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-ink-soft hover:text-ink">{sub ? 'Submitted solution' : 'Current draft'}</summary>
                  <p className="mt-2 max-w-3xl border-l border-line-strong pl-4 leading-relaxed whitespace-pre-wrap">{(sub?.text ?? r.solution.draft.text) || '—'}</p>
                </details>
                {r.solution.reopened?.map((x, i) => (
                  <p key={i} className="mt-2 text-xs text-muted">
                    Reopened {new Date(x.at).toLocaleString()} by {x.by}: {x.reason}
                  </p>
                ))}
                {sub && (
                  <div className="mt-5 flex flex-wrap items-start gap-3">
                    {status === 'submitted' && (
                      <Button onClick={() => queueSubmission(sub.submissionId).then((r) => setResults((all) => ({ ...all, [key]: r })))}>Accept into scoring queue</Button>
                    )}
                    {r.score && (
                      <Button variant={status === 'published' ? 'secondary' : 'primary'} onClick={() => navigate('score', sub.submissionId)}>
                        Open scoring panel
                      </Button>
                    )}
                    {r.active ? (
                      <ReasonAction
                        label="Reopen submission"
                        confirmLabel="Reopen"
                        variant="ghost"
                        consequence="The participant will be able to edit and resubmit. Any score in progress for this submission is voided and recorded in the audit log."
                        onConfirm={(reason) => reopenSubmission(sub.submissionId, reason)}
                      />
                    ) : (
                      <p className="self-center text-xs text-muted">Archived run: cannot be reopened.</p>
                    )}
                  </div>
                )}
                {results[key] && <p className={`mt-2 text-sm ${results[key].ok ? 'text-success' : 'text-danger'}`} role="status">{results[key].message}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export function ScoringQueue() {
  const { event, queueSubmission } = useGame()
  const records = collectSubmissions(event).filter((r) => r.submission && r.score?.status !== 'published')
  const [msg, setMsg] = useState<ActionResult | null>(null)
  const next: Record<string, string> = { submitted: 'Accept', awaiting: 'Start scoring', in_scoring: 'Continue scoring', scored: 'Verify', verified: 'Publish' }

  return (
    <>
      <SectionTitle title="Scoring queue">Locked submissions that are not yet published, in submission order. Each step is a deliberate action in the scoring panel.</SectionTitle>
      {msg && <p className={`mb-4 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`} role="status">{msg.message}</p>}
      {records.length === 0 ? (
        <Empty>Nothing waiting. Locked submissions appear here; published ones move to the leaderboard.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-y border-line text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                {['Submission', 'Game Unit', 'Run', 'Submitted', 'Status', 'Entered', ''].map((h) => (
                  <th key={h} className="py-2.5 pr-4 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {records.map((r) => {
                const sub = r.submission!
                const status = submissionStatus(r.solution, r.score)
                return (
                  <tr key={sub.submissionId}>
                    <td className="py-3 pr-4 font-mono text-[13px]">{sub.submissionId}</td>
                    <td className="py-3 pr-4">{sub.unitName}</td>
                    <td className="py-3 pr-4">
                      <span className="font-mono text-[13px]">{sub.runId}</span> {sub.ranked ? '' : <span className="text-muted">· unranked</span>}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted">{new Date(sub.submittedAt).toLocaleString()}</td>
                    <td className="py-3 pr-4"><StatusTag status={status} /></td>
                    <td className="py-3 pr-4 tabular-nums">{r.score ? `${finalScore(r.score.entries, sub)} (rubric ${scoreTotal(r.score.entries)} / 100)` : '—'}</td>
                    <td className="py-3 text-right">
                      <Button
                        className="px-3.5 py-1.5"
                        onClick={() => (status === 'submitted' ? queueSubmission(sub.submissionId).then(setMsg) : navigate('score', sub.submissionId))}
                      >
                        {next[status]}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function LeaderboardAdmin() {
  const { event, leaderboard, setLeaderboardLock } = useGame()
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg] = useState<ActionResult | null>(null)
  const locked = event.settings.leaderboardLocked
  return (
    <>
      <SectionTitle title="Leaderboard">
        Built from published score records only. While unlocked, results are PROVISIONAL; locking makes them FINAL and blocks publishing and corrections
        until unlocked with a reason.
      </SectionTitle>
      <div className="mb-10 border-y border-line py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[15px]">
            {locked ? <Tag tone="success">Locked · FINAL</Tag> : <Tag>Unlocked · PROVISIONAL</Tag>}
            {locked && event.settings.leaderboardLockedAt && <span className="ml-3 text-sm text-muted">since {new Date(event.settings.leaderboardLockedAt).toLocaleString()}</span>}
          </p>
          {!locked && !confirming && <Button onClick={() => setConfirming(true)}>Lock leaderboard</Button>}
        </div>
        {!locked && confirming && (
          <div className="mt-4 rounded-md border border-line-strong bg-surface p-4">
            <p className="text-sm text-ink-soft">Lock the leaderboard? Every published result becomes FINAL. No score can be published or corrected until it is unlocked.</p>
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() =>
                  setLeaderboardLock(true, '').then((r) => {
                    setMsg(r)
                    setConfirming(false)
                  })
                }
              >
                Confirm lock
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {locked && (
          <div className="mt-4">
            <ReasonAction label="Unlock leaderboard" confirmLabel="Unlock" consequence="Results return to PROVISIONAL and can be published or corrected again." onConfirm={(r) => setLeaderboardLock(false, r)} />
          </div>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`} role="status">{msg.message}</p>}
      </div>
      <LeaderboardTable rows={leaderboard} currentGameId={null} />
    </>
  )
}

export function Integrity() {
  const { mode, event, resetEvent, superadmin } = useGame()
  const issues = checkEvent(event)
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return (
    <>
      <SectionTitle title="Integrity & recovery">
        Prototype-level checks: event order, a chained FNV-1a checksum over each auction log, wallet and purchase reconciliation, duplicate IDs and
        references between runs, sessions, submissions and scores. They catch accidental corruption; they are not tamper-proof security, and nothing is
        cryptographically signed.
      </SectionTitle>
      <p className={`text-[15px] ${errors.length ? 'text-danger' : 'text-success'}`} role="status">
        {errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'} found.` : 'No errors found.'} {warnings.length > 0 && <span className="text-muted">{warnings.length} note{warnings.length === 1 ? '' : 's'}.</span>}
      </p>
      {issues.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
          {issues.map((i, k) => (
            <li key={k} className="grid gap-1 py-2.5 sm:grid-cols-[6rem_12rem_1fr] sm:gap-4">
              <span className={i.severity === 'error' ? 'font-semibold text-danger' : 'text-muted'}>{i.severity === 'error' ? 'Error' : 'Note'}</span>
              <span className="font-mono text-[13px]">{i.ref}</span>
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-muted">Runs with errors cannot enter the scoring queue. Cancel an affected unfinished run from Registrations, or download a backup and reset.</p>

      <section className="mt-12 border-t border-line pt-8" aria-labelledby="backup">
        <h2 id="backup" className="text-[13px] font-semibold tracking-wide text-muted uppercase">Backup</h2>
        <p className="mt-2 text-sm text-ink-soft">Download every record {mode === 'remote' ? 'held by the event server' : 'on this device'} as JSON. The file is generated in this browser.</p>
        <Button variant="secondary" className="mt-4" onClick={() => downloadText(`timeauction-${event.eventId}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(event, null, 2))}>
          Download backup
        </Button>
      </section>

      {(mode !== 'remote' || superadmin) && (
      <section className="mt-12 border-t border-line pt-8" aria-labelledby="reset">
        <h2 id="reset" className="text-[13px] font-semibold tracking-wide text-danger uppercase">Reset event</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Permanently erases all {event.participants.length} registrations, every run, score, feedback entry and the audit log {mode === 'remote' ? 'for every station at this event' : 'on this device'}. Download a
          backup first. Type <strong className="font-mono">RESET</strong> to confirm.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type RESET to confirm" className="w-40 rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm focus:border-danger focus:outline-none" />
          <Button
            variant="danger-solid"
            disabled={typed !== 'RESET'}
            onClick={() =>
              resetEvent().then((r) => {
                setTyped('')
                setDone(r.ok)
              })
            }
          >
            Erase all event data
          </Button>
        </div>
        {done && <p className="mt-3 text-sm text-success" role="status">Event data erased. A new empty event has been created.</p>}
      </section>
      )}
    </>
  )
}

