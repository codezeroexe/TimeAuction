import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stages } from './lobbyStages.ts'
import { emptyEvent } from '../game/event.ts'

test('Match setup reads Waiting while a remote player is not yet paired', () => {
  const ev = emptyEvent('2026-10-15T00:00:00.000Z')
  assert.equal(stages(null, ev, false, true).find((s) => s.name === 'Match setup')?.state, 'waiting')
  assert.equal(stages(null, ev, false, false).find((s) => s.name === 'Match setup')?.state, 'current')
})
