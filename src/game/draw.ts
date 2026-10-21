import { getTech, TECHNOLOGIES } from '../data/technologies.ts'
import { TWISTS, twistForRun, valuesFor } from '../data/scenario.ts'
import { seeded } from './ids.ts'
import { RULESETS, walletFor } from './rules.ts'
import type { Ruleset, RulesetId, Tag } from './types.ts'

/** Pure, seeded draws. Everything is a function of the runId and side count, so server and browser agree. */

/** A technology is on the run's twist when its delta under that twist is at least this many percent, either way. */
export const RELEVANT_DELTA = 10
export const WILDCARD_CHANCE = 0.2
/** Bid clock for matches of this many sides or more. */
export const BIG_MATCH_SIDES = 7
export const BIG_MATCH_BID_SECONDS = 8

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Technologies auctioned in a standard match: about 1.7 per side, 5 to 20. */
export const lotCount = (sides: number): number => clamp(Math.round(1.5 * sides) + 2, 5, 20)
/** Short ruleset: 3 for two sides (as before), otherwise one per side plus two, 3 to 14. */
export const shortLotCount = (sides: number): number => (sides === 2 ? 3 : clamp(sides + 2, 3, 14))

const REQUIRED: Tag[] = ['energy', 'life']
const holds = (id: string, tag: Tag) => getTech(id).tags.includes(tag)

/** Number of off-theme "Wildcard" technologies for a lot count: 1, then 1–2, then 2–3. */
export function wildcardRange(count: number): [number, number] {
  return count <= 6 ? [1, 1] : count <= 12 ? [1, 2] : [2, 3]
}

/** Seeded draw without replacement; each id's chance is proportional to its weight. */
function drawFrom(ids: string[], n: number, weight: (id: string) => number, rnd: () => number): string[] {
  const left = [...ids]
  const out: string[] = []
  while (out.length < n && left.length > 0) {
    const total = left.reduce((sum, id) => sum + weight(id), 0)
    let r = rnd() * total
    let i = 0
    for (; i < left.length - 1; i++) {
      r -= weight(left[i]!)
      if (r < 0) break
    }
    out.push(...left.splice(i, 1))
  }
  return out
}

/** Technologies off the run's twist (|delta| below RELEVANT_DELTA). These are the lots marked "Wildcard". */
export function offThemeIn(runId: string, lots: string[]): string[] {
  const values = valuesFor(TWISTS[twistForRun(runId)]!)
  return lots.filter((id) => Math.abs(values[id]?.delta ?? 0) < RELEVANT_DELTA)
}

/**
 * Twist first, then the tools. The run's twist is picked by twistForRun; most lots are technologies that move under it
 * (|delta| ≥ 10, both helpful and harmful, weighted by |delta|). The rest are off-theme wildcards, 1 to 3 by lot count.
 * If the twist has too few relevant technologies, the shortfall is filled with off-theme ones.
 * Energy and life are guaranteed by swapping in a same-kind pick, so the relevant/off-theme split never changes.
 * If no same-kind pick can be swapped, that guarantee is dropped for the run.
 */
export function lotsForRun(runId: string, sides: number, short = false): string[] {
  const count = short ? shortLotCount(sides) : lotCount(sides)
  const rnd = seeded(`lots|${runId}`)
  const values = valuesFor(TWISTS[twistForRun(runId)]!)
  const delta = (id: string) => Math.abs(values[id]?.delta ?? 0)
  const pool = TECHNOLOGIES.map((t) => t.id)
  const relevant = pool.filter((id) => delta(id) >= RELEVANT_DELTA)
  const offTheme = pool.filter((id) => delta(id) < RELEVANT_DELTA)
  const [lo, hi] = wildcardRange(count)
  const wildcards = lo + Math.floor(rnd() * (hi - lo + 1))
  const relevantPicks = Math.min(count - wildcards, relevant.length)
  const picked = [
    ...drawFrom(relevant, relevantPicks, delta, rnd),
    ...drawFrom(offTheme, count - relevantPicks, () => 1, rnd),
  ]
  const isRelevant = (id: string) => delta(id) >= RELEVANT_DELTA
  // A swap must keep the relevant/off-theme split, and must not evict the last holder of the other guaranteed tag.
  const slotFor = (incoming: string) =>
    picked.findLastIndex((id) => isRelevant(id) === isRelevant(incoming) && REQUIRED.every((t) => !holds(id, t) || picked.some((x) => x !== id && holds(x, t))))
  const rest = pool.filter((id) => !picked.includes(id))
  for (const tag of REQUIRED) {
    if (picked.some((id) => holds(id, tag))) continue
    const usable = rest.filter((id) => holds(id, tag) && slotFor(id) >= 0)
    if (usable.length === 0) continue
    const incoming = usable[Math.floor(rnd() * usable.length)]!
    picked[slotFor(incoming)] = incoming
    rest.splice(rest.indexOf(incoming), 1)
  }
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[picked[i], picked[j]] = [picked[j]!, picked[i]!]
  }
  return picked
}

/** The run's "Bargain lot" (half price), if any: 20% of runs, one seeded pick from the drawn lots. */
export function wildcardForRun(runId: string, lots: string[]): string | undefined {
  const rnd = seeded(`wildcard|${runId}`)
  if (rnd() >= WILDCARD_CHANCE || lots.length === 0) return undefined
  return lots[Math.floor(rnd() * lots.length)]
}

/** The ruleset copy a session stores: drawn lots, count, clock and optional wildcard for this run. */
export function matchRuleset(id: RulesetId, runId: string, sides: number): Ruleset {
  const base = RULESETS[id]
  const lots = lotsForRun(runId, sides, id === 'short')
  const rules: Ruleset = {
    ...structuredClone(base),
    lots,
    lotCount: lots.length,
    startingWallet: walletFor(lots.length),
    bidSeconds: sides >= BIG_MATCH_SIDES ? BIG_MATCH_BID_SECONDS : base.bidSeconds,
  }
  rules.offThemeTechIds = offThemeIn(runId, lots)
  const wildcard = wildcardForRun(runId, lots)
  if (wildcard) rules.wildcardTechId = wildcard
  return rules
}

