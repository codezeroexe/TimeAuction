import { getTech } from '../data/technologies.ts'
import { eventHash, GENESIS } from './checksum.ts'
import { SIDE_IDS, type AuctionEvent, type GameUnit, type Lot, type MatchType, type Ruleset, type Session, type SideId } from './types.ts'

/**
 * Authoritative auction engine. Every function is pure: it returns a new Session and never mutates its input.
 * Coins move only in `closeLot`, once, when a lot is SOLD.
 *
 * Each lot runs on its own countdown (`remainingMs`, `running`): intro → bidding → decided (result pause) → next lot.
 * The engine moves between phases in `tick`, so the server and the browser agree on the time.
 */

export const MIN_SIDES = 2
export const MAX_SIDES = 12

/** Side IDs present in a session, in seating order (A first). */
export const sidesOf = (s: Pick<Session, 'sides'>): SideId[] => SIDE_IDS.filter((id) => id in s.sides)

/** Two human sides on one device. Matches of 3+ sides always use one station per side; a station that holds a side is never hot-seat. */
export const isHotSeat = (s: Pick<Session, 'sides'>, mySide: SideId | null = null) => {
  const ids = sidesOf(s)
  return !mySide && ids.length === 2 && ids.every((id) => s.sides[id].controller === 'human')
}

/** Technologies a side still needs for a solution, against the lots still to come (the open one included). */
export function techNeed(s: Pick<Session, 'sides' | 'lots' | 'rules'>, side: SideId) {
  const need = s.rules.solutionTechCount
  const have = s.sides[side].portfolio.length
  const left = s.lots.filter((l) => l.status === 'pending' || l.status === 'open').length
  return { need, have, left, short: have < need, reachable: have + left >= need }
}

/** Wins allowed per side in a match of 3+ sides, so one side cannot take most of the lots. Two-side matches have no cap. */
export const portfolioCap = (s: Session): number => Math.ceil(s.lots.length / sidesOf(s).length) + 1

/** In matches of 3+ sides, a side that has reached its cap can win nothing more, so it counts as passed. */
export const atPortfolioCap = (s: Session, side: SideId): boolean => sidesOf(s).length >= 3 && s.sides[side].portfolio.length >= portfolioCap(s)

/** Opening price of a lot: its starting bid, or half of it (to the nearest 10) for the run's wildcard lot. */
export const openingBid = (rules: Ruleset, techId: string): number => {
  const start = getTech(techId).startingBid
  return techId === rules.wildcardTechId ? Math.round(start / 20) * 10 : start
}

export type UnitSpec = Pick<GameUnit, 'kind' | 'name' | 'members' | 'controller' | 'gameId'>

export interface Outcome {
  session: Session
  ok: boolean
  message: string
}

function log(s: Session, e: Omit<AuctionEvent, 'seq' | 'sessionId' | 'hash'>) {
  const event = { seq: s.events.length + 1, sessionId: s.sessionId, ...e }
  s.events.push({ ...event, hash: eventHash(event, s.events.at(-1)?.hash ?? GENESIS) })
}

export const currentLot = (s: Session): Lot => s.lots[s.current]

export function nextValidBid(s: Session): number {
  const lot = currentLot(s)
  return lot.bid === null ? openingBid(s.rules, lot.techId) : lot.bid + s.rules.bidIncrement
}

export function createSession(input: {
  sessionId: string
  gameId: string
  runId: string
  matchType: MatchType
  rules: Ruleset
  /** Seated in order: the first spec becomes Side A. */
  sides: UnitSpec[]
  at: string
  stationId?: string
}): Session {
  const { at, sides: specs } = input
  if (specs.length < MIN_SIDES || specs.length > MAX_SIDES) throw new Error(`A match has ${MIN_SIDES} to ${MAX_SIDES} sides, not ${specs.length}.`)
  const bots = specs.filter((u) => u.controller === 'bot').length
  if (bots > 1) throw new Error('A computer opponent may never play another computer opponent.')
  if (bots === 1 && specs.length !== 2) throw new Error('ChronoBot plays only a single opponent.')
  const unit = (spec: UnitSpec, id: SideId): GameUnit => ({
    id,
    ...spec,
    ranked: spec.controller === 'human',
    wallet: { initial: input.rules.startingWallet, balance: input.rules.startingWallet },
    portfolio: [],
  })
  if (input.rules.lots.length !== input.rules.lotCount) throw new Error('Session rules must list exactly lotCount technologies.')
  const rules = structuredClone(input.rules)
  const sides = Object.fromEntries(specs.map((spec, i) => [SIDE_IDS[i], unit(spec, SIDE_IDS[i])]))
  const s: Session = {
    sessionId: input.sessionId,
    gameId: input.gameId,
    runId: input.runId,
    matchType: input.matchType,
    rules,
    status: 'ready',
    sides,
    lots: rules.lots.slice(0, rules.lotCount).map((techId) => ({
      techId,
      status: 'pending',
      phase: 'intro',
      bid: null,
      leader: null,
      passed: [],
      bidCount: 0,
      remainingMs: rules.bidSeconds * 1000,
      running: false,
      quietMs: 0,
    })),
    current: 0,
    events: [],
    createdAt: at,
    stationId: input.stationId,
  }
  log(s, {
    at,
    type: 'session_created',
    techId: null,
    sideId: null,
    amount: null,
    note: `${sidesOf(s).map((id) => s.sides[id].name).join(' vs ')} · ${rules.label} rules · ${s.lots.length} technologies`,
  })
  return s
}

