import GameShell from '../components/ui/GameShell.tsx'
import Button from '../components/ui/Button.tsx'
import { Label, Tag } from '../components/game/bits.tsx'
import { RuleIcon, type RuleIconName } from '../components/game/RuleIcon.tsx'
import { MAX_CHARACTERISTICS, RULESETS, SOLUTION_WORDS } from '../game/rules.ts'
import { RUBRIC } from '../game/scoring.ts'
import type { Ruleset } from '../game/types.ts'
import { useGame } from '../state/GameContext.tsx'

const RULESET_ICON: Record<string, RuleIconName> = { normal: 'auction', short: 'clock' }

const RUBRIC_ICON: Record<string, RuleIconName> = {
  relevance: 'mission',
  combination: 'engineer',
  twist: 'twist',
  sustainability: 'adapt',
  scalability: 'increment',
  explanation: 'solution',
}

export function RulesList({ rules, timed }: { rules: Ruleset; timed?: boolean }) {
  const rows: [string, string, RuleIconName][] = [
    ['Starting wallet', rules.lots.length ? `${rules.startingWallet.toLocaleString()} CC per Game Unit` : 'Set by the match size: 200 CC per technology in the auction', 'wallet'],
    ['Technologies auctioned', rules.lots.length ? String(rules.lotCount) : 'Drawn at random for each run; more sides, more technologies', 'lots'],
    ['Minimum increment', `${rules.bidIncrement} CC (bid any amount from current bid + ${rules.bidIncrement}, in steps of ${rules.bidIncrement})`, 'increment'],
    ['Bid countdown', `${rules.bidSeconds} s, reset by every accepted bid`, 'clock'],
    ['Lot pacing', `${rules.introSeconds} s before bidding opens; ${rules.nextLotSeconds} s to read each result, then the next technology opens by itself`, 'auction'],
    ['Solution', `At least ${rules.solutionTechCount} acquired ${rules.solutionTechCount === 1 ? 'technology' : 'technologies'} (any number), 1–${MAX_CHARACTERISTICS} characteristics, at least ${SOLUTION_WORDS.min} words (about ${SOLUTION_WORDS.max} suggested)`, 'solution'],
    ['Solution time limit', timed === false ? 'Untimed session' : `${rules.solutionSeconds / 60} minutes in a timed session`, 'clock'],
    ['Pitch', rules.pitch ? 'Included (not implemented in this prototype)' : 'No pitch', 'mission'],
  ]
  return (
    <dl className="divide-y divide-line border-y border-line text-sm">
      {rows.map(([k, v, icon]) => (
        <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-6">
          <dt className="flex items-center gap-2.5 text-muted">
            <RuleIcon name={icon} className="h-[18px] w-[18px] shrink-0 text-accent" />
            {k}
          </dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function Rules() {
  const { state, event } = useGame()
  const s = state.run?.session
  return (
    <GameShell>
      <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Rules and settings</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        Each session copies its ruleset when the match is created. Nothing changes the timer or increment of a session
        already in progress; a different configuration applies only to the next match.
      </p>

      {s && (
        <section className="mt-12" aria-labelledby="current-rules">
          <div className="flex flex-wrap items-center gap-3">
            <RuleIcon name="register" className="h-8 w-8 shrink-0 text-accent" />
            <Label>
              <span id="current-rules">Your current session</span>
            </Label>
            <Tag tone="accent">{s.rules.label} · locked to {s.sessionId}</Tag>
          </div>
          <div className="mt-4">
            <RulesList rules={s.rules} timed={state.run!.timed} />
          </div>
        </section>
      )}

      <div className="mt-14 flex flex-col gap-2.5 lg:min-h-[340px] lg:flex-row">
        {Object.values(RULESETS).map((r, i) => (
          <section
            key={r.id}
            style={{ '--i': i } as React.CSSProperties}
            aria-labelledby={`rs-${r.id}`}
            className="pn rl-in flex-1 overflow-hidden transition-[flex] duration-500 lg:min-w-[16rem] lg:hover:flex-[2.6] lg:focus-within:flex-[2.6]"
          >
            <div className="flex items-center gap-3">
              <RuleIcon name={RULESET_ICON[r.id] ?? 'auction'} className="h-8 w-8 shrink-0 text-accent" />
              <h2 id={`rs-${r.id}`} className="font-display text-3xl">
                {r.label} mode
              </h2>
              {event.settings.defaultRuleset === r.id && <Tag>Event default</Tag>}
            </div>
            <div className="mt-4">
              <RulesList rules={r} />
            </div>
          </section>
        ))}
      </div>

      <section className="mt-14" aria-labelledby="rubric">
        <div className="flex items-center gap-3">
          <RuleIcon name="scoring" className="h-8 w-8 shrink-0 text-accent" />
          <Label>
            <span id="rubric">Scoring rubric · 100 points</span>
          </Label>
        </div>
        <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
          {RUBRIC.map((c) => (
            <div key={c.id} className="grid gap-1 py-2.5 sm:grid-cols-[14rem_4rem_1fr] sm:gap-6">
              <dt className="flex items-center gap-2.5 font-medium">
                <RuleIcon name={RUBRIC_ICON[c.id] ?? 'scoring'} className="h-[18px] w-[18px] shrink-0 text-accent" />
                {c.label}
              </dt>
              <dd className="tabular-nums">{c.max} pts</dd>
              <dd className="text-muted">{c.guide}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-12 border-t border-line pt-8">
        <Button variant="secondary" onClick={() => history.back()}>
          Back
        </Button>
      </div>
    </GameShell>
  )
}
