import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TWISTS, twistStrength, valuesForRun } from '../data/scenario.ts'
import { emptyEntries, finalScore, roundPoints, scoreTotal, toolPoints, toolTotal } from './scoring.ts'
import { eligibleRows, rankRows } from './leaderboard.ts'

test('roundPoints rounds half away from zero', () => {
  assert.equal(roundPoints(-25), -3)
  assert.equal(roundPoints(25), 3)
  assert.equal(roundPoints(-24), -2)
  assert.equal(roundPoints(24), 2)
  assert.equal(roundPoints(-5), -1)
  assert.equal(roundPoints(4), 0)
  assert.equal(Object.is(roundPoints(-4), 0), true, 'no negative zero')
})

const twist = Object.values(TWISTS)[0]
const runId = 'RUN-TOOLS'
const vals = valuesForRun(twist, runId)
const ids = Object.keys(vals).slice(0, 4)
const sub = { twistId: twist.id, runId, selectedTechIds: [...ids, 'no-such-tech'] }

test('toolPoints per technology and total follow the twist values', () => {
  const tp = toolPoints(sub)
  assert.deepEqual(tp.map((t) => t.techId), sub.selectedTechIds)
  for (const t of tp) {
    const d = vals[t.techId]?.delta ?? 0
    assert.equal(t.delta, d)
    assert.equal(t.points, roundPoints(d))
    assert.ok(t.points >= -5 && t.points <= 5)
  }
  assert.equal(tp[tp.length - 1].points, 0, 'unknown technology scores 0')
  assert.equal(toolTotal(sub), tp.reduce((s, t) => s + t.points, 0))
  assert.equal(toolTotal({ ...sub, twistId: '' }), 0, 'sealed or unknown twist: no points')
})

test('toolPoints hand-checked: water-crisis at normal strength', () => {
  const r = Array.from({ length: 200 }, (_, i) => `R${i}`).find((x) => twistStrength(x) === 'normal')!
  const tp = toolPoints({ twistId: 'water-crisis', runId: r, selectedTechIds: ['electricity', 'robotics', 'gps', 'battery-storage'] })
  assert.deepEqual(tp.map((t) => [t.delta, t.points]), [[20, 2], [20, 2], [10, 1], [0, 0]])
  assert.equal(toolTotal({ twistId: 'water-crisis', runId: r, selectedTechIds: ['electricity', 'robotics', 'gps', 'battery-storage'] }), 5)
})

test('finalScore = rubric + tool points', () => {
  const e = emptyEntries()
  e.relevance.score = 20
  e.explanation.score = 7
  assert.equal(finalScore(e, sub), scoreTotal(e) + toolTotal(sub))
  assert.equal(scoreTotal(e), 27)
})
