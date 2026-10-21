import { useEffect, useMemo, useState, type ReactNode } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import TechIcon from '../components/game/TechIcon.tsx'
import { cc, isHotSeat, Label, matchLabel, SideBadge, speakingSide, Tag, UnitName } from '../components/game/bits.tsx'
import { clock } from '../components/game/events.ts'
import { sidesOf } from '../game/auction.ts'
import { verifyChain } from '../game/integrity.ts'
import { calm } from '../components/ui/motion.ts'
import { SFX } from '../components/ui/sfx.ts'
import type { Session } from '../game/types.ts'
import { summarise } from '../game/summary.ts'
import { getTech } from '../data/technologies.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'

export default function Summary() {
  const { state, continueToMission, mySide } = useGame()
  const run = state.run
  const s = run?.session

  // A held twist waits for the host; when the reveal moves the run on, this screen follows it.
  const held = !!run?.twistHeld && !run.twistRevealedAt

  useEffect(() => {
    if (!s || s.status !== 'complete') navigate(state.player ? routeForRun(run) : 'register')
    else if (run && run.phase !== 'summary') navigate(routeForRun(run))
  }, [s, run, state.player])

  if (!run || !s || s.status !== 'complete') return null

  const sum = summarise(s)
  const hot = isHotSeat(s, mySide)
  const seats = sidesOf(s)
  // Three or more sides: a card grid, richest wallet first. Two sides keep the seat order and the two-column layout.
  const many = seats.length > 2
  const ordered = many ? [...seats].sort((a, b) => sum[b].final - sum[a].final || sum[a].name.localeCompare(sum[b].name)) : seats
  const you = hot ? null : speakingSide(s, mySide)
  const completedAt = s.events.findLast((e) => e.type === 'auction_complete')?.at
  const price = (techId: string) => s.events.find((e) => e.type === 'sold' && e.techId === techId)?.amount

  return (
    <GameShell wide={many} fit>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl leading-[1.02]">Auction summary</h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            {matchLabel(s)} · {s.rules.label} rules · Session <span className="font-mono text-[13px]">{s.sessionId}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tag tone="success">Session complete</Tag>
          {completedAt && <span className="text-sm text-muted">{clock(completedAt)}</span>}
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="outcomes" className="min-w-0">
          <Label>
            <span id="outcomes">Outcomes</span>
          </Label>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-y border-line text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-normal">#</th>
                  <th className="py-2 pr-3 font-normal">Technology</th>
                  <th className="py-2 pr-3 font-normal">Status</th>
                  <th className="py-2 pr-3 font-normal">Winner</th>
                  <th className="py-2 text-right font-normal">Final price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {s.lots.map((l, i) => {
                  const t = getTech(l.techId)
                  return (
                    <tr key={l.techId}>
                      <td className="py-1.5 pr-3 text-muted tabular-nums">{i + 1}</td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-2">
                          <TechIcon name={t.icon} className="h-4 w-4 text-ink-soft" />
                          {t.name}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">{l.status === 'sold' ? <Tag tone="success">SOLD</Tag> : <Tag>UNSOLD</Tag>}</td>
                      <td className="py-1.5 pr-3">{l.leader && l.status === 'sold' ? <UnitName unit={s.sides[l.leader]} /> : <span className="text-muted">—</span>}</td>
                      <td className="py-1.5 text-right tabular-nums">{l.status === 'sold' ? cc(price(l.techId) ?? 0) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className={many ? 'grid min-w-0 content-start gap-3 sm:grid-cols-2' : 'grid min-w-0 content-start gap-4'}>
          {ordered.map((id) => {
            const u = sum[id]
            const unit = s.sides[id]
            return (
              <section key={id} aria-labelledby={`unit-${id}`} className={`pn min-w-0 p-4 ${you === id ? 'ring-2 ring-accent' : ''}`}>
                <h2 id={`unit-${id}`} className="flex min-w-0 items-center gap-2.5 text-base font-semibold">
                  <SideBadge side={id} />
                  <span className="truncate">{hot || you !== id ? u.name : `${u.name} (you)`}</span>
                  {unit.kind === 'bot' && <Tag>Unranked</Tag>}
                </h2>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <span className="lbl">Wallet remaining</span>
                  <span className="font-display text-3xl tabular-nums">{cc(u.final)}</span>
                </div>
                {many ? (
                  <p className="mt-1 text-[13px] text-muted">
                    {u.acquired.length} of {s.lots.length} acquired · spent {cc(u.spent)}
                  </p>
                ) : (
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <Stat k="Initial" v={cc(u.initial)} />
                    <Stat k="Spent" v={u.spent ? `− ${cc(u.spent)}` : cc(0)} />
                    <Stat k="Acquired" v={`${u.acquired.length} of ${s.lots.length}`} />
                  </dl>
                )}
                <p className={`mt-2 text-[13px] ${u.reconciled ? 'text-success' : 'text-danger'}`}>
                  {u.reconciled
                    ? many
                      ? 'Reconciled with purchase events.'
                      : `Reconciled: ${cc(u.initial)} − ${cc(u.spent)} = ${cc(u.final)}, matching ${u.acquired.length} purchase event${u.acquired.length === 1 ? '' : 's'}.`
                    : 'Balance does not reconcile with the purchase events. Check the auction log.'}
                </p>
                {!many && (
                  <ul className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2" aria-label="Acquired technologies">
                    {u.acquired.length === 0 && <li className="text-muted">No technologies acquired.</li>}
                    {u.acquired.map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <TechIcon name={getTech(t).icon} className="h-4 w-4 shrink-0 text-ink-soft" />
                        <span className="min-w-0 flex-1 truncate">{getTech(t).name}</span>
                        <span className="font-mono text-accent">{cc(price(t) ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </div>

      <Integrity s={s} />

      {held && (
        <section aria-labelledby="held-twist" role="status" className="pn mt-6 max-w-2xl">
          <h2 id="held-twist" className="text-lg font-semibold text-accent">
            Watch the main screen
          </h2>
          <p className="mt-2 text-[15px] text-ink-soft">The host reveals the Timeline Twist for everyone. This screen moves on by itself.</p>
        </section>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="secondary" onClick={() => navigate('log')}>
          View auction log ({s.events.length} events)
        </Button>
        {!held && (
          <Button
            className="px-8 py-3"
            onClick={() => {
              const target = run.phase === 'summary' ? 'twist' : routeForRun(run)
              return continueToMission().then(() => navigate(target))
            }}
          >
            Continue to mission
          </Button>
        )}
      </div>
    </GameShell>
  )
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  )
}

/** Fills one cell per 130 ms (up to 14), then shows the real chain check. Calm: final state at once. */
function Integrity({ s }: { s: Session }) {
  const n = Math.min(s.events.length, 14)
  const [k, setK] = useState(() => (calm() ? n : 0))
  const v = useMemo(() => verifyChain(s), [s])
  const ok = v.ok
  useEffect(() => {
    if (k >= n) {
      if (n > 0) (ok ? SFX.ok : SFX.err)()
      return
    }
    const t = setTimeout(() => {
      SFX.sec()
      setK(k + 1)
    }, 130)
    return () => clearTimeout(t)
  }, [k, n, ok])
  const done = k >= n
  const head = s.events.at(-1)?.hash
  return (
    <section className="pn mt-6 !py-4" aria-labelledby="integrity">
      <h2 id="integrity" className="lbl">Integrity</h2>
      <div className="chain" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, 1fr)` }} aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <i key={i} className={i < k ? (v.ok ? 'ok' : 'bad') : ''} />
        ))}
      </div>
      <p role={done ? 'status' : undefined} className={`mt-3.5 font-mono text-[13px] ${done ? (v.ok ? 'text-success' : 'text-danger') : 'text-muted'}`}>
        {!done
          ? `verifying ${k} / ${n}`
          : v.ok
            ? v.legacy
              ? 'legacy log: no hash chain recorded'
              : `chain intact · ${s.events.length} / ${s.events.length}`
            : `broken at #${v.brokenAt}`}
      </p>
      {head && (
        <p className="hash mt-1">
          head <b>{head}</b>
        </p>
      )}
    </section>
  )
}