/** Seconds left before bidding opens, for messages. */
const opensIn = (lot: Lot) => `Bidding opens in ${Math.ceil(lot.remainingMs / 1000)} s.`

/** Shows a lot in its intro countdown. The countdown then runs on its own (see tick). */
function openLot(s: Session, index: number, at: string) {
  s.current = index
  const lot = s.lots[index]
  lot.status = 'open'
  lot.phase = 'intro'
  lot.running = true
  lot.remainingMs = s.rules.introSeconds * 1000
  lot.quietMs = 0
  const opening = openingBid(s.rules, lot.techId)
  const wildcard = lot.techId === s.rules.wildcardTechId ? ' (bargain lot: half price)' : ''
  log(s, {
    at,
    type: 'lot_opened',
    techId: lot.techId,
    sideId: null,
    amount: opening,
    note: `Technology ${index + 1} of ${s.lots.length} opened at a starting bid of ${opening} CC${wildcard}`,
  })
}

/** The intro is over: bidding opens on the same lot with a fresh bid clock. */
function openBidding(s: Session) {
  const lot = currentLot(s)
  lot.phase = 'open'
  lot.remainingMs = s.rules.bidSeconds * 1000
  lot.quietMs = 0
}

/** Begins the auction. The first lot shows its intro countdown, then bidding opens on its own. */
export function startAuction(input: Session, at: string): Session {
  if (input.status !== 'ready') return input
  const s = structuredClone(input)
  s.status = 'live'
  log(s, { at, type: 'auction_started', techId: null, sideId: null, amount: null, note: 'Auction started' })
  openLot(s, 0, at)
  return s
}

/**
 * Start/pause the active countdown (intro, bidding or result pause). Starting during the intro skips the rest of it.
 */
export function setRunning(input: Session, running: boolean): Session {
  const lot = currentLot(input)
  if (input.status !== 'live' || lot.status === 'pending') return input
  const s = structuredClone(input)
  const l = currentLot(s)
  if (running && l.status === 'open' && l.phase === 'intro') {
    openBidding(s)
    return s
  }
  if (l.running === running) return input
  l.running = running
  return s
}

/** Why `side` cannot bid right now, or null if it can bid `amount` (default: the next valid bid). */
export function bidBlocker(s: Session, side: SideId, amount = nextValidBid(s)): string | null {
  const lot = currentLot(s)
  const unit = s.sides[side]
  if (s.status !== 'live' || lot.status !== 'open') return 'Bidding on this technology has closed.'
  if (lot.phase === 'intro') return opensIn(lot)
  if (!lot.running) return 'The auction clock is paused.'
  if (lot.passed.includes(side)) return `${unit.name} passed on this technology and cannot bid on it again.`
  if (lot.leader === side) return `${unit.name} already holds the highest bid.`
  if (atPortfolioCap(s, side)) return `${unit.name} has reached the ${portfolioCap(s)} technologies allowed per side.`
  const next = nextValidBid(s)
  if (!Number.isInteger(amount) || amount < next) return `Bid at least ${next} CC (${lot.bid === null ? 'the starting bid' : `current bid + ${s.rules.bidIncrement}`}).`
  if ((amount - next) % s.rules.bidIncrement !== 0) return `Bids go up in steps of ${s.rules.bidIncrement} CC.`
  if (amount > unit.wallet.balance) return `Not enough ChronoCoins: ${amount} CC needed, ${unit.wallet.balance} CC available.`
  return null
}

export function placeBid(input: Session, side: SideId, amount: number, at: string): Outcome {
  const blocker = bidBlocker(input, side, amount)
  const s = structuredClone(input)
  const lot = currentLot(s)
  if (blocker) {
    log(s, { at, type: 'bid_rejected', techId: lot.techId, sideId: side, amount, note: blocker })
    return { session: s, ok: false, message: blocker }
  }
  lot.bid = amount
  lot.leader = side
  lot.bidCount += 1
  lot.remainingMs = s.rules.bidSeconds * 1000
  lot.quietMs = 0
  const msg = `${s.sides[side].name} bid ${amount} CC`
  log(s, { at, type: 'bid_accepted', techId: lot.techId, sideId: side, amount, note: msg })
  settleIfDecided(s, at)
  return { session: s, ok: true, message: `${msg}. Leading.` }
}

