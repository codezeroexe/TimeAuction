import { useEffect, type ReactNode } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import { cc, Label, matchLabel, Tag } from '../components/game/bits.tsx'
import { sidesOf } from '../game/auction.ts'
import { SIDE_IDS } from '../game/types.ts'
import { stages } from './lobbyStages.ts'
import { useGame } from '../state/GameContext.tsx'
import { hrefFor, navigate, routeForRun, type Route } from '../state/useRoute.ts'
import { copyText } from '../components/ui/toast.tsx'

const RESUME: Partial<Record<Route, string>> = {
  match: 'Set up match',
  auction: 'Resume auction',
  summary: 'View auction summary',
  twist: 'Continue to Timeline Twist',
  mission: 'Continue to Future Mission',
  solution: 'Continue solution',
  results: 'View scoring status',
}

export default function Lobby() {
  const { state, event, switchParticipant, leaveStation, mySide, mode } = useGame()
  const { player, run, pastRuns } = state

  const s = run?.session
  // A station on a side other than the hosting seat (first side) is a guest of the host's match.
  const guest = !!s && !!mySide && mySide !== SIDE_IDS[0]
  const guestUnit = guest && s && mySide ? s.sides[mySide] : null
  const walletSide = s ? (mySide ?? sidesOf(s)[0]) : null

  useEffect(() => {
    if (!player) navigate('register')
  }, [player])

  // The event team pairs the match; the server runs its lots from the first intro onwards.
  useEffect(() => {
    if (mode === 'remote' && run?.phase === 'auction' && s?.status === 'live') navigate('auction')
  }, [mode, run?.phase, s?.status])

  if (!player) return null

  const target = routeForRun(run)
  const started = !!s && s.status !== 'ready'
  const waiting = mode === 'remote' && !s
  const runs = [...pastRuns, ...(run ? [run] : [])]
  // Matched by the host but not started: the host starts it from the main screen, so there is nothing to set up here.
  const held = mode === 'remote' && !!s && s.status === 'ready'
  const opponents = s ? sidesOf(s).filter((id) => id !== (mySide ?? SIDE_IDS[0])).map((id) => s.sides[id].name) : []
  const hasFeedback = !!run && event.feedback.some((f) => f.runId === run.runId)

  return (
    <GameShell fit>
      <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Welcome, {guestUnit?.name || (player.team?.name ?? player.name)}.</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
        {guest && s && mySide
          ? `You are Side ${mySide} in ${sidesOf(s).length === 2 ? `${s.sides[SIDE_IDS[0]].name}’s match` : `a match of ${sidesOf(s).length} players`}, playing from this station. ${started ? 'The auction has started.' : 'The event team starts the auction.'}`
          : run?.cancelled ? 'Your last run was cancelled.' : held ? `You have been matched for ${matchLabel(s!)}.` : started ? `${matchLabel(s!)} in progress.` : mode === 'remote' ? 'Registration is complete. The event team will pair you for a match.' : 'Registration is complete. Set up a match to enter the auction.'}
      </p>
      {waiting ? (
        <section aria-labelledby="mm-title" role="status" aria-live="polite" className="pn mt-8 max-w-2xl">
          <h2 id="mm-title" className="text-lg font-semibold text-accent">
            Waiting for matchmaking
          </h2>
          <p className="mt-2 text-[15px] text-muted">The event team will pair you shortly. Keep this screen open.</p>
          <div className="grid place-items-center py-3" aria-hidden="true">
            <svg viewBox="-100 -100 200 200" width="170">
              <g fill="none" stroke="var(--color-accent)">
                <circle r="14" fill="var(--color-accent)" stroke="none" />
                {[0, 1, 2].map((i) => (
                  <circle key={i} r="14" strokeWidth="1.5" className="wait-ring">
                    <animate attributeName="r" from="14" to="96" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
                    <animate attributeName="opacity" from=".9" to="0" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
                  </circle>
                ))}
              </g>
            </svg>
          </div>
        </section>
      ) : held ? (
        <section aria-labelledby="held-title" role="status" aria-live="polite" className="pn mt-8 max-w-2xl">
          <h2 id="held-title" className="text-lg font-semibold text-accent">
            Matched
          </h2>
          <p className="mt-2 text-[15px] text-ink-soft">You&rsquo;re in a match with {opponents.join(', ')}. Watch the main screen: the event team starts the auction.</p>
        </section>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <ChoiceCard route={target} title={RESUME[target] ?? 'Continue'} text={target === 'match' ? 'Choose an opponent and create your match.' : 'Pick up exactly where you left off.'} cta="Continue" />
          {started && mode !== 'remote' && <ChoiceCard route="replay" title="Start a replay" text="Run the auction again. Replays are unranked by default." cta="Start replay" />}
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="pn">
          {mode === 'local' && (
            <>
              <div className="lbl">Game ID</div>
              <div className="mt-3 mb-4 font-mono text-[2.3rem] leading-tight break-all">{state.gameId}</div>
              <Button
                variant="secondary"
                className="px-4 py-2"
                onClick={() => {
                  copyText(state.gameId ?? '', 'Game ID')
                }}
              >
                Copy ID
              </Button>
            </>
          )}
          <dl className={mode === 'local' ? 'mt-5 text-[15px]' : 'text-[15px]'}>
            <Row k="Wallet" v={<b className="font-mono font-medium text-accent">{walletSide && s ? cc(s.sides[walletSide].wallet.balance) : '—'}</b>} />
            {mode === 'local' && <Row k="Runs" v={<b className="font-mono font-medium">{runs.filter((r) => r.ranked).length} ranked · {runs.filter((r) => !r.ranked).length} replay</b>} />}
            <Row k="Mode" v={<b className="font-medium">{player.team ? `Team · ${player.team.members.length}` : 'Individual'}</b>} />
          </dl>
          <p className="mt-3 text-sm text-muted">
            {mode === 'remote' ? 'Moving to another station? Ask the event team for a resume code.' : 'Note your Game ID: it lets you resume on this device after another participant has played.'}
          </p>
        </div>
        <section aria-labelledby="profile-title" className="pn">
          <Label>
            <span id="profile-title">Registration</span>
          </Label>
          <dl className="mt-4 border-t border-line text-[15px]">
            <Row k={player.team ? 'Captain' : 'Player'} v={player.name} />
            {player.team && (
              <Row
                k="Members"
                v={
                  <ul className="text-right">
                    {player.team.members.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                }
              />
            )}
            {run && (
              <Row
                k="Current run"
                v={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono text-[13px]">{run.runId === 'SEALED' ? 'Sealed until the reveal' : run.runId}</span>
                    <Tag tone={run.ranked ? 'success' : 'neutral'}>{run.ranked ? 'Ranked' : 'Unranked'}</Tag>
                  </span>
                }
              />
            )}
          </dl>
        </section>
      </div>

      <div className="mt-8">
        <section aria-labelledby="progress-title">
          <Label>
            <span id="progress-title">Mission progress</span>
          </Label>
          <ol className="mt-4 border-l border-line">
            {stages(run, event, hasFeedback, waiting).map((st) => (
              <li key={st.name} className="relative py-2.5 pl-6">
                <span
                  aria-hidden="true"
                  className={`absolute top-[0.95rem] -left-[5px] h-[9px] w-[9px] rounded-full border ${
                    st.state === 'done' ? 'border-success bg-success' : st.state === 'current' ? 'border-accent bg-accent' : st.state === 'waiting' ? 'border-accent bg-paper' : 'border-line-strong bg-paper'
                  }`}
                />
                <div className="flex items-baseline justify-between gap-4">
                  <span className={st.state === 'todo' ? 'text-muted' : 'text-ink'}>{st.name}</span>
                  <span className={`text-xs ${st.state === 'done' ? 'text-success' : st.state !== 'todo' ? 'text-accent' : 'text-muted'}`}>
                    {{ done: 'Complete', current: 'In progress', waiting: 'Waiting', todo: 'Not started' }[st.state]}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={() => navigate('landing')}>
          Return to home
        </Button>
        {mode === 'remote' && player && (
          <Button
            variant="ghost"
            onClick={() => {
              if (!window.confirm(`Leave ${guestUnit?.name ?? player.team?.name ?? player.name} on this station? To come back you need a resume code from the event team.`)) return
              void leaveStation().then(() => navigate('landing'))
            }}
          >
            Not you? Leave this station
          </Button>
        )}
        {mode === 'local' && (
          <Button
            variant="ghost"
            onClick={() => {
              switchParticipant(null)
              navigate('landing')
            }}
          >
            Switch participant
          </Button>
        )}
      </div>
    </GameShell>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

/** A whole panel that is one link: title, a line of text, and a "->" footer. */
function ChoiceCard({ route, title, text, cta }: { route: Route; title: string; text: string; cta: string }) {
  return (
    <a className="pn block no-underline" href={hrefFor(route)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-[15px] text-muted">{text}</p>
      <span className="lbl mt-5 block text-accent">{cta} →</span>
    </a>
  )
}
