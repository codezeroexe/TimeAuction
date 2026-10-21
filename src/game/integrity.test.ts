import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, createSession, nextValidBid, passLot, placeBid, setRunning, sidesOf, startAuction } from './auction.ts'
import { checkSession } from './integrity.ts'
import { matchRuleset } from './draw.ts'

const AT = '2026-10-12T00:00:00.000Z'

test('a finished 4-side session has no integrity errors', () => {
  const person = (name: string) => ({ kind: 'individual' as const, name, members: [name], controller: 'human' as const })
  let s = setRunning(startAuction(createSession({
    sessionId: 'SES-4', gameId: 'GAME-4', runId: 'RUN-4', matchType: 'multi', rules: matchRuleset('normal', 'RUN-4', 4), at: AT,
    sides: ['Ada', 'Grace', 'Linus', 'Ken'].map(person),
  }), AT), true)
  assert.equal(s.rules.solutionTechCount, 1, 'every match needs at least one technology')
  const sides = sidesOf(s)
  for (let i = 0; i < s.lots.length; i++) {
    const winner = sides[i % sides.length]
    s = placeBid(s, winner, nextValidBid(s), AT).session
    for (const other of sides) if (other !== winner) s = passLot(s, other, AT).session
    s = setRunning(advance(s, AT), true)
  }
  assert.equal(s.status, 'complete')
  assert.deepEqual(checkSession(s).filter((i) => i.severity === 'error'), [])
})
