import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lotCount, lotsForRun, matchRuleset, offThemeIn, RELEVANT_DELTA, shortLotCount, wildcardForRun, wildcardRange } from './draw.ts'
import { walletFor } from './rules.ts'
import { openingBid } from './auction.ts'
import { makeId } from './ids.ts'
import { getTech, TECHNOLOGIES } from '../data/technologies.ts'
import { TWISTS, twistForRun, valuesFor } from '../data/scenario.ts'

const runIds = (n: number) => Array.from({ length: n }, () => makeId('RUN'))

test('lot counts follow the formula and its clamps', () => {
  assert.equal(lotCount(2), 5)
  assert.equal(lotCount(6), 11)
  assert.equal(lotCount(12), 20)
  assert.equal(lotCount(1), 5)
  assert.equal(shortLotCount(2), 3)
  assert.equal(shortLotCount(12), 14)
  assert.equal(shortLotCount(1), 3)
})

test('lotsForRun returns the right length with no duplicates, all known technologies', () => {
  for (const [n, len] of [[2, 5], [6, 11], [12, 20]] as const) {
    for (const id of runIds(50)) {
      const lots = lotsForRun(id, n)
      assert.equal(lots.length, len, `n=${n}`)
      assert.equal(new Set(lots).size, len, 'duplicates')
      for (const t of lots) assert.ok(TECHNOLOGIES.some((x) => x.id === t), `unknown ${t}`)
    }
  }
  assert.equal(lotsForRun('RUN-S', 2, true).length, 3)
  assert.equal(lotsForRun('RUN-S', 12, true).length, 14)
})

test('lotsForRun is deterministic for the same run and side count', () => {
  assert.deepEqual(lotsForRun('RUN-ABCDEF12', 4), lotsForRun('RUN-ABCDEF12', 4))
  assert.notDeepEqual(lotsForRun('RUN-ABCDEF12', 4), lotsForRun('RUN-ABCDEF13', 4))
})

/** Relevant technologies for the run's twist (|delta| ≥ RELEVANT_DELTA), computed independently of draw.ts. */
const relevantFor = (id: string) => {
  const values = valuesFor(TWISTS[twistForRun(id)]!)
  return TECHNOLOGIES.filter((t) => Math.abs(values[t.id]!.delta) >= RELEVANT_DELTA).map((t) => t.id)
}

test('the twist comes first: at least lotCount minus wildcards lots are relevant to the run’s twist', () => {
  for (const n of [2, 6, 12]) {
    for (const id of runIds(300)) {
      const lots = lotsForRun(id, n)
      const relevant = lots.filter((l) => relevantFor(id).includes(l))
      const wildcards = offThemeIn(id, lots).length
      assert.ok(relevant.length >= lots.length - wildcards, `${id} n=${n}: ${relevant.length} relevant of ${lots.length}`)
      assert.equal(relevant.length + wildcards, lots.length, 'every lot is either on the twist or a wildcard')
    }
  }
})

test('wildcard counts follow the ranges: 1 up to 6 lots, 1–2 up to 12, 2–3 above (fewer only if the twist has no room)', () => {
  assert.deepEqual([wildcardRange(5), wildcardRange(11), wildcardRange(20)], [[1, 1], [1, 2], [2, 3]])
  for (const n of [2, 6, 12]) {
    const count = lotCount(n)
    const [lo, hi] = wildcardRange(count)
    for (const id of runIds(300)) {
      const wildcards = offThemeIn(id, lotsForRun(id, n)).length
      // Wildcards only exceed the range when the twist has fewer relevant technologies than the lots need.
      if (relevantFor(id).length >= count - hi) assert.ok(wildcards >= lo && wildcards <= hi, `${id} n=${n}: ${wildcards} wildcards`)
      else assert.ok(wildcards >= count - relevantFor(id).length, `${id} n=${n}: fills with off-theme`)
    }
  }
})

test('a run draws a range of wildcard counts, not a fixed one', () => {
  const seen = new Set(runIds(200).map((id) => offThemeIn(id, lotsForRun(id, 12)).length))
  assert.ok(seen.size >= 2, `only ${[...seen]} wildcards at 12 sides`)
})