export function passLot(input: Session, side: SideId, at: string): Outcome {
  const lot = currentLot(input)
  const name = input.sides[side].name
  let blocker: string | null = null
  if (input.status !== 'live' || lot.status !== 'open') blocker = 'Bidding on this technology has closed.'
  else if (lot.phase === 'intro') blocker = opensIn(lot)
  else if (!lot.running) blocker = 'The auction clock is paused.'
  else if (lot.passed.includes(side)) blocker = `${name} has already passed.`
  else if (lot.leader === side) blocker = `${name} holds the highest bid; passing would not change anything.`
  if (blocker) return { session: input, ok: false, message: blocker }

  const s = structuredClone(input)
  currentLot(s).passed.push(side)
  log(s, { at, type: 'pass', techId: lot.techId, sideId: side, amount: null, note: `${name} passed. No coins deducted.` })
  settleIfDecided(s, at)
  return { session: s, ok: true, message: `${name} passed on ${getTech(lot.techId).name}.` }
}

/** Closes early once nobody is left who could outbid: everyone except the leader has passed. */
function settleIfDecided(s: Session, at: string) {
  const lot = currentLot(s)
  const contenders = sidesOf(s).filter((id) => id !== lot.leader && !lot.passed.includes(id) && !atPortfolioCap(s, id))
  if (contenders.length === 0) closeLot(s, at)
}

/** Finalises the current lot, then shows its result for the result pause. Guarded so a lot can be finalised exactly once. */
function closeLot(s: Session, at: string) {
  const lot = currentLot(s)
  if (lot.status !== 'open') return
  finalise(s, at)
  lot.phase = 'decided'
  lot.running = true
  lot.remainingMs = s.rules.nextLotSeconds * 1000
  lot.quietMs = 0
}

/** The only place coins and ownership change. */
function finalise(s: Session, at: string) {
  const lot = currentLot(s)
  const tech = getTech(lot.techId)
  if (lot.leader === null || lot.bid === null) {
    lot.status = 'unsold'
    log(s, { at, type: 'unsold', techId: lot.techId, sideId: null, amount: null, note: `${tech.name} UNSOLD. No bids were placed.` })
    return
  }
  const winner = s.sides[lot.leader]
  if (lot.bid > winner.wallet.balance || winner.portfolio.includes(lot.techId)) {
    // Unreachable through bidBlocker; kept so a corrupted save can never produce a negative balance or duplicate.
    throw new Error(`Integrity check failed finalising ${tech.name}`)
  }
  lot.status = 'sold'
  log(s, { at, type: 'sold', techId: lot.techId, sideId: winner.id, amount: lot.bid, note: `${tech.name} SOLD to ${winner.name} for ${lot.bid} CC` })
  const before = winner.wallet.balance
  winner.wallet.balance = before - lot.bid
  winner.portfolio.push(lot.techId)
  log(s, {
    at,
    type: 'purchase',
    techId: lot.techId,
    sideId: winner.id,
    amount: lot.bid,
    note: `${winner.name} charged ${lot.bid} CC. Balance ${before} → ${winner.wallet.balance} CC`,
    wallet: { before, after: winner.wallet.balance },
    portfolioAfter: [...winner.portfolio],
  })
}

/**
 * Advance the running countdowns by `deltaMs` of real elapsed time. A lot goes intro → bidding → decided → next lot
 * (after the last lot, the auction completes). ChronoBot acts during bidding only.
 */
export function tick(input: Session, deltaMs: number, at: string, decide?: (s: Session) => 'bid' | 'pass' | 'wait'): Session {
  if (input.status !== 'live' || !currentLot(input).running) return input
  let s = structuredClone(input)
  let left = deltaMs
  while (left > 0 && s.status === 'live' && currentLot(s).running) {
    const lot = currentLot(s)
    const step = Math.min(left, lot.remainingMs)
    left -= step
    lot.remainingMs -= step
    if (lot.status === 'open' && lot.phase === 'intro') {
      if (lot.remainingMs === 0) openBidding(s)
    } else if (lot.status === 'open') {
      lot.quietMs += step
      if (lot.remainingMs > 0 && decide) {
        const bot = sidesOf(s).find((id) => s.sides[id].controller === 'bot')
        if (bot) {
          const choice = decide(s)
          if (choice === 'bid') s = placeBid(s, bot, nextValidBid(s), at).session
          else if (choice === 'pass') s = passLot(s, bot, at).session
        }
      }
      if (s.status === 'live' && currentLot(s).status === 'open' && currentLot(s).remainingMs === 0) closeLot(s, at)
    } else if (lot.remainingMs === 0) {
      nextLot(s, at)
    }
  }
  return s
}

/** Opens the next lot, or completes the auction after the last one. Mutates `s`. */
function nextLot(s: Session, at: string) {
  if (s.current < s.lots.length - 1) {
    openLot(s, s.current + 1, at)
    return
  }
  s.status = 'complete'
  currentLot(s).running = false
  const sold = s.lots.filter((l) => l.status === 'sold').length
  log(s, { at, type: 'auction_complete', techId: null, sideId: null, amount: null, note: `Auction complete: ${sold} of ${s.lots.length} technologies sold` })
}

/** Move on now, skipping the rest of a result pause. On the last lot this completes the auction instead. */
export function advance(input: Session, at: string): Session {
  const lot = currentLot(input)
  if (input.status !== 'live' || (lot.status !== 'sold' && lot.status !== 'unsold')) return input
  const s = structuredClone(input)
  nextLot(s, at)
  return s
}

export const isLastLot = (s: Session) => s.current === s.lots.length - 1
