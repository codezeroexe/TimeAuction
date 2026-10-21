import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAuth, parseJudges, IDLE_MS, ABSOLUTE_MS, type JudgesFile } from './auth.ts'

function setup() {
  let t = Date.parse('2026-10-12T09:00:00Z')
  let saved: JudgesFile | null = null
  const a = createAuth({ now: () => t, superPassword: '424242', save: (f) => (saved = structuredClone(f)) })
  return { a, advance: (ms: number) => (t += ms), saved: () => saved }
}
const tok = (r: ReturnType<ReturnType<typeof setup>['a']['login']>) => {
  assert.equal(r.ok, true)
  return (r as { token: string }).token
}

test('add judge, log in, wrong password and unknown user fail with the same message', () => {
  const { a, saved } = setup()
  assert.deepEqual(a.addJudge('Priya', 'correct horse'), { ok: true })
  const ok = a.login('priya', 'correct horse', '1.1.1.1')
  assert.equal(ok.ok && ok.name, 'Priya')
  assert.equal(a.session(tok(ok))?.superadmin, false)
  const bad = a.login('Priya', 'wrong password', '1.1.1.2')
  const unknown = a.login('nobody', 'wrong password', '1.1.1.3')
  assert.ok(!bad.ok && !unknown.ok && bad.status === 401 && unknown.status === 401 && bad.message === unknown.message)
  const rec = Object.values(saved()!.judges)[0]
  assert.notEqual(rec.hash, 'correct horse')
  a.addJudge('Other', 'correct horse')
  const [x, y] = Object.values(saved()!.judges)
  assert.notEqual(x.salt, y.salt)
  assert.notEqual(x.hash, y.hash)
})

test('5 failures from one IP lock it for 30 s even with the right password', () => {
  const { a, advance } = setup()
  a.addJudge('Priya', 'correct horse')
  for (let i = 0; i < 5; i++) a.login(`u${i}`, 'xxxxxxxx', '9.9.9.9')
  const r = a.login('Priya', 'correct horse', '9.9.9.9')
  assert.ok(!r.ok && r.status === 429)
  assert.equal(a.login('Priya', 'correct horse', '8.8.8.8').ok, true)
  advance(30_000)
  assert.equal(a.login('Priya', 'correct horse', '9.9.9.9').ok, true)
})

test('locking one IP does not lock the user out from another IP', () => {
  const { a } = setup()
  a.addJudge('Priya', 'correct horse')
  for (let i = 0; i < 5; i++) a.login('Priya', 'xxxxxxxx', '7.7.7.7')
  assert.ok(!a.login('Priya', 'correct horse', '7.7.7.7').ok)
  assert.equal(a.login('Priya', 'correct horse', '6.6.6.6').ok, true)
})

test('loopback (the host PC) is never locked out', () => {
  const { a } = setup()
  for (let i = 0; i < 10; i++) a.login('admin', 'wrong-pass', '::1')
  assert.equal(a.login('admin', '424242', '::1').ok, true)
  for (let i = 0; i < 10; i++) a.login('admin', 'wrong-pass', '127.0.0.1')
  const r = a.login('admin', 'wrong-pass', '127.0.0.1')
  assert.ok(!r.ok && r.status === 401)
})

test('idle 8 h expires; activity does not extend past 12 h', () => {
  const { a, advance } = setup()
  a.addJudge('Priya', 'correct horse')
  const t1 = tok(a.login('Priya', 'correct horse', '1.1.1.1'))
  advance(IDLE_MS + 1)
  assert.equal(a.session(t1), null)
  const t2 = tok(a.login('Priya', 'correct horse', '1.1.1.1'))
  for (let h = 7; h < 12; h += 7) {
    advance(7 * 3600_000)
    assert.ok(a.session(t2))
  }
  advance(ABSOLUTE_MS - 7 * 3600_000 + 1)
  assert.equal(a.session(t2), null)
})

test('revoke and reset kill sessions; revoked judge cannot log in', () => {
  const { a } = setup()
  a.addJudge('Priya', 'correct horse')
  const t1 = tok(a.login('Priya', 'correct horse', '1.1.1.1'))
  assert.deepEqual(a.resetPassword('Priya', 'another pass'), { ok: true })
  assert.equal(a.session(t1), null)
  assert.equal(a.login('Priya', 'correct horse', '1.1.1.1').ok, false)
  const t2 = tok(a.login('Priya', 'another pass', '1.1.1.2'))
  assert.equal(a.list()[0].sessions, 1)
  assert.deepEqual(a.revoke('priya'), { ok: true })
  assert.equal(a.session(t2), null)
  assert.equal(a.login('Priya', 'another pass', '1.1.1.2').ok, false)
})

test('admin + PIN is superadmin; reserved, invalid and duplicate names rejected', () => {
  const { a } = setup()
  const r = a.login('ADMIN', '424242', '1.1.1.1')
  assert.ok(r.ok && r.superadmin && r.name === 'admin')
  assert.equal(a.login('admin', '000000', '1.1.1.1').ok, false)
  assert.equal(a.addJudge('Admin', 'longenough').ok, false)
  assert.equal(a.addJudge('bad/name', 'longenough').ok, false)
  assert.equal(a.addJudge('', 'longenough').ok, false)
  assert.equal(a.addJudge('Ok', 'short').ok, false)
  assert.equal(a.addJudge('Ok', 'longenough').ok, true)
  assert.equal(a.addJudge('OK', 'longenough').ok, false)
})

test('parseJudges rejects garbage', () => {
  assert.throws(() => parseJudges('garbage'))
  assert.throws(() => parseJudges('{"v":2,"judges":{}}'))
  assert.deepEqual(parseJudges('{"v":1,"judges":{}}'), { v: 1, judges: {} })
})
