import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyEvent } from '../../game/event.ts'
import type { EventState } from '../../game/types.ts'
import { tickerItems } from './ticker.ts'

test('empty event has no ticker items', () => {
  assert.deepEqual(tickerItems(emptyEvent('2026-01-01T00:00:00Z'), [], true), [])
})

test('latest sale appears in the ticker', () => {
  const ev = emptyEvent('2026-01-01T00:00:00Z')
  const sold = (at: string, techId: string, amount: number) => ({ seq: 1, sessionId: 's', at, type: 'sold', techId, sideId: 'A', amount, note: '' })
  const session = { status: 'live', sides: { A: { name: 'Cipher Union' } }, events: [sold('2026-01-01T01:00:00Z', 'electricity', 150), sold('2026-01-01T02:00:00Z', 'robotics', 210)] }
  const withRun = { ...ev, participants: [{ gameId: 'g', player: {}, pastRuns: [], run: { session, solutions: {} } }] } as unknown as EventState
  const items = tickerItems(withRun, [], true)
  assert.ok(items.includes('Latest sale · Robotics · 210 CC · Cipher Union'))
  assert.ok(items.includes('1 auction live'))
})

test('remote mode shows only the server top score', () => {
  const ev = emptyEvent('2026-01-01T00:00:00Z')
  assert.deepEqual(tickerItems(ev, [], false), [])
  assert.equal(tickerItems(ev, [{ total: 40 }, { total: 55 }], false).length, 1)
})
