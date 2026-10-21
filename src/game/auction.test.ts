import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, bidBlocker, createSession, currentLot, isHotSeat, nextValidBid, passLot, placeBid, setRunning, sidesOf, startAuction, techNeed, tick, type UnitSpec } from './auction.ts'
import { botLimit, decideBot } from './bot.ts'
import { summarise } from './summary.ts'
import { checkSolution, countWords, stationDone } from './solution.ts'
import { RULESETS } from './rules.ts'
import type { Ruleset, RulesetId } from './types.ts'
import { getTech } from '../data/technologies.ts'
import type { Session, SideId } from './types.ts'

/** Fixed lots keep these engine tests readable: real matches draw their lots per run (see draw.ts). */
const FIXED_LOTS: Record<RulesetId, string[]> = {
  normal: ['electricity', 'battery-storage', 'robotics', 'gps', 'artificial-intelligence'],
  short: ['battery-storage', 'robotics', 'artificial-intelligence'],
}
const fixedRules = (id: RulesetId): Ruleset => ({ ...RULESETS[id], lots: FIXED_LOTS[id], lotCount: FIXED_LOTS[id].length })

const AT = '2026-10-12T00:00:00.000Z'

function ready(opts: { bot?: boolean; rules?: 'normal' | 'short' } = {}): Session {
  return createSession({
    sessionId: 'SES-T',
    gameId: 'GAME-T',
    runId: 'RUN-T',
    matchType: opts.bot ? 'ivbot' : 'ivi',
    rules: fixedRules(opts.rules ?? 'normal'),
    sides: [
      { kind: 'individual', name: 'Ada', members: ['Ada'], controller: 'human' },
      opts.bot
        ? { kind: 'bot', name: 'ChronoBot', members: [], controller: 'bot' }
        : { kind: 'individual', name: 'Grace', members: ['Grace'], controller: 'human' },
    ],
    at: AT,
  })
}

/** Auction started and its first lot's intro skipped (as an auctioneer's Start does), so bidding is open. */
function live(opts: { bot?: boolean; rules?: 'normal' | 'short' } = {}): Session {
  return setRunning(startAuction(ready(opts), AT), true)
}

const bid = (s: Session, side: SideId, amount = nextValidBid(s)) => placeBid(s, side, amount, AT)

const person = (name: string): UnitSpec => ({ kind: 'individual', name, members: [name], controller: 'human' })
const make = (sides: UnitSpec[]) => createSession({ sessionId: 'x', gameId: 'g', runId: 'r', matchType: 'multi', rules: fixedRules('normal'), at: AT, sides })
const fourSides = (): Session => setRunning(startAuction(make(['Ada', 'Grace', 'Linus', 'Ken'].map(person)), AT), true)

test('configured lot count and starting wallets', () => {
  assert.equal(live().lots.length, 5)
  assert.equal(live({ rules: 'short' }).lots.length, 3)
  const s = live()
  assert.equal(s.sides.A.wallet.balance, 1000)
  assert.equal(s.sides.B.wallet.balance, 1000)
})

test('first bid is the starting bid; later bids default to +10', () => {
  let s = live()
  assert.equal(nextValidBid(s), 120)
  s = bid(s, 'A').session
  assert.equal(currentLot(s).bid, 120)
  assert.equal(currentLot(s).leader, 'A')
  assert.equal(nextValidBid(s), 130)
  s = bid(s, 'B').session
  assert.equal(currentLot(s).leader, 'B')
  assert.equal(currentLot(s).bid, 130)
})

test('bids may jump above the minimum on the bid-increment grid', () => {
  let s = live()
  const inc = s.rules.bidIncrement
  const min = nextValidBid(s)
  let r = bid(s, 'A', min + 2 * inc)
  assert.equal(r.ok, true)
  s = r.session
  assert.equal(currentLot(s).bid, min + 2 * inc)
  assert.equal(currentLot(s).leader, 'A')
  r = bid(s, 'B', currentLot(s).bid! + inc + 5) // above the minimum but off the grid
  assert.equal(r.ok, false)
  assert.match(r.message, new RegExp(`steps of ${inc} CC`))
  r = bid(s, 'B', currentLot(s).bid!)
  assert.equal(r.ok, false, 'a bid must be higher than the current bid')
  s.sides.B.wallet.balance = 100
  r = bid(s, 'B', currentLot(s).bid! + inc)
  assert.equal(r.ok, false)
  assert.match(r.message, /Not enough ChronoCoins/)
})