test('the energy and life guarantee holds for most runs; a run where a same-kind swap is impossible drops it', () => {
  for (const n of [2, 6, 12]) {
    let missing = 0
    for (const id of runIds(500)) {
      const tags = lotsForRun(id, n).flatMap((l) => getTech(l).tags)
      if (!tags.includes('energy') || !tags.includes('life')) missing++
    }
    assert.ok(missing / 500 < 0.1, `n=${n}: ${missing} of 500 runs miss energy or life`)
  }
})

test('the lot draw is free of duplicates and only uses known technologies, for every twist', () => {
  for (const id of runIds(400)) {
    const lots = lotsForRun(id, 12)
    assert.equal(new Set(lots).size, lots.length)
    assert.ok(lots.every((l) => TECHNOLOGIES.some((t) => t.id === l)))
  }
})

test('the 2-side lot draw can include any technology (not a fixed list)', () => {
  const seen = new Set<string>()
  for (const id of runIds(2000)) for (const l of lotsForRun(id, 2)) seen.add(l)
  assert.ok(seen.size > 40, `only ${seen.size} technologies seen`)
})

test('wildcard lot appears in roughly 20% of runs and is one of the drawn lots', () => {
  let hits = 0
  for (const id of runIds(2000)) {
    const lots = lotsForRun(id, 4)
    const w = wildcardForRun(id, lots)
    if (w !== undefined) {
      hits++
      assert.ok(lots.includes(w))
    }
  }
  assert.ok(hits > 300 && hits < 500, `wildcard in ${hits} of 2000 runs`)
})

test('matchRuleset stores the draw, the count, the clock and the wildcard in the ruleset copy', () => {
  const two = matchRuleset('normal', 'RUN-M1', 2)
  assert.equal(two.lots.length, 5)
  assert.equal(two.lotCount, 5)
  assert.equal(two.bidSeconds, 10)
  const big = matchRuleset('normal', 'RUN-M1', 7)
  assert.equal(big.lotCount, lotCount(7))
  assert.equal(big.bidSeconds, 8, '8 s clock from seven sides')
  assert.equal(matchRuleset('short', 'RUN-M1', 2).lots.length, 3)
  // Same run, same draw
  assert.deepEqual(matchRuleset('normal', 'RUN-M1', 2), matchRuleset('normal', 'RUN-M1', 2))
  // Reference table is untouched
  assert.deepEqual(matchRuleset('normal', 'RUN-M1', 2).lots, lotsForRun('RUN-M1', 2))
  // Lot phases: intro and result pause defaults, and the off-theme (Wildcard) picks.
  assert.equal(two.introSeconds, 10)
  assert.equal(two.nextLotSeconds, 6)
  assert.deepEqual(two.offThemeTechIds, offThemeIn('RUN-M1', two.lots))
  assert.equal(matchRuleset('short', 'RUN-M1', 2).nextLotSeconds, 6)
})

test('wildcard opening bid is half the starting bid, rounded to 10', () => {
  const rules = matchRuleset('normal', 'RUN-M1', 2)
  const w = { ...rules, wildcardTechId: 'electricity' }
  assert.equal(openingBid(w, 'electricity'), 60)
  assert.equal(openingBid(w, 'battery-storage'), getTech('battery-storage').startingBid)
  assert.equal(openingBid({ ...rules, wildcardTechId: 'battery-storage' }, 'battery-storage'), 70)
})

test('wildcardForRun is undefined for an empty lot list', () => {
  assert.equal(wildcardForRun('RUN-X', []), undefined)
})

test('starting wallet is 200 CC per lot with a 1,000 floor', () => {
  assert.deepEqual([3, 5, 8, 11, 20].map(walletFor), [1000, 1000, 1600, 2200, 4000])
  for (const sides of [2, 6, 12]) {
    const r = matchRuleset('normal', makeId('RUN'), sides)
    assert.equal(r.startingWallet, walletFor(r.lots.length))
  }
  const r6 = matchRuleset('normal', makeId('RUN'), 6)
  assert.equal(r6.startingWallet, 200 * r6.lots.length)
  assert.equal(matchRuleset('short', makeId('RUN'), 2).startingWallet, 1000)
})
