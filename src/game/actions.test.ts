import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyAction, type Action, type ActionContext } from './actions.ts'
import { activeView, emptyEvent, setActive, withView } from './event.ts'
import { advance, nextValidBid, passLot, placeBid, setRunning, startAuction } from './auction.ts'
import { twistForRun } from '../data/scenario.ts'
import type { EventState, Run } from './types.ts'

const AT = '2026-10-12T10:00:00.000Z'
const ctx = (gameId: string | null = null) => ({ at: AT, nowMs: Date.parse(AT), gameId })

test('createMatch draws the run twist from its runId', () => {
  let ev = emptyEvent(AT)
  const reg: Action = { type: 'register', input: { name: 'Ada', mode: 'individual', teamName: '', teammates: [] } }
  const r0 = applyAction(ev, reg, ctx())
  assert.ok(r0.ok && r0.gameId)
  ev = r0.ev
  const create: Action = {
    type: 'createMatch',
    config: { matchType: 'ivi', rulesetId: 'normal', timed: false, opponents: [{ kind: 'individual', name: 'Rival', members: ['Rival'], controller: 'human' }] },
  }
  const r1 = applyAction(ev, create, ctx(r0.gameId))
  assert.ok(r1.ok, r1.message)
  const run = r1.ev.participants.find((p) => p.gameId === r0.gameId)!.run!
  assert.equal(run.twistId, twistForRun(run.runId))
})

const rival = { kind: 'individual' as const, name: 'Rival', members: ['Rival'], controller: 'human' as const }
const reg: Action = { type: 'register', input: { name: 'Ada', mode: 'individual', teamName: '', teammates: [] } }

/** A two-human match whose auction has finished, its run sitting at the summary (`held` = server-paired, twist gated). */
function summaryMatch(held: boolean): { ev: EventState; gameId: string } {
  const r0 = applyAction(emptyEvent(AT), reg, ctx())
  const gameId = r0.gameId!
  const r1 = applyAction(r0.ev, { type: 'createMatch', config: { matchType: 'ivi', rulesetId: 'normal', timed: false, opponents: [rival], holdTwist: held } }, ctx(gameId))
  const run = activeView(setActive(r1.ev, gameId)).run!
  let s = startAuction(run.session!, AT)
  s = setRunning(s, true)
  while (s.status !== 'complete') {
    s = placeBid(s, 'A', nextValidBid(s), AT).session
    s = passLot(s, 'B', AT).session
    s = setRunning(advance(s, AT), true)
  }
  return { ev: withView(r1.ev, { ...activeView(setActive(r1.ev, gameId)), run: { ...run, phase: 'summary', session: s } as Run }), gameId }
}

const step = (ev: EventState, action: Action, gameId: string, at = AT) => applyAction(ev, action, { at, nowMs: Date.parse(at), gameId } as ActionContext)

test('held twist: a server-paired match waits at the summary until the host reveals it; a reveal is idempotent', () => {
  const { ev, gameId } = summaryMatch(true)
  const run = () => activeView(setActive(ev, gameId)).run!
  assert.equal(run().twistHeld, true)
  const blocked = step(ev, { type: 'continueToMission' }, gameId)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.message, 'Watch the main screen: the host reveals the Timeline Twist for everyone.')
  const revealed = step(ev, { type: 'revealTwist' }, gameId, '2026-10-12T10:05:00.000Z')
  assert.equal(revealed.ok, true)
  const after = activeView(setActive(revealed.ev, gameId)).run!
  assert.equal(after.phase, 'twist')
  assert.equal(after.twistRevealedAt, '2026-10-12T10:05:00.000Z')
  const again = step(revealed.ev, { type: 'revealTwist' }, gameId, '2026-10-12T10:06:00.000Z')
  assert.equal(again.ok, true)
  assert.equal(activeView(setActive(again.ev, gameId)).run!.twistRevealedAt, '2026-10-12T10:05:00.000Z')
  assert.equal(step(again.ev, { type: 'acknowledgeTwist' }, gameId).ok, true)
})

test('revealTwist needs a finished auction; an unheld match continues to the twist as before', () => {
  const { ev, gameId } = summaryMatch(false)
  assert.equal(activeView(setActive(ev, gameId)).run!.twistHeld, undefined)
  const onward = step(ev, { type: 'continueToMission' }, gameId)
  assert.equal(onward.ok, true)
  assert.equal(step(onward.ev, { type: 'revealTwist' }, gameId).ok, false, 'not at the summary any more')
  const live = applyAction(emptyEvent(AT), reg, ctx())
  const created = applyAction(live.ev, { type: 'createMatch', config: { matchType: 'ivi', rulesetId: 'normal', timed: false, opponents: [rival], holdTwist: true } }, ctx(live.gameId))
  assert.equal(step(created.ev, { type: 'revealTwist' }, live.gameId!).ok, false, 'an unfinished auction cannot be revealed')
})

test('register rejects a name or team name already taken, ignoring case and spacing', () => {
  const individual = (name: string): Action => ({ type: 'register', input: { name, mode: 'individual', teamName: '', teammates: [] } })
  const team = (teamName: string): Action => ({ type: 'register', input: { name: 'Lead', mode: 'team', teamName, teammates: [] } })
  const first = applyAction(emptyEvent(AT), individual('Ada'), ctx())
  assert.ok(first.ok)
  const again = applyAction(first.ev, individual('  ada '), ctx())
  assert.equal(again.ok, false)
  assert.match(again.message, /already registered/)
  assert.equal(applyAction(first.ev, team('ADA'), ctx()).ok, false)
  assert.equal(applyAction(first.ev, individual('Ada Lovelace'), ctx()).ok, true)
})

test('createMatch rejects a ChronoBot opponent', () => {
  const r0 = applyAction(emptyEvent(AT), reg, ctx())
  const bot = { kind: 'bot' as const, name: 'ChronoBot', members: [], controller: 'bot' as const }
  const r1 = applyAction(r0.ev, { type: 'createMatch', config: { matchType: 'ivbot', rulesetId: 'normal', timed: false, opponents: [bot] } }, ctx(r0.gameId))
  assert.equal(r1.ok, false)
  assert.match(r1.message, /ChronoBot matches are no longer offered/)
  assert.equal(r1.ev.participants[0]!.run, null)
})