test('invalid increments, self-outbids and unaffordable bids are rejected and logged', () => {
  let s = live()
  let r = bid(s, 'A', 125)
  assert.equal(r.ok, false)
  assert.equal(currentLot(r.session).bid, null)
  assert.equal(r.session.events.at(-1)!.type, 'bid_rejected')
  s = bid(s, 'A').session
  r = bid(s, 'A')
  assert.equal(r.ok, false, 'leader cannot outbid itself')
  s.sides.B.wallet.balance = 100 // below next bid of 140
  r = bid(s, 'B')
  assert.equal(r.ok, false)
  assert.match(r.message, /Not enough ChronoCoins/)
})

test('accepted bid resets the countdown; no coins move while bidding', () => {
  let s = live()
  s = tick(s, 7000, AT)
  assert.equal(currentLot(s).remainingMs, 3000)
  s = bid(s, 'A').session
  assert.equal(currentLot(s).remainingMs, 10000)
  s = bid(s, 'B').session
  assert.equal(s.sides.A.wallet.balance, 1000)
  assert.equal(s.sides.B.wallet.balance, 1000)
})

test('PASS deducts nothing and blocks further bids by that side; leader wins when opponent passes', () => {
  let s = live()
  s = bid(s, 'A').session
  s = passLot(s, 'B', AT).session
  assert.equal(s.sides.B.wallet.balance, 1000)
  assert.equal(currentLot(s).status, 'sold')
  assert.equal(bid(s, 'B').ok, false)
})

test('passed side cannot bid again while the lot is still open', () => {
  let s = live()
  s = passLot(s, 'A', AT).session
  assert.equal(currentLot(s).status, 'open')
  assert.equal(bid(s, 'A').ok, false)
})

test('timer closure: SOLD charges winner exactly once, loser nothing; late bids rejected', () => {
  let s = live()
  s = bid(s, 'A').session
  s = bid(s, 'B').session // B leads at 130
  s = tick(s, 10000, AT)
  assert.equal(currentLot(s).status, 'sold')
  assert.equal(s.sides.B.wallet.balance, 870)
  assert.equal(s.sides.A.wallet.balance, 1000, 'losing bidder not charged')
  assert.deepEqual(s.sides.B.portfolio, ['electricity'])
  // Further bids after closure change nothing; the result pause only moves the next-lot countdown.
  const again = tick(s, 5000, AT)
  assert.equal(currentLot(again).status, 'sold')
  assert.equal(again.events.length, s.events.length)
  const late = bid(s, 'A', 160)
  assert.equal(late.ok, false)
  assert.equal(currentLot(late.session).leader, 'B')
  assert.equal(late.session.sides.B.wallet.balance, 870)
  assert.equal(s.events.filter((e) => e.type === 'purchase').length, 1)
})

test('UNSOLD when nobody bids; both passing closes immediately as UNSOLD', () => {
  let s = tick(live(), 10000, AT)
  assert.equal(currentLot(s).status, 'unsold')
  s = setRunning(advance(s, AT), true)
  s = passLot(s, 'A', AT).session
  s = passLot(s, 'B', AT).session
  assert.equal(currentLot(s).status, 'unsold')
  assert.equal(s.sides.A.portfolio.length + s.sides.B.portfolio.length, 0)
})

test('paused clock does not run and rejects bids', () => {
  let s = setRunning(live(), false)
  assert.equal(tick(s, 5000, AT), s)
  assert.equal(bid(s, 'A').ok, false)
})

test('advance requires a closed lot; final lot completes the auction', () => {
  let s = live({ rules: 'short' })
  assert.equal(advance(s, AT), s, 'cannot skip an open lot')
  for (let i = 0; i < 3; i++) {
    s = bid(s, 'A').session
    s = passLot(s, 'B', AT).session
    s = setRunning(advance(s, AT), true)
  }
  assert.equal(s.status, 'complete')
  assert.equal(s.events.at(-1)!.type, 'auction_complete')
  const sum = summarise(s)
  assert.equal(sum.A.spent, 140 + 160 + 180)
  assert.equal(sum.A.final, 1000 - 480)
  assert.ok(sum.A.reconciled && sum.B.reconciled)
  assert.deepEqual(s.events.map((e) => e.seq), s.events.map((_, i) => i + 1), 'sequential event numbers')
})

