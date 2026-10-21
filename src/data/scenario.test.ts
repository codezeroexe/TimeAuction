import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyStrength, netShift, twistForRun, twistStrength, TWISTS, TWIST_IDS, valuesFor, valuesForRun, type Twist, type TwistStrength } from './scenario.ts'
import { TECHNOLOGIES } from './technologies.ts'
import { TAGS } from '../game/types.ts'
import { makeId } from '../game/ids.ts'

const STRENGTHS: TwistStrength[] = ['mild', 'normal', 'severe']
const ORIGINAL = ['water-crisis', 'solar-superstorm', 'metal-shortage', 'crew-shortage', 'earth-silence']

test('50 technologies with unique ids, each tagged with at least one valid tag', () => {
  assert.equal(TECHNOLOGIES.length, 50)
  assert.equal(new Set(TECHNOLOGIES.map((t) => t.id)).size, 50)
  for (const t of TECHNOLOGIES) {
    assert.ok(t.tags.length >= 1, `${t.id} has no tags`)
    for (const tag of t.tags) assert.ok(TAGS.includes(tag), `${t.id} unknown tag ${tag}`)
    assert.ok(t.startingBid >= 80 && t.startingBid <= 200 && t.startingBid % 10 === 0, `${t.id} starting bid ${t.startingBid}`)
    assert.ok(t.utility >= 0.4 && t.utility <= 0.9, `${t.id} utility ${t.utility}`)
  }
})

test('every twist has three constraints, three mission impacts and a value for every technology under every strength', () => {
  for (const t of Object.values(TWISTS)) {
    assert.equal(t.constraints.length, 3, `${t.id} constraints`)
    assert.equal(t.missionImpact.length, 3, `${t.id} missionImpact`)
    const values = valuesFor(t)
    for (const strength of STRENGTHS) {
      const scaled = applyStrength(values, strength)
      for (const tech of TECHNOLOGIES) {
        const v = scaled[tech.id]
        assert.ok(v, `${t.id} missing value for ${tech.id}`)
        assert.ok(Number.isInteger(v.delta) && v.delta >= -50 && v.delta <= 50, `${t.id} ${tech.id} ${strength} delta ${v.delta}`)
        assert.ok(v.reason.trim().length > 0, `${t.id} ${tech.id} reason`)
      }
    }
  }
})

test('every twist has the fields the screens need', () => {
  for (const t of Object.values(TWISTS)) {
    for (const key of ['title', 'short', 'headline', 'world', 'judgeGuide', 'caption'] as const) {
      assert.ok(t[key].trim().length > 0, `${t.id} ${key}`)
    }
    assert.ok(t.metric.label.length > 0, `${t.id} metric`)
    const count = Object.keys(t.tagDeltas).length
    assert.ok(count >= 4 && count <= 6, `${t.id} has ${count} tag deltas`)
    // The five original twists carry their exact values as overrides; new twists keep to at most three.
    if (!ORIGINAL.includes(t.id)) assert.ok(Object.keys(t.overrides ?? {}).length <= 3, `${t.id} overrides`)
  }
})

test('30 twists; the five original twists keep their five exact values as overrides', () => {
  assert.equal(TWIST_IDS.length, 30)
  assert.deepEqual(TWIST_IDS, Object.keys(TWISTS))
  assert.ok(TWISTS['water-crisis'])
  assert.equal(TWISTS['gps-blackout'], undefined)
  for (const id of ORIGINAL) {
    assert.deepEqual(Object.keys(TWISTS[id]!.overrides ?? {}).sort(), ['artificial-intelligence', 'battery-storage', 'electricity', 'gps', 'robotics'])
  }
})

test('twistForRun is stable for the same runId and always returns a known twist', () => {
  const id = 'RUN-ABCDEF12'
  assert.equal(twistForRun(id), twistForRun(id))
  assert.ok(TWIST_IDS.includes(twistForRun(id)))
})

test('over 2000 generated run ids, all thirty twists appear', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 2000; i++) seen.add(twistForRun(makeId('RUN')))
  assert.equal(seen.size, 30)
})

test('twist strength is drawn about 25% mild, 50% normal, 25% severe', () => {
  const count = { mild: 0, normal: 0, severe: 0 }
  for (let i = 0; i < 2000; i++) count[twistStrength(makeId('RUN'))]++
  assert.ok(count.mild > 400 && count.mild < 600, `mild ${count.mild}`)
  assert.ok(count.normal > 900 && count.normal < 1100, `normal ${count.normal}`)
  assert.ok(count.severe > 400 && count.severe < 600, `severe ${count.severe}`)
})

test('applyStrength scales, rounds and clamps to −50..50', () => {
  const v = { a: { delta: 50, reason: 'r' }, b: { delta: -40, reason: 'r' }, c: { delta: 0, reason: 'r' } }
  assert.deepEqual(applyStrength(v, 'severe'), { a: { delta: 50, reason: 'r' }, b: { delta: -50, reason: 'r' }, c: { delta: 0, reason: 'r' } })
  assert.equal(applyStrength({ x: { delta: 10, reason: 'r' } }, 'mild').x!.delta, 6)
  assert.equal(applyStrength({ x: { delta: -10, reason: 'r' } }, 'severe').x!.delta, -13)
  assert.equal(Object.is(applyStrength({ x: { delta: 0, reason: 'r' } }, 'mild').x!.delta, -0), false)
})

test('valuesForRun is the strength-scaled table for the run', () => {
  const t = TWISTS['water-crisis'] as Twist
  const id = 'RUN-STRENGTH'
  assert.deepEqual(valuesForRun(t, id), applyStrength(valuesFor(t), twistStrength(id)))
})

test('technologies with no matching tag are "Not affected"; tag deltas average across matching tags', () => {
  const t: Twist = {
    ...(TWISTS['water-crisis'] as Twist),
    overrides: undefined,
    tagDeltas: { energy: { delta: 10, reason: 'power' }, life: { delta: 31, reason: 'life' } },
  }
  const values = valuesFor(t)
  // electrolysis is life + energy: mean of 10 and 31 is 20.5, rounded to 21
  assert.equal(values.electrolysis!.delta, 21)
  assert.equal(values.electrolysis!.reason, 'life power')
  assert.deepEqual(values.laser, { delta: 0, reason: 'Not affected by this twist.' })
})

test('netShift is the rounded mean delta of owned technologies, 0 when none are owned', () => {
  const t = TWISTS['water-crisis'] as Twist
  assert.equal(netShift(t, []), 0)
  // electricity +20, battery-storage 0, robotics +20 -> mean 13.33 -> 13
  assert.equal(netShift(t, ['electricity', 'battery-storage', 'robotics']), 13)
  const s = TWISTS['solar-superstorm'] as Twist
  // gps -50, robotics +10 -> mean -20
  assert.equal(netShift(s, ['gps', 'robotics']), -20)
  assert.equal(netShift(s, ['not-a-tech']), 0)
  // severe: gps −65 clamps to −50, robotics +13; mean −18.5 rounds to −18
  assert.equal(netShift(s, ['gps', 'robotics'], 'severe'), -18)
})
