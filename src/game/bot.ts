import { getTech } from '../data/technologies.ts'
import { currentLot, nextValidBid, sidesOf } from './auction.ts'
import type { Session } from './types.ts'

/**
 * ChronoBot: deterministic, rule-based bidder. Inputs are only public auction state
 * (current lot, current bid, technology utility, lots remaining) and its own wallet.
 */

/** Reaction delay varies with the lot and the bid count so it does not answer instantly every time. */
export function botDelayMs(s: Session): number {
  const lot = currentLot(s)
  return 1400 + ((lot.bidCount * 700 + s.current * 450) % 1600)
}

/** The highest price ChronoBot will pay for the current lot, in whole increments. */
export function botLimit(s: Session): number {
  const bot = sidesOf(s).map((id) => s.sides[id]).find((u) => u.controller === 'bot')
  if (!bot) return 0
  const lotsLeft = s.lots.length - s.current
  // Each side is expected to win about lotsLeft · 2 / n of the remaining lots (lotsLeft for two sides).
  const share = bot.wallet.balance / Math.max(1, Math.ceil((lotsLeft * 2) / sidesOf(s).length))
  // Values a lot at 25–100% of an even budget share by utility, so a strategic human can still win three lots.
  const weight = 0.25 + 0.75 * getTech(currentLot(s).techId).utility
  const inc = s.rules.bidIncrement
  return Math.min(bot.wallet.balance, Math.floor((share * weight) / inc) * inc)
}

export function decideBot(s: Session): 'bid' | 'pass' | 'wait' {
  const id = sidesOf(s).find((side) => s.sides[side].controller === 'bot')
  const lot = currentLot(s)
  if (!id || lot.status !== 'open' || lot.phase !== 'open' || !lot.running) return 'wait'
  if (lot.leader === id || lot.passed.includes(id)) return 'wait'
  if (lot.quietMs < botDelayMs(s)) return 'wait'
  return nextValidBid(s) <= botLimit(s) ? 'bid' : 'pass'
}