test('ChronoBot waits, then bids within its limit, and passes above it', () => {
  let s = live({ bot: true })
  assert.equal(decideBot(s), 'wait', 'reacts after a delay, not instantly')
  s = tick(s, 3000, AT, decideBot)
  assert.equal(currentLot(s).leader, 'B')
  const limit = botLimit(s)
  assert.ok(limit >= 120 && limit <= s.sides.B.wallet.balance)
  // Human bids past the limit; bot must pass rather than overspend.
  while (nextValidBid(s) <= limit + 20) {
    if (currentLot(s).leader !== 'A') s = bid(s, 'A').session
    s = tick(s, 3500, AT, decideBot)
    if (currentLot(s).status !== 'open') break
  }
  assert.equal(currentLot(s).status, 'sold')
  assert.equal(currentLot(s).leader, 'A')
  assert.ok(s.events.some((e) => e.type === 'pass' && e.sideId === 'B'))
  assert.ok(s.events.filter((e) => e.type === 'bid_accepted' && e.sideId === 'B').every((e) => e.amount! <= limit))
})

test('ChronoBot never bids beyond its wallet', () => {
  let s = live({ bot: true })
  s.sides.B.wallet.balance = 100 // below the 120 starting bid
  s = tick(s, 3000, AT, decideBot)
  assert.equal(currentLot(s).leader, null)
  assert.ok(currentLot(s).passed.includes('B'))
})

test('computer opponents can never face each other', () => {
  assert.throws(() =>
    createSession({
      sessionId: 'x', gameId: 'g', runId: 'r', matchType: 'ivbot', rules: fixedRules('normal'), at: AT,
      sides: [
        { kind: 'bot', name: 'Bot 1', members: [], controller: 'bot' },
        { kind: 'bot', name: 'Bot 2', members: [], controller: 'bot' },
      ],
    }),
  )
})

test('a match seats 2 to 12 sides, with at most one computer opponent', () => {
  const bot: UnitSpec = { kind: 'bot', name: 'ChronoBot', members: [], controller: 'bot' }
  const names = 'ABCDEFGHIJKLM'.split('').map(person)
  assert.throws(() => make(names), /not 13/)
  assert.throws(() => make([person('Solo')]), /not 1/)
  assert.throws(() => make([bot, bot]), /never play another/)
  assert.throws(() => make([person('Ada'), person('Grace'), bot]), /single opponent/)
  assert.deepEqual(sidesOf(make(names.slice(0, 12))), 'ABCDEFGHIJKL'.split(''))
  assert.deepEqual(sidesOf(make([person('Ada'), bot])), ['A', 'B'])
})

test('4-side lot closes as soon as three sides pass; the leader takes it', () => {
  let s = bid(fourSides(), 'A').session
  s = passLot(s, 'B', AT).session
  s = passLot(s, 'C', AT).session
  assert.equal(currentLot(s).status, 'open')
  s = passLot(s, 'D', AT).session
  assert.equal(currentLot(s).status, 'sold')
  assert.equal(currentLot(s).leader, 'A')
  assert.deepEqual(s.sides.A.portfolio, ['electricity'])
})

test('4-side clock sale goes to the leader', () => {
  let s = bid(fourSides(), 'C').session
  s = bid(s, 'D').session
  s = tick(s, 10000, AT)
  assert.equal(currentLot(s).status, 'sold')
  assert.equal(currentLot(s).leader, 'D')
  assert.equal(s.sides.D.wallet.balance, 870)
  assert.equal(s.sides.A.wallet.balance, 1000, 'other sides not charged')
})

test('a side at its portfolio cap counts as passed, so the lot closes without waiting for the clock', () => {
  const s0 = fourSides()
  s0.sides.B.portfolio = ['x', 'y', 'z'] // cap is 3 for five lots and four sides
  let s = bid(s0, 'A').session
  s = passLot(s, 'C', AT).session
  assert.equal(currentLot(s).status, 'open', 'D has not passed yet')
  s = passLot(s, 'D', AT).session
  assert.equal(currentLot(s).status, 'sold', 'only the capped B is left besides the leader')
  assert.equal(currentLot(s).leader, 'A')
})

test('ChronoBot limit for two sides matches the original budget-share formula', () => {
  const legacy = (s: Session) => {
    const bot = s.sides.B
    const share = bot.wallet.balance / (s.lots.length - s.current)
    const weight = 0.25 + 0.75 * getTech(currentLot(s).techId).utility
    const inc = s.rules.bidIncrement
    return Math.min(bot.wallet.balance, Math.floor((share * weight) / inc) * inc)
  }
  for (const balance of [1000, 700, 260]) {
    for (let current = 0; current < 5; current++) {
      const s = live({ bot: true })
      s.sides.B.wallet.balance = balance
      const at = { ...s, current }
      assert.equal(botLimit(at), legacy(at), `balance ${balance}, lot ${current}`)
    }
  }
})

