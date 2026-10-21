import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ORDER, TR } from './motion.ts'

const ROUTES = ['landing', 'register', 'lobby', 'match', 'auction', 'summary', 'log', 'twist', 'mission', 'solution', 'results', 'leaderboard', 'feedback', 'replay', 'rules', 'admin', 'score', 'present', 'idle']

test('every route maps to a known transition', () => {
  assert.deepEqual(Object.keys(TR).sort(), [...ROUTES].sort())
  for (const k of Object.values(TR)) assert.ok(k in ORDER, k)
})

test('every ORDER function stays within [0,1] over a grid', () => {
  const C = 10
  const R = 10
  const n = Array.from({ length: C + R + 100 }, Math.random)
  for (const [kind, f] of Object.entries(ORDER))
    for (let r = 0; r < R; r++)
      for (let i = 0; i < C; i++) {
        const v = f(i, r, C, R, n, { i: 3, r: 4 })
        assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${kind} ${i},${r} -> ${v}`)
      }
})
