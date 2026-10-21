import type { Ruleset, RulesetId } from './types.ts'

/** Wallet floor; also the default stored on Player.coins (legacy field, not shown: the real wallet is per match). */
export const STARTING_COINS = 1000
export const COINS_PER_LOT = 200
/** Starting wallet for a match with this many lots: 200 CC per lot, at least 1,000. */
export const walletFor = (lotCount: number) => Math.max(STARTING_COINS, COINS_PER_LOT * lotCount)
export const NAME_MAX = 32
export const TEAM_MIN = 2
export const TEAM_MAX = 5
/** Server-side cap on a solution draft's text. */
export const SOLUTION_TEXT_MAX = 5000
/** Longest Game ID, client ID or run ID the server accepts. */
export const ID_MAX = 64

/** `min` is enforced; `max` is only the suggested length shown to players (longer solutions are accepted). */
export const SOLUTION_WORDS = { min: 40, max: 60 } as const
export const MAX_CHARACTERISTICS = 3

/**
 * Locked rulesets. A session snapshots one of these at creation and never reads this table again.
 * `lots` is empty here: each match draws its own technologies with matchRuleset (src/game/draw.ts).
 * `lotCount` is the two-side default for reference only.
 */
export const RULESETS: Record<RulesetId, Ruleset> = {
  normal: {
    id: 'normal',
    label: 'Normal',
    startingWallet: STARTING_COINS,
    lotCount: 5,
    bidIncrement: 10,
    bidSeconds: 10,
    introSeconds: 10,
    nextLotSeconds: 6,
    solutionSeconds: 300,
    solutionTechCount: 1,
    pitch: true,
    lots: [],
  },
  short: {
    id: 'short',
    label: 'Short',
    startingWallet: STARTING_COINS,
    lotCount: 4,
    bidIncrement: 10,
    bidSeconds: 8,
    introSeconds: 10,
    nextLotSeconds: 6,
    solutionSeconds: 300,
    solutionTechCount: 1,
    pitch: false,
    lots: [],
  },
}