test('portfolio cap: a 4-side bidder at ceil(lots/n)+1 wins cannot bid again', () => {
  const s = fourSides()
  assert.equal(s.lots.length, 5)
  const capped = structuredClone(s)
  capped.sides.A.portfolio = ['electricity', 'battery-storage', 'robotics'] // cap is ceil(5/4)+1 = 3
  assert.match(bidBlocker(capped, 'A') ?? '', /allowed per side/)
  assert.equal(placeBid(capped, 'A', nextValidBid(capped), AT).ok, false)
  capped.sides.A.portfolio = ['electricity', 'battery-storage']
  assert.equal(bidBlocker(capped, 'A'), null)
  // Two-side matches have no cap.
  const two = live()
  two.sides.A.portfolio = ['a', 'b', 'c', 'd', 'e']
  assert.equal(bidBlocker(two, 'A'), null)
})

test('solution validation: owned, distinct, at least N techs (any number above); 1–3 characteristics; at least 40 words, no word maximum', () => {
  const owned = ['a', 'b', 'c', 'd']
  const words = (n: number) => Array.from({ length: n }, () => 'water').join(' ')
  const ok = { techIds: ['a'], characteristics: ['sustainable' as const], text: words(50) }
  assert.equal(checkSolution(ok, owned, 1).valid, true)
  assert.equal(checkSolution({ ...ok, techIds: ['a', 'b', 'c', 'd'] }, owned, 1).valid, true, 'no upper limit on technologies')
  assert.ok(checkSolution({ ...ok, techIds: [] }, owned, 1).techs)
  assert.ok(checkSolution({ ...ok, techIds: ['a'] }, owned, 2).techs, 'older runs keep their snapshot minimum')
  assert.ok(checkSolution({ ...ok, techIds: ['a', 'x'] }, owned, 1).techs)
  assert.ok(checkSolution({ ...ok, techIds: ['a', 'a'] }, owned, 1).techs)
  assert.ok(checkSolution({ ...ok, characteristics: [] }, owned, 1).characteristics)
  assert.ok(checkSolution({ ...ok, characteristics: ['sustainable', 'scalable', 'efficient', 'adaptable'] }, owned, 1).characteristics)
  assert.ok(checkSolution({ ...ok, text: words(39) }, owned, 1).words)
  assert.equal(checkSolution({ ...ok, text: words(200) }, owned, 1).valid, true, 'the 60-word suggestion never blocks')
  assert.equal(checkSolution({ ...ok, text: words(40) }, owned, 1).valid, true)
  assert.equal(checkSolution({ ...ok, text: words(60) }, owned, 1).valid, true)
  assert.equal(countWords('  one\ttwo\nthree  '), 3)
})

test('a lot shows an intro countdown, then bidding opens by itself after 10 s of ticks', () => {
  let s = startAuction(ready({ rules: 'short' }), AT)
  let lot = currentLot(s)
  assert.equal(lot.status, 'open')
  assert.equal(lot.phase, 'intro')
  assert.equal(lot.remainingMs, 10_000)
  s = tick(s, 9_000, AT)
  assert.equal(currentLot(s).phase, 'intro')
  s = tick(s, 1_000, AT)
  lot = currentLot(s)
  assert.equal(lot.phase, 'open')
  assert.equal(lot.remainingMs, 8_000, 'bidding gets its own full clock')
  assert.equal(bid(s, 'A').ok, true)
})

test('bids during the intro are rejected with the countdown', () => {
  const s = startAuction(ready({ rules: 'short' }), AT)
  const r = bid(s, 'A')
  assert.equal(r.ok, false)
  assert.equal(r.message, 'Bidding opens in 10 s.')
  assert.equal(passLot(s, 'A', AT).ok, false)
})

test('pausing freezes the intro countdown; starting skips the rest of it', () => {
  let s = setRunning(startAuction(ready({ rules: 'short' }), AT), false)
  s = tick(s, 60_000, AT)
  assert.equal(currentLot(s).phase, 'intro')
  assert.equal(currentLot(s).remainingMs, 10_000, 'no time passes while paused')
  s = setRunning(s, true)
  assert.equal(currentLot(s).phase, 'open', 'Start skips the intro')
  assert.equal(currentLot(s).remainingMs, 8_000)
})

