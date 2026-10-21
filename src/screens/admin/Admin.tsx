import { useState, type ReactNode } from 'react'
import AdminShell, { Empty, SECTIONS, SectionTitle, type SectionId } from './AdminShell.tsx'
import { Runs, Submissions, ScoringQueue, LeaderboardAdmin, Integrity } from './AdminRecords.tsx'
import Button from '../../components/ui/Button.tsx'
import Judges from './Judges.tsx'
import ShowSection from './Show.tsx'
import ReasonAction from '../../components/ui/ReasonAction.tsx'
import { Tag } from '../../components/game/bits.tsx'
import { MAX_SIDES, MIN_SIDES, sidesOf } from '../../game/auction.ts'
import { activeMatch, dashboardTotals, floorMatches, isFresh, lobbyWaiting, rooms } from '../../game/event.ts'
import { roomNumber } from '../present/show.ts'
import { checkEvent } from '../../game/integrity.ts'
import { collectSubmissions, RUN_STATUS_LABEL, runStatus, runsOf } from '../../game/records.ts'
import { RULESETS } from '../../game/rules.ts'
import type { Participant, RulesetId } from '../../game/types.ts'
import { useGame } from '../../state/GameContext.tsx'
import { hrefFor, navigate } from '../../state/useRoute.ts'

export default function Admin({ param }: { param: string | null }) {
  const section = (SECTIONS.some((s) => s.id === param) ? param : 'overview') as SectionId
  const views: Record<SectionId, ReactNode> = {
    show: <ShowSection />,
    overview: <Overview />,
    registrations: <Registrations />,
    matchmaking: <Matchmaking />,
    runs: <Runs />,
    submissions: <Submissions />,
    scoring: <ScoringQueue />,
    leaderboard: <LeaderboardAdmin />,
    integrity: <Integrity />,
    settings: <Settings />,
    audit: <Audit />,
  }
  return <AdminShell section={section}>{views[section]}</AdminShell>
}

