import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_DISPLAY, displayOf, emptyEvent } from '../game/event.ts'
import { loadEvent } from './storage.ts'
import { RULESETS } from '../game/rules.ts'

const AT = '2026-10-15T09:00:00.000Z'
const load = (raw: string) => loadEvent(() => raw, AT)

test('a v3 save loads as v6 with the same contents and the default show', () => {
  const v3 = { ...emptyEvent(AT), version: 3 }
  const r = load(JSON.stringify(v3))
  assert.equal(r.kind, 'ok')
  assert.equal(r.kind === 'ok' && r.state.version, 6)
  assert.equal(r.kind === 'ok' && r.migratedFrom, 3)
  assert.equal(r.kind === 'ok' && r.state.eventId, v3.eventId)
  assert.deepEqual(r.kind === 'ok' && r.state.show, { stage: 'welcome', focus: null })
})

test('a v6 save with the rules or join stage loads unchanged; an unknown stage falls back to the default show', () => {
  for (const stage of ['rules', 'join']) {
    const r = load(JSON.stringify({ ...emptyEvent(AT), show: { stage, focus: null } }))
    assert.equal(r.kind === 'ok' && r.state.show.stage, stage)
  }
  const bad = load(JSON.stringify({ ...emptyEvent(AT), show: { stage: 'nope', focus: null } }))
  assert.deepEqual(bad.kind === 'ok' && bad.state.show, { stage: 'welcome', focus: null })
})

test('a v5 save loads as v6 with the default show; a v6 save loads unchanged; unknown versions and bad JSON are corrupt', () => {
  const v5 = { ...emptyEvent(AT), version: 5 } as Record<string, unknown>
  delete v5.show
  const r5 = load(JSON.stringify(v5))
  assert.equal(r5.kind === 'ok' && r5.state.version, 6)
  assert.equal(r5.kind === 'ok' && r5.migratedFrom, 5)
  assert.equal(r5.kind === 'ok' && r5.state.show.stage, 'welcome')
  const shown = { ...emptyEvent(AT), show: { stage: 'auction', focus: null } }
  const r = load(JSON.stringify(shown))
  assert.equal(r.kind === 'ok' && r.state.version, 6)
  assert.equal(r.kind === 'ok' && r.migratedFrom, undefined)
  assert.equal(r.kind === 'ok' && r.state.show.stage, 'auction')
  assert.equal(load(JSON.stringify({ ...emptyEvent(AT), version: 7 })).kind, 'corrupt')
  assert.equal(load('{not json').kind, 'corrupt')
})

test('a v4 save with a match in progress gets lot phases and the intro/result timings', () => {
  const ev = emptyEvent(AT)
  const rules = { ...RULESETS.normal, lots: ['electricity', 'gps'], lotCount: 2 } as Record<string, unknown>
  delete rules.introSeconds
  delete rules.nextLotSeconds
  const lot = (status: string) => ({ techId: 'electricity', status, bid: null, leader: null, passed: [], bidCount: 0, remainingMs: 10000, running: false, quietMs: 0 })
  const session = { sessionId: 'SES-1', gameId: 'G', runId: 'RUN-1', matchType: 'ivi', rules, status: 'live', sides: {}, lots: [lot('sold'), lot('open')], current: 1, events: [], createdAt: AT }
  const participant = { gameId: 'G', player: { id: 'P', name: 'Ada', mode: 'individual', team: null, coins: 1000, registeredAt: AT }, run: { runId: 'RUN-1', session, solutions: {}, phase: 'auction' }, pastRuns: [] }
  const r = load(JSON.stringify({ ...ev, version: 4, participants: [participant] }))
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  const s = r.state.participants[0]!.run!.session!
  assert.deepEqual(s.lots.map((l) => l.phase), ['decided', 'open'])
  assert.equal(s.rules.introSeconds, 10)
  assert.equal(s.rules.nextLotSeconds, 6)
})

test('projector fit: older saves get the default; a saved fit round-trips; junk is dropped; out-of-range is clamped', () => {
  const v3 = load(JSON.stringify({ ...emptyEvent(AT), version: 3 }))
  assert.ok(v3.kind === 'ok')
  assert.deepEqual(displayOf(v3.state.show), DEFAULT_DISPLAY)
  assert.deepEqual(v3.state.show, { stage: 'welcome', focus: null })
  const v5: Record<string, unknown> = { ...emptyEvent(AT), version: 5 }
  delete v5.show
  const r5 = load(JSON.stringify(v5))
  assert.ok(r5.kind === 'ok')
  assert.deepEqual(displayOf(r5.state.show), DEFAULT_DISPLAY)
  const fit = { scale: 80, top: 3, right: 2, bottom: 4, left: 1, guides: true }
  const ok = load(JSON.stringify({ ...emptyEvent(AT), show: { stage: 'auction', focus: null, display: fit } }))
  assert.ok(ok.kind === 'ok')
  assert.deepEqual(ok.state.show.display, fit)
  const junk = load(JSON.stringify({ ...emptyEvent(AT), show: { stage: 'auction', focus: null, display: { scale: 'big' } } }))
  assert.ok(junk.kind === 'ok')
  assert.deepEqual(junk.state.show, { stage: 'auction', focus: null })
  const wide = load(JSON.stringify({ ...emptyEvent(AT), show: { stage: 'auction', focus: null, display: { ...fit, scale: 900, left: -3 } } }))
  assert.ok(wide.kind === 'ok')
  assert.equal(wide.state.show.display?.scale, 150)
  assert.equal(wide.state.show.display?.left, 0)
})

test('a v6 save keeps lobbySince and participant lobbyAt, even when the fit is invalid', () => {
  const ev = { ...emptyEvent(AT), show: { stage: 'welcome', focus: null, lobbySince: AT, display: 'junk' } }
  const r = load(JSON.stringify(ev))
  assert.equal(r.kind === 'ok' && r.state.show.lobbySince, AT)
  assert.equal(r.kind === 'ok' && r.state.show.display, undefined)
  const ok = load(JSON.stringify({ ...emptyEvent(AT), show: { stage: 'welcome', focus: null, lobbySince: AT } }))
  assert.equal(ok.kind === 'ok' && ok.state.show.lobbySince, AT)
})