test('a decided lot shows its result for 6 s, then the next lot opens by itself', () => {
  let s = setRunning(live({ rules: 'short' }), true)
  s = passLot(s, 'B', AT).session
  s = bid(s, 'A').session
  s = passLot(s, 'B', AT).session
  assert.equal(currentLot(s).status, 'sold')
  assert.equal(currentLot(s).phase, 'decided')
  s = tick(s, 5_999, AT)
  assert.equal(s.current, 0, 'still on the result')
  s = tick(s, 1, AT)
  assert.equal(s.current, 1)
  assert.equal(currentLot(s).phase, 'intro')
  assert.equal(currentLot(s).remainingMs, 10_000)
})

test('pausing freezes the result pause; admin Next skips what is left of it', () => {
  let s = setRunning(live({ rules: 'short' }), true)
  s = bid(s, 'A').session
  s = passLot(s, 'B', AT).session
  s = setRunning(s, false)
  s = tick(s, 60_000, AT)
  assert.equal(s.current, 0)
  assert.equal(currentLot(s).remainingMs, 6_000)
  s = advance(s, AT)
  assert.equal(s.current, 1)
  assert.equal(currentLot(s).phase, 'intro', 'Next opens the next lot at its intro, not at bidding')
  assert.equal(currentLot(s).running, true)
})

test('the last lot completes the auction after its result pause, without a button', () => {
  let s = setRunning(live({ rules: 'short' }), true)
  for (let i = 0; i < 3; i++) {
    s = setRunning(s, true)
    s = passLot(s, 'A', AT).session
    s = passLot(s, 'B', AT).session
    if (i < 2) s = tick(s, 6_000, AT)
  }
  assert.equal(currentLot(s).status, 'unsold')
  assert.equal(s.status, 'live')
  s = tick(s, 6_000, AT)
  assert.equal(s.status, 'complete')
  assert.equal(currentLot(s).running, false)
})

test('ChronoBot does not bid during the intro', () => {
  let s = startAuction(ready({ bot: true, rules: 'short' }), AT)
  assert.equal(decideBot(s), 'wait')
  s = tick(s, 10_000, AT)
  assert.equal(currentLot(s).phase, 'open')
})

test('isHotSeat: two human sides on one device, never when this station holds a side', () => {
  assert.equal(isHotSeat(ready()), true)
  assert.equal(isHotSeat(ready(), null), true)
  assert.equal(isHotSeat(ready(), 'B'), false)
  assert.equal(isHotSeat(ready({ bot: true })), false)
})

test('techNeed: counts the lots still to come and flags a side that can no longer reach the solution count', () => {
  let s = live()
  assert.deepEqual(techNeed(s, 'B'), { need: 1, have: 0, left: 5, short: true, reachable: true })
  // A wins every lot outright; B passes each time, so B ends with nothing and no lots left.
  for (let i = 0; i < 3; i++) {
    s = bid(s, 'A').session
    s = passLot(s, 'B', AT).session
    s = setRunning(advance(s, AT), true)
  }
  assert.deepEqual(techNeed(s, 'A'), { need: 1, have: 3, left: 2, short: false, reachable: true })
  assert.deepEqual(techNeed(s, 'B'), { need: 1, have: 0, left: 2, short: true, reachable: true })
  for (let i = 0; i < 2; i++) {
    s = bid(s, 'A').session
    s = passLot(s, 'B', AT).session
    if (i === 0) s = setRunning(advance(s, AT), true)
  }
  assert.deepEqual(techNeed(s, 'B'), { need: 1, have: 0, left: 0, short: true, reachable: false })
})

test('stationDone: only once the auction is complete and each played side submitted, timed out or cannot submit', () => {
  let s = live()
  for (let i = 0; i < 5; i++) {
    s = bid(s, 'A').session
    s = passLot(s, 'B', AT).session
    if (i < 4) s = setRunning(advance(s, AT), true)
  }
  s = advance(s, AT)
  const run = (sol: object, session = s) => ({ session, solutions: sol }) as unknown as Parameters<typeof stationDone>[0]
  const sub = { startedAt: AT, deadline: null, draft: { techIds: [], characteristics: [], text: '' }, submission: { status: 'locked' } }
  assert.equal(stationDone(run({}, live()), ['A'], 0), false, 'auction not finished')
  assert.equal(s.status, 'complete')
  assert.equal(stationDone(run({}), ['A'], 0), false, 'A won lots and has not submitted')
  assert.equal(stationDone(run({ A: sub }), ['A'], 0), true)
  assert.equal(stationDone(run({}), ['B'], 0), true, 'B won nothing, so has nothing to submit')
  assert.equal(stationDone(run({ A: { ...sub, submission: null, deadline: 1000 } }), ['A'], 2000), true, 'time ran out')
  assert.equal(stationDone(run({ A: { ...sub, submission: null, deadline: 1000 } }), ['A'], 500), false)
})
