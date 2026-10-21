import { useEffect, useState, type FormEvent } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button, { Arrow } from '../components/ui/Button.tsx'
import { cc, isHotSeat, Label, matchLabel, SideBadge, Tag } from '../components/game/bits.tsx'
import { sidesOf } from '../game/auction.ts'
import { NAME_MAX, RULESETS, SOLUTION_WORDS, TEAM_MAX } from '../game/rules.ts'
import { validateRegistration } from '../game/validation.ts'
import type { MatchType, Ruleset, RulesetId } from '../game/types.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate, routeForRun } from '../state/useRoute.ts'
import { copyText } from '../components/ui/toast.tsx'

const input =
  'block w-full rounded-[10px] border border-line-strong bg-paper/70 px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-accent focus:bg-accent-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-invalid:border-danger'
const floating =
  'peer block w-full rounded-[10px] border border-line-strong bg-paper/70 px-3.5 pt-6 pb-2 text-[15px] text-ink placeholder:text-muted/70 focus:border-accent focus:bg-accent-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-invalid:border-danger'
const floatLabel = 'pointer-events-none absolute left-3.5 top-2 lbl peer-focus:text-accent'

interface Option {
  type: MatchType
  label: string
  opponent: 'individual' | 'team'
  note: string
}

function optionsFor(mode: 'individual' | 'team'): Option[] {
  const human = 'Local hot-seat: both sides play on this device and take turns at the controls.'
  return mode === 'individual'
    ? [
        { type: 'ivi', label: 'Individual vs Individual', opponent: 'individual', note: human },
        { type: 'ivt', label: 'Individual vs Team', opponent: 'team', note: human },
      ]
    : [
        { type: 'tvt', label: 'Team vs Team', opponent: 'team', note: human },
        { type: 'ivt', label: 'Team vs Individual', opponent: 'individual', note: human },
      ]
}