function Overview() {
  const { event, mode } = useGame()
  const remote = mode === 'remote'
  const t = dashboardTotals(event)
  const issues = checkEvent(event)
  const queue = collectSubmissions(event).filter((r) => r.submission && r.score?.status !== 'published').slice(0, 4)
  const errors = issues.filter((i) => i.severity === 'error').length
  const groups: { title: string; rows: [string, number, string?][] }[] = [
    { title: 'Registrations', rows: [['Registered Game Units', t.units, 'registrations'], ['Individual entries', t.individual], ['Team entries', t.team]] },
    { title: 'Play', rows: [['Active runs', t.activeRuns, 'runs'], ['Completed auctions', t.completedAuctions, 'runs'], remote ? ['Results held by the event server', t.completedAuctions, 'settings'] : ['Unsynchronized local results', t.unsynced, 'settings']] },
    {
      title: 'Scoring pipeline',
      rows: [['Submitted solutions', t.submitted, 'submissions'], ['Awaiting scoring', t.awaiting, 'scoring'], ['Scored, awaiting verification', t.scored, 'scoring'], ['Verified, awaiting publication', t.verified, 'scoring'], ['Published leaderboard entries', t.published, 'leaderboard']],
    },
  ]
  return (
    <>
      <SectionTitle title={event.settings.eventName}>
        Totals are calculated from the records {remote ? 'held by the event server' : 'saved on this device'}. Event <span className="font-mono text-[13px]">{event.eventId}</span> · Station{' '}
        <span className="font-mono text-[13px]">{event.stationId}</span>
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="pn pn-hot">
          <div className="lbl">Awaiting scoring</div>
          <div className="big mt-1.5 !text-danger">{t.awaiting}</div>
        </div>
        <div className="pn">
          <div className="lbl">Published</div>
          <div className="big mt-1.5">{t.published}</div>
        </div>
        <div className="pn">
          <div className="lbl">Submitted</div>
          <div className="big mt-1.5">{t.submitted}</div>
        </div>
      </div>
      {queue.length > 0 && (
        <section className="pn mt-6" aria-labelledby="q-prev">
          <h2 id="q-prev" className="lbl">Scoring queue</h2>
          <div className="mt-2">
            {queue.map((r, i) => (
              <div key={r.submission!.submissionId} className="q flex items-center justify-between gap-3 border-b border-line py-3" style={{ '--i': i } as React.CSSProperties}>
                <span>{r.submission!.unitName}</span>
                <a className="text-sm text-accent hover:underline" href={hrefFor('admin', 'scoring')}>Scoring queue</a>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="mt-10 grid gap-10 xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="lbl">
              {g.title}
            </h2>
            <dl className="mt-3 divide-y divide-line border-y border-line">
              {g.rows.map(([label, n, link]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-[15px]">{link ? <a className="hover:underline" href={hrefFor('admin', link)}>{label}</a> : label}</dt>
                  <dd className="font-display text-3xl tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="mt-10 grid gap-6 border-t border-line pt-6 text-sm md:grid-cols-2">
        <p className="text-ink-soft">
          {remote ? (
            <>
              <strong className="font-semibold text-ink">Result status: recorded by the event server.</strong> Every station reads and writes through it; it
              validates bids, wallets, ownership and scores. Its data file is the only copy, so download backups regularly.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink">Result status: local only.</strong> No event server is connected, so every result above exists only in
              this browser and is reported as unsynchronized.
            </>
          )}
        </p>
        <p className={errors ? 'text-danger' : 'text-success'}>
          {errors ? `${errors} integrity error${errors === 1 ? '' : 's'} found. ` : 'All integrity checks pass. '}
          <a className="underline underline-offset-4" href={hrefFor('admin', 'integrity')}>
            Open integrity checks
          </a>
        </p>
      </div>
    </>
  )
}

function Matchmaking() {
  const { event, mode, pairMatch, setShow, cancelRun, clearLobby } = useGame()
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [hold, setHold] = useState(true)
  if (mode !== 'remote') {
    return (
      <>
        <SectionTitle title="Matchmaking" />
        <Empty>Matchmaking needs the event server.</Empty>
      </>
    )
  }
  const waiting = lobbyWaiting(event)
  const busy = activeMatch(event)
  const chosen = picked.filter((g) => waiting.some((p) => p.gameId === g))
  const floor = floorMatches(event)
  const all = rooms(event)
  const nameOf = (r: (typeof all)[number]) => `Room ${roomNumber(all, r.room)} (${sidesOf(r.session).map((id) => r.session.sides[id].name).join(', ')})`
  const who = (p: Participant) => p.player.team?.name ?? p.player.name
  const toggle = (gameId: string) => setPicked((cur) => (cur.includes(gameId) ? cur.filter((g) => g !== gameId) : cur.length < MAX_SIDES ? [...cur, gameId] : cur))
  const start = async (gameIds: string[]) => {
    const r = await pairMatch(gameIds, hold)
    setNote(r.message)
    if (r.ok) setPicked([])
  }
  return (
    <>
      <SectionTitle title="Matchmaking">
        Pair waiting registrations into matches: pick 2 to 12 players. One match runs at a time: the next can be started once the current auction has finished. With the hold on (the default), the match waits in Show control until you start its auction. Each lot shows its intro for 10 s, then bidding runs by itself; Show control can skip the intro, pause, or go to the next technology.
      </SectionTitle>
      <section className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-muted">{event.show.lobbySince ? `Lobby last cleared ${new Date(event.show.lobbySince).toLocaleString()}.` : 'Lobby not cleared yet.'}</p>
        <ReasonAction
          label="Clear lobby"
          confirmLabel="Clear lobby"
          danger
          consequence="Hides everyone currently waiting and every finished room from the lobby and projector. Records, scores and the leaderboard are kept."
          onConfirm={(reason) => clearLobby(reason)}
        />
      </section>
      <section aria-labelledby="waiting-title">
        <h2 id="waiting-title" className="lbl">
          Waiting ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <div className="mt-4">
            <Empty>No one is waiting. Registered players appear here until they are paired.</Empty>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {waiting.map((p) => {
              const on = chosen.includes(p.gameId)
              return (
                <li key={p.gameId}>
                  <label className="flex cursor-pointer items-start gap-4 py-4">
                    <input
                      type="checkbox"
                      className="mt-1.5 h-4 w-4 accent-accent"
                      checked={on}
                      disabled={!on && chosen.length >= MAX_SIDES}
                      onChange={() => toggle(p.gameId)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{who(p)}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        <span className="font-mono text-[13px] text-ink">{p.gameId}</span> · {p.player.mode === 'team' ? `Team of ${p.player.team!.members.length}` : 'Individual'} · registered{' '}
                        {new Date(p.player.registeredAt).toLocaleString()}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <label className="mt-5 flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} className="accent-accent" />
          Hold until I start it from Show control
        </label>
        {busy && (
          <p className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-[15px] text-danger" role="status">
            {nameOf(busy)} {busy.session.status === 'ready' ? 'is waiting to start' : 'is auctioning'}. Start the next one after its auction finishes, or end it here.
            <ReasonAction
              label="End this match"
              confirmLabel="End match"
              variant="ghost"
              danger
              consequence={`The match in ${nameOf(busy)} is cancelled and archived with its auction log. Its players return to the waiting list.`}
              onConfirm={(reason) => cancelRun(busy.gameId, reason)}
            />
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={!!busy || chosen.length < MIN_SIDES || chosen.length > MAX_SIDES} onClick={() => start(chosen)}>
            Start match ({chosen.length})
          </Button>
          <p className="text-sm text-muted" role="status">
            {chosen.length} of {MAX_SIDES} selected{chosen.length > 0 && chosen.length < MIN_SIDES ? ` · pick at least ${MIN_SIDES}` : ''}
          </p>
        </div>
        {note && (
          <p className="mt-3 text-sm text-ink-soft" role="status">
            {note}
          </p>
        )}
      </section>
      <section aria-labelledby="live-title" className="mt-14">
        <h2 id="live-title" className="lbl">
          Matches on the floor ({floor.length})
        </h2>
        {floor.length === 0 ? (
          <div className="mt-4">
            <Empty>No matches waiting or live.</Empty>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {floor.map((r) => {
              const s = r.session
              return (
                <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <p className="min-w-0">
                    <span className="font-semibold">Room {roomNumber(all, r.room)} · {sidesOf(s).map((id) => s.sides[id].name).join(', ')}</span>
                    <span className="ml-2 text-sm text-muted">
                      · {sidesOf(s).length} sides · {s.status === 'ready' ? 'held, waiting to start' : 'live'}
                    </span>
                  </p>
                  <Button variant="secondary" disabled={event.show.focus === s.sessionId} onClick={() => setShow({ focus: s.sessionId })}>
                    {event.show.focus === s.sessionId ? 'Showing on projector' : 'Show on projector'}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

function Registrations() {
  const { event, switchParticipant, cancelRun, mode, issueResumeCode, returnToLobby } = useGame()
  const [q, setQ] = useState('')
  const [codeNote, setCodeNote] = useState<{ gameId: string; message: string } | null>(null)
  const needle = q.trim().toLowerCase()
  const list = event.participants.filter(
    (p) => !needle || p.gameId.toLowerCase().includes(needle) || p.player.name.toLowerCase().includes(needle) || (p.player.team?.name ?? '').toLowerCase().includes(needle),
  )
  return (
    <>
      <SectionTitle title="Registrations">Look up a Game Unit by Game ID or name, open it on this device, or cancel an unfinished run.</SectionTitle>
      <label className="block max-w-md">
        <span className="text-sm font-medium">Game ID or name</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="GAME-… or a name"
          className="mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
      </label>
      <p className="mt-2 text-sm text-muted" role="status">
        {list.length} of {event.participants.length} registration{event.participants.length === 1 ? '' : 's'}
      </p>
      {event.participants.length === 0 ? (
        <div className="mt-6">
          <Empty>No Game Units registered yet. Participants register from the landing page.</Empty>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {list.map((p) => {
            const active = p.run && !Object.values(p.run.solutions).some((s) => s?.submission)
            return (
              <li key={p.gameId} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">
                      {p.player.team?.name ?? p.player.name}
                      {event.activeGameId === p.gameId && <span className="ml-2 align-middle"><Tag tone="accent">On this device now</Tag></span>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      <span className="font-mono text-[13px] text-ink">{p.gameId}</span> · {p.player.mode === 'team' ? `Team: ${p.player.team!.members.join(', ')}` : 'Individual'} · registered{' '}
                      {new Date(p.player.registeredAt).toLocaleString()}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                      {runsOf(p).map((r) => (
                        <li key={r.runId}>
                          <Tag>
                            {r.runId} · {RUN_STATUS_LABEL[runStatus(r)]}
                            {r.ranked ? '' : ' · unranked'}
                          </Tag>
                        </li>
                      ))}
                      {runsOf(p).length === 0 && <li className="text-muted">No runs yet</li>}
                    </ul>
                  </div>
                  {mode === 'remote' && !isFresh(p, event) && (
                    <Button variant="secondary" onClick={() => void returnToLobby(p.gameId)}>
                      Return to lobby
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      switchParticipant(p.gameId)
                      navigate('lobby')
                    }}
                  >
                    Resume as this participant
                  </Button>
                  {mode === 'remote' && (
                    <Button variant="secondary" onClick={() => void issueResumeCode(p.gameId).then((r) => setCodeNote({ gameId: p.gameId, message: r.message }))}>
                      Issue resume code
                    </Button>
                  )}
                </div>
                {codeNote?.gameId === p.gameId && (
                  <p role="status" className="mt-3 text-sm font-medium">
                    {codeNote.message}
                  </p>
                )}
                {active && (
                  <div className="mt-4">
                    <ReasonAction
                      label="Cancel active run"
                      confirmLabel="Cancel run"
                      variant="ghost"
                      danger
                      consequence={`Run ${p.run!.runId} will be archived as cancelled, with its auction log intact. The participant can then start a new run.`}
                      onConfirm={(reason) => cancelRun(p.gameId, reason)}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function Settings() {
  const { event, mode, updateSettings, superadmin } = useGame()
  const readOnly = mode === 'remote' && !superadmin
  const [name, setName] = useState(event.settings.eventName)
  const [ruleset, setRuleset] = useState<RulesetId>(event.settings.defaultRuleset)
  const [timed, setTimed] = useState(event.settings.defaultTimed)
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null)
  const locked = event.participants.filter((p) => p.run?.session && p.run.session.status !== 'complete' && !p.run.cancelled)

  return (
    <>
      <SectionTitle title="Event settings">
        Defaults apply to matches created from now on. A session copies its rules when it is created, so changes here never alter a session already in
        progress.
      </SectionTitle>
      {readOnly && <p className="mb-6 text-sm text-muted">Only the event lead (admin) can change event settings.</p>}
      <form
        inert={readOnly}
        className={`max-w-xl space-y-6 ${readOnly ? 'opacity-60' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          updateSettings({ eventName: name, defaultRuleset: ruleset, defaultTimed: timed }).then(setMsg)
        }}
      >
        <label className="block">
          <span className="text-sm font-medium">Event name</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none" />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Default ruleset for new matches</legend>
          <div className="mt-2 flex gap-6">
            {(Object.keys(RULESETS) as RulesetId[]).map((id) => (
              <label key={id} className="flex items-center gap-2 text-[15px]">
                <input type="radio" name="rs" checked={ruleset === id} onChange={() => setRuleset(id)} className="accent-accent" />
                {RULESETS[id].label} ({RULESETS[id].bidSeconds} s, technologies drawn per run)
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="accent-accent" />
          Timed solution stage by default
        </label>
        <div className="flex items-center gap-4">
          <Button type="submit">Save settings</Button>
          {msg && <p className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`} role="status">{msg.message}</p>}
        </div>
      </form>

      <Judges />

      <section className="mt-12 border-t border-line pt-8" aria-labelledby="locked">
        <h2 id="locked" className="lbl">Sessions with locked rules</h2>
        {locked.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No sessions are in progress.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
            {locked.map((p) => (
              <li key={p.gameId} className="flex flex-wrap justify-between gap-3 py-2.5">
                <span>
                  {p.player.team?.name ?? p.player.name} · <span className="font-mono text-[13px]">{p.run!.session!.sessionId}</span>
                </span>
                <span className="text-muted">
                  {p.run!.session!.rules.label} rules · {p.run!.session!.rules.bidSeconds} s · +{p.run!.session!.rules.bidIncrement} CC · locked until completed or cancelled
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12 border-t border-line pt-8 text-sm text-ink-soft" aria-labelledby="sync">
        <h2 id="sync" className="lbl">Station and synchronization</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
          <dt className="text-muted">Station ID</dt>
          <dd className="font-mono text-[13px]">{event.stationId}</dd>
          <dt className="text-muted">Event ID</dt>
          <dd className="font-mono text-[13px]">{event.eventId}</dd>
          <dt className="text-muted">Network</dt>
          <dd>
            {mode === 'remote'
              ? 'Connected to the event server. Every station on the local network shares its auctions, scoring and leaderboard.'
              : 'None required. Auctions, scoring and the leaderboard run entirely in this browser.'}
          </dd>
          <dt className="text-muted">Sync status</dt>
          <dd>
            {mode === 'remote'
              ? 'Live. Changes are pushed to every connected station as soon as the server accepts them.'
              : 'Not synchronized. Start the event server (npm run event) to share results between devices.'}
          </dd>
        </dl>
        <a href="#/rules" className="mt-4 inline-block underline underline-offset-4 hover:text-ink">
          View full rules
        </a>
      </section>
    </>
  )
}

function Audit() {
  const { event } = useGame()
  const rows = [...event.audit].reverse()
  return (
    <>
      <SectionTitle title="Audit log">Administrative and scoring actions in order, with the operator label and any reason given. Entries are appended, never edited.</SectionTitle>
      {rows.length === 0 ? (
        <Empty>No administrative actions recorded yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-y border-line text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                {['#', 'Time', 'Operator', 'Action', 'Target', 'Reason'].map((h) => (
                  <th key={h} className="py-2.5 pr-4 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={a.seq}>
                  <td className="py-2.5 pr-4 text-muted tabular-nums">{a.seq}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted">{new Date(a.at).toLocaleString()}</td>
                  <td className="py-2.5 pr-4">{a.actor}</td>
                  <td className="py-2.5 pr-4">{a.action}</td>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">{a.target}</td>
                  <td className="py-2.5 text-ink-soft">{a.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