function RulesTable({ rules, timed }: { rules: Ruleset; timed: boolean }) {
  const rows: [string, string][] = [
    ['Starting wallet', `${cc(rules.startingWallet)} per side`],
    ['Technologies auctioned', rules.lots.length ? String(rules.lotCount) : 'Drawn at random for each run'],
    ['Minimum increment', cc(rules.bidIncrement)],
    ['Bid countdown', `${rules.bidSeconds} seconds, resets on each accepted bid`],
    ['Lot pacing', `${rules.introSeconds} seconds before bidding opens; ${rules.nextLotSeconds} seconds on each result, then the next technology opens by itself`],
    ['Solution', `At least ${rules.solutionTechCount} acquired ${rules.solutionTechCount === 1 ? 'technology' : 'technologies'}, at least ${SOLUTION_WORDS.min} words`],
    ['Solution time limit', timed ? `${rules.solutionSeconds / 60} minutes` : 'Untimed'],
    ['Pitch', rules.pitch ? 'Yes (next stage)' : 'No pitch'],
  ]
  return (
    <dl className="divide-y divide-line border-y border-line text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6 py-2.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function MatchSetup() {
  const { state, event, mode, mySide, createMatch, discardMatch, proceedToAuction } = useGame()
  const { player, run } = state
  const session = run?.session

  useEffect(() => {
    if (!player) navigate('register')
    // Remote matches start from the host console: a held match waits in the lobby, never here.
    else if (mode === 'remote' && (!run?.session || run.session.status === 'ready')) navigate('lobby')
    else if (routeForRun(run) !== 'match') navigate(routeForRun(run))
  }, [player, run, mode])

  if (!player) return null
  if (mode === 'remote' && (!session || session.status === 'ready')) return null
  if (session?.status === 'ready' && run) return Confirm()

  return <SetupForm mode={player.mode} onCreate={createMatch} defaults={event.settings} />

  function Confirm() {
    const s = session!
    const hot = isHotSeat(s, mySide)
    const seats = sidesOf(s)
    const bot = seats.some((id) => s.sides[id].controller === 'bot')
    const guest = !!mySide && mySide !== seats[0]
    return (
      <GameShell fit>
        <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">{matchLabel(s)}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Check the sides and rules. They are locked for this session once the auction starts.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Tag tone={bot ? 'accent' : 'neutral'}>
            {bot
              ? 'vs ChronoBot · fallback opponent'
              : hot
                ? mySide
                  ? `Two stations · Side ${mySide} on this station`
                  : 'Local hot-seat · one device'
                : `${seats.length} stations · one side each`}
          </Tag>
          <Tag>{s.rules.label} rules</Tag>
          <Tag tone={run!.ranked ? 'success' : 'neutral'}>{run!.ranked ? 'Ranked run' : 'Unranked replay'}</Tag>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-16">
          <section aria-labelledby="sides-title">
            <Label>
              <span id="sides-title">Sides</span>
            </Label>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {seats.map((id) => {
                const u = s.sides[id]
                return (
                  <li key={id} className="flex items-start gap-4 py-4">
                    <SideBadge side={id} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {u.name} <span className="font-normal text-muted">· Side {id}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {u.kind === 'bot'
                          ? 'Computer bidder. Uses only public auction information and its own wallet.'
                          : u.kind === 'team'
                            ? `Team of ${u.members.length}: ${u.members.join(', ')}`
                            : 'Individual player'}
                      </p>
                    </div>
                    <p className="text-sm tabular-nums">{cc(u.wallet.balance)}</p>
                  </li>
                )
              })}
            </ul>

            <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">Session ID</dt>
              <dd className="font-mono text-[13px]">{s.sessionId}</dd>
              <dt className="text-muted">{s.runId === 'SEALED' ? 'Run' : 'Run ID'}</dt>
              <dd className="font-mono text-[13px]">
                {s.runId === 'SEALED' ? '' : `${s.runId} `}
                <span className="font-sans text-muted">{s.runId === 'SEALED' ? '' : '· '}run {run!.number}</span>
              </dd>
              <dt className="text-muted">Game ID</dt>
              <dd className="font-mono text-[13px]">{s.gameId}</dd>
            </dl>
          </section>

          <section aria-labelledby="rules-title">
            <Label>
              <span id="rules-title">{s.rules.label} rules</span>
            </Label>
            <div className="mt-4">
              <RulesTable rules={s.rules} timed={run!.timed} />
            </div>
          </section>
        </div>

        {mode === 'remote' && hot && !mySide && (
          <section aria-labelledby="wait-title" className="pn pn-hot mt-12 max-w-2xl">
            <h2 id="wait-title" className="text-lg font-semibold text-danger">
              Waiting for opponent
            </h2>
            <div className="grid place-items-center py-3" aria-hidden="true">
              <svg viewBox="-100 -100 200 200" width="170">
                <g fill="none" stroke="var(--color-danger)">
                  <circle r="14" fill="var(--color-danger)" stroke="none" />
                  {[0, 1, 2].map((i) => (
                    <circle key={i} r="14" strokeWidth="1.5" className="wait-ring">
                      <animate attributeName="r" from="14" to="96" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
                      <animate attributeName="opacity" from=".9" to="0" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
                    </circle>
                  ))}
                </g>
              </svg>
            </div>
            <p className="text-center font-mono text-[2.1rem] tracking-[0.06em] text-danger">{s.sessionId}</p>
            <div className="mt-3 text-center">
              <Button
                variant="secondary"
                className="px-4 py-2"
                onClick={() => {
                  copyText(s.sessionId, 'Session ID')
                }}
              >
                Copy session
              </Button>
            </div>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
              {s.sides[seats[1]].name} can play from their own station: there, choose <strong className="font-semibold text-ink">Join match</strong> on the registration
              screen and enter this Session ID. If nobody joins, both sides are played here.
            </p>
            {s.events.at(-1)?.hash && (
              <p className="hash mt-4">
                chain head <b>{s.events.at(-1)!.hash}</b>
              </p>
            )}
          </section>
        )}
        {guest ? (
          <p className="mt-8 border-t border-line pt-8 text-[15px] text-ink-soft" role="status">
            Waiting for {s.sides[seats[0]].name} to start the auction. This screen moves on by itself.
          </p>
        ) : (
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={discardMatch}>
              Change setup
            </Button>
            <Button className="px-8 py-3 tracking-wide" onClick={() => proceedToAuction().then((r) => r.ok && navigate('auction'))}>
              Proceed to auction <Arrow />
            </Button>
          </div>
        )}
      </GameShell>
    )
  }
}

function SetupForm({ mode, onCreate, defaults }: { mode: 'individual' | 'team'; onCreate: ReturnType<typeof useGame>['createMatch']; defaults: { defaultRuleset: RulesetId; defaultTimed: boolean } }) {
  const { mode: storage } = useGame()
  const options = optionsFor(mode)
  const [type, setType] = useState<MatchType>(options[0].type)
  const [rulesetId, setRulesetId] = useState<RulesetId>(defaults.defaultRuleset)
  const [timed, setTimed] = useState(defaults.defaultTimed)
  const [name, setName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [mates, setMates] = useState<string[]>([''])
  const [submitted, setSubmitted] = useState(false)
  const opt = options.find((o) => o.type === type)!

  const errors = validateRegistration({ name, mode: opt.opponent, teamName, teammates: opt.opponent === 'team' ? mates : [] })
  const shown = submitted ? errors : {}
  const invalid = Object.keys(errors).length > 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (invalid) return
    const trimmed = [name.trim(), ...mates.map((m) => m.trim())]
    onCreate({
      matchType: type,
      rulesetId,
      timed,
      opponents: [
        opt.opponent === 'team'
          ? { kind: 'team', name: teamName.trim(), members: trimmed, controller: 'human' }
          : { kind: 'individual', name: name.trim(), members: [name.trim()], controller: 'human' },
      ],
    })
  }

  return (
    <GameShell fit>
      <button type="button" onClick={() => navigate('lobby')} className="text-sm text-muted transition-colors hover:text-ink">
        &larr; Lobby
      </button>
      <h1 className="mt-8 font-display text-5xl leading-[1.02] sm:text-6xl">Set up your match</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
        {storage === 'remote'
          ? 'Choose a human opponent to play them on this device or from their own station (they join with the Session ID).'
          : 'No event server is connected, so a human opponent plays on this device and takes turns at the controls.'}
      </p>

      <form noValidate onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <fieldset>
            <legend className="text-sm font-medium">Opponent</legend>
            <div className="mt-3 divide-y divide-line border-y border-line">
              {options.map((o) => (
                <label key={o.type} className="flex cursor-pointer items-start gap-3 py-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input
                    type="radio"
                    name="match"
                    value={o.type}
                    checked={type === o.type}
                    onChange={() => setType(o.type)}
                    className="mt-1 accent-accent"
                    aria-label={o.label}
                  />
                  <span>
                    <span className="block font-medium">{o.label}</span>
                    <span className="mt-0.5 block text-sm text-muted">{o.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-10">
              <legend className="text-sm font-medium">{opt.opponent === 'team' ? 'Opponent team' : 'Opponent player'}</legend>
              {opt.opponent === 'team' && (
                <div className="relative mt-3">
                  <input id="opp-team" className={floating} value={teamName} maxLength={NAME_MAX} onChange={(e) => setTeamName(e.target.value)} aria-invalid={!!shown.teamName} />
                  <label htmlFor="opp-team" className={floatLabel}>
                    Team name
                  </label>
                  {shown.teamName && <p className="mt-1.5 text-sm text-danger">{shown.teamName}</p>}
                </div>
              )}
              <div className="relative mt-4">
                <input id="opp-name" className={floating} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} aria-invalid={!!shown.name} />
                <label htmlFor="opp-name" className={floatLabel}>
                  {opt.opponent === 'team' ? 'Captain name' : 'Player name'}
                </label>
                {shown.name && <p className="mt-1.5 text-sm text-danger">{shown.name}</p>}
              </div>
              {opt.opponent === 'team' && (
                <div className="mt-4">
                  <p className="text-sm text-ink-soft">
                    Other members <span className="text-muted tabular-nums">· {mates.length + 1} of {TEAM_MAX}, minimum 2</span>
                  </p>
                  <ul className="mt-1.5 space-y-2">
                    {mates.map((m, i) => (
                      <li key={i}>
                        <div className="flex gap-2">
                          <input
                            aria-label={`Opponent member ${i + 2}`}
                            className={input}
                            value={m}
                            maxLength={NAME_MAX}
                            onChange={(e) => setMates((t) => t.map((x, j) => (j === i ? e.target.value : x)))}
                            aria-invalid={!!shown.teammate?.[i]}
                          />
                          <Button variant="ghost" className="px-3" disabled={mates.length <= 1} onClick={() => setMates((t) => t.filter((_, j) => j !== i))} aria-label={`Remove member ${i + 2}`}>
                            Remove
                          </Button>
                        </div>
                        {shown.teammate?.[i] && <p className="mt-1 text-sm text-danger">{shown.teammate[i]}</p>}
                      </li>
                    ))}
                  </ul>
                  <Button variant="secondary" className="mt-3" disabled={mates.length + 1 >= TEAM_MAX} onClick={() => setMates((t) => [...t, ''])}>
                    + Add member
                  </Button>
                </div>
              )}
            </fieldset>
        </div>

        <div>
          <fieldset>
            <legend className="text-sm font-medium">Ruleset</legend>
            <div className="seg mt-3">
              {(Object.keys(RULESETS) as RulesetId[]).map((id) => (
                <label key={id} className="seg-o" data-on={rulesetId === id}>
                  <input type="radio" name="ruleset" value={id} checked={rulesetId === id} onChange={() => setRulesetId(id)} className="sr-only" aria-label={RULESETS[id].label} />
                  {RULESETS[id].label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5">
            <RulesTable rules={RULESETS[rulesetId]} timed={timed} />
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="mt-0.5 accent-accent" aria-label="Timed session" />
            <span>
              Timed session
              <span className="block text-muted">Enforce the solution time limit. Untimed sessions suit practice.</span>
            </span>
          </label>

          <div className="mt-10 border-t border-line pt-8">
            {submitted && invalid && <p className="mb-4 text-sm text-danger" role="alert">Complete the opponent details to continue.</p>}
            <Button type="submit" className="w-full py-3 tracking-wide">
              Create match
            </Button>
            <p className="mt-3 text-center text-sm text-muted">You’ll review sides and rules before the auction starts.</p>
          </div>
        </div>
      </form>
    </GameShell>
  )
}
