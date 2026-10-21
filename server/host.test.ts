import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHost, type Payload, type Request, type Subscriber } from './host.ts'
import { lanUrls, startServer } from './index.ts'
import { createAuth } from './auth.ts'
import { emptyEvent } from '../src/game/event.ts'
import { currentLot, nextValidBid, openingBid, sidesOf } from '../src/game/auction.ts'
import { loadEvent } from '../src/state/storage.ts'
import type { Action } from '../src/game/actions.ts'
import type { CriterionId } from '../src/game/types.ts'
import { RUBRIC } from '../src/game/scoring.ts'

const T0 = Date.parse('2026-10-12T09:00:00Z')

function setup(o: { log?: (m: string) => void; adminIntervalMs?: number } = {}) {
  let t = T0
  const auth = createAuth({ now: () => t, superPassword: '424242' })
  const host = createHost({ initial: emptyEvent(new Date(T0).toISOString()), auth, now: () => t, adminIntervalMs: o.adminIntervalMs ?? 0, log: o.log })
  /** Adds a judge (or uses the superadmin), signs in and returns the token plus the session the transport would attach. */
  const signIn = (name: string, pw = 'judge-password') => {
    if (name !== 'admin') auth.addJudge(name, pw)
    const r = auth.login(name, name === 'admin' ? '424242' : pw, `ip-${name}`)
    if (!r.ok) throw new Error(r.message)
    return { token: r.token, session: auth.session(r.token)! }
  }
  let n = 0
  /** Station keys handed out by register, by station and by registration. */
  const keyByClient = new Map<string, string>()
  const keyByGame = new Map<string, string>()
  const keyOf = (g: string) => keyByGame.get(g)
  const send = (clientId: string, gameId: string | null, action: Request['action'], extra: Partial<Request> = {}) => {
    const key = extra.key !== undefined ? extra.key : keyByClient.get(clientId) ?? (gameId ? keyByGame.get(gameId) : undefined)
    const r = host.dispatch({ requestId: `r${++n}`, clientId, gameId, action, key, ...extra })
    if (action.type === 'register' && r.ok && r.key && r.gameId) {
      keyByClient.set(clientId, r.key)
      keyByGame.set(r.gameId, r.key)
    }
    return r
  }
  const register = (clientId: string, name: string) => send(clientId, null, { type: 'register', input: { name, mode: 'individual', teamName: '', teammates: [] } }).gameId!
  /** A player station's stream: it presents the key it was given. */
  const watch = (clientId: string, gameId: string | null, onPayload: (p: Payload) => void, extra: Partial<Subscriber> = {}) =>
    host.subscribe({ clientId, gameId, admin: false, key: keyByClient.get(clientId) ?? (gameId ? keyByGame.get(gameId) : undefined), send: onPayload, ...extra })
  const session = (gameId: string) => host.event.participants.find((p) => p.gameId === gameId)!.run!.session!
  /** Pairs two registrations as a judge would from the admin Matchmaking panel. */
  const pairMany = (gameIds: string[], judge: ReturnType<typeof signIn> | null, bot?: boolean) => send('proj', null, { type: 'pairMatch', gameIds, bot }, judge ? { session: judge.session } : {})
  const pair = (a: string, b: string | null, judge: ReturnType<typeof signIn>) => pairMany(b ? [a, b] : [a], judge)
  let lead: ReturnType<typeof signIn> | null = null
  const ivi = (clientId: string, name: string) => {
    const g = register(clientId, name)
    // Players cannot start matches in remote mode; the event team (a judge session) does.
    lead ??= signIn('admin')
    send(clientId, g, {
      type: 'createMatch',
      config: { matchType: 'ivi', rulesetId: 'normal', timed: false, opponents: [{ kind: 'individual', name: `${name} rival`, members: [`${name} rival`], controller: 'human' }] },
    }, { session: lead.session })
    send(clientId, g, { type: 'proceedToAuction' }, { session: lead.session })
    // The auctioneer starts the first lot (skipping its intro); players cannot.
    send(clientId, g, { type: 'setClockRunning', running: true }, { session: lead.session })
    return g
  }
  /** Two registered stations paired by a judge with the first lot running; the guest (Side B) has not joined yet. */
  const duo = (hostClient: string, guestClient: string) => {
    const ga = register(hostClient, 'Ada')
    const gb = register(guestClient, 'Bob')
    lead ??= signIn('admin')
    send('proj', null, { type: 'pairMatch', gameIds: [ga, gb] }, { session: lead.session })
    send('proj', ga, { type: 'setClockRunning', running: true }, { session: lead.session })
    return { ga, gb, sid: session(ga).sessionId }
  }
  return { host, auth, duo, signIn, send, register, keyOf, watch, session, ivi, pair, pairMany, advance: (ms: number) => (t += ms) }
}

const bid = (s: { send: ReturnType<typeof setup>['send']; session: ReturnType<typeof setup>['session'] }, client: string, g: string, side: string, amount?: number) =>
  s.send(client, g, { type: 'bid', side, amount: amount ?? nextValidBid(s.session(g)) })

test('25 participants: each subscriber sees only its own records; the administrator sees all', () => {
  const s = setup()
  const ids = Array.from({ length: 25 }, (_, i) => s.register(`c${i}`, `Player ${i + 1}`))
  assert.equal(new Set(ids).size, 25)
  const got = new Map<string, Payload>()
  ids.forEach((g, i) => s.watch(`c${i}`, g, (p) => got.set(g, p)))
  let admin: Payload | null = null
  s.host.subscribe({ clientId: 'admin', gameId: null, admin: true, token: s.signIn('admin').token, send: (p) => (admin = p) })
  for (const g of ids) {
    const p = got.get(g)!
    assert.deepEqual(p.event.participants.map((x) => x.gameId), [g])
    assert.equal(p.event.audit.length, 0)
    assert.equal(p.admin, false)
  }
  assert.equal(admin!.event.participants.length, 25)
  assert.equal(s.host.subscriberCount, 26)
})

test('simultaneous bids for the same amount: exactly one is accepted', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const amount = nextValidBid(s.session(g))
  const a = bid(s, 'host', g, 'A', amount)
  const b = bid(s, 'host', g, 'B', amount)
  assert.equal(a.ok, true)
  assert.equal(b.ok, false)
  const lot = currentLot(s.session(g))
  assert.equal(lot.leader, 'A')
  assert.equal(lot.bid, amount)
  // A proposed price only: nobody is charged until SOLD.
  assert.equal(s.session(g).sides.A.wallet.balance, 1000)
})

test('a retried request (same request ID) is applied once and answered identically', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const req: Request = { requestId: 'retry-1', clientId: 'host', gameId: g, key: s.keyOf(g), action: { type: 'bid', side: 'A', amount: nextValidBid(s.session(g)) } }
  const first = s.host.dispatch(req)
  const second = s.host.dispatch(req)
  assert.deepEqual(second, first)
  assert.equal(s.session(g).events.filter((e) => e.type === 'bid_accepted').length, 1)
})

test('auction close boundary: a bid after the deadline is rejected, the winner is charged exactly once', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const price = nextValidBid(s.session(g))
  assert.equal(bid(s, 'host', g, 'A', price).ok, true)
  s.advance(9_900)
  assert.equal(bid(s, 'host', g, 'B').ok, true, 'just before the deadline is accepted and resets the clock')
  const final = currentLot(s.session(g)).bid!
  s.advance(10_050) // past the reset deadline, with no server tick in between
  const late = bid(s, 'host', g, 'A')
  assert.equal(late.ok, false, 'the server catches the clock up before judging the bid')
  const sess = s.session(g)
  assert.equal(currentLot(sess).status, 'sold')
  assert.equal(currentLot(sess).leader, 'B')
  assert.equal(sess.sides.B.wallet.balance, 1000 - final)
  assert.equal(sess.sides.A.wallet.balance, 1000)
  assert.equal(sess.events.filter((e) => e.type === 'purchase').length, 1)
  // Ticking again cannot finalise it a second time.
  s.advance(20_000)
  s.host.tickAll()
  assert.equal(s.session(g).events.filter((e) => e.type === 'purchase').length, 1)
  assert.equal(s.session(g).sides.B.wallet.balance, 1000 - final)
})

test('12 independent sessions with interleaved bids keep separate, correct wallets', () => {
  const s = setup()
  const games = Array.from({ length: 12 }, (_, i) => s.ivi(`c${i}`, `P${i}`))
  // Interleave: every session gets bids in round-robin order, a different number per session.
  for (let round = 0; round < 6; round++) {
    games.forEach((g, i) => {
      if (round <= i % 6) bid(s, `c${i}`, g, round % 2 === 0 ? 'A' : 'B')
    })
  }
  s.advance(11_000)
  s.host.tickAll()
  games.forEach((g, i) => {
    const sess = s.session(g)
    const lot = currentLot(sess)
    const bids = (i % 6) + 1
    const winner = (bids - 1) % 2 === 0 ? 'A' : 'B'
    assert.equal(lot.status, 'sold', `session ${i}`)
    assert.equal(lot.leader, winner)
    assert.equal(lot.bid, openingBid(sess.rules, lot.techId) + sess.rules.bidIncrement * (bids - 1))
    assert.equal(sess.sides[winner].wallet.balance, 1000 - lot.bid!)
    assert.equal(sess.sides[winner === 'A' ? 'B' : 'A'].wallet.balance, 1000)
    assert.equal(sess.sessionId === s.session(games[(i + 1) % 12]).sessionId, false)
  })
})

test('a station that joined Side B is the only one that can act for it', () => {
  const s = setup()
  const { ga: g, gb, sid } = s.duo('host', 'guest')
  const join = s.send('guest', gb, { type: 'joinSession', sessionId: sid })
  assert.equal(join.ok, true)
  assert.equal(join.gameId, g)
  assert.equal(bid(s, 'host', g, 'B').ok, false, 'host can no longer bid for B')
  assert.equal(bid(s, 'guest', g, 'A').ok, false, 'guest cannot bid for A')
  assert.equal(bid(s, 'guest', g, 'B').ok, true)
  assert.equal(bid(s, 'host', g, 'A').ok, true)
  let seen: Payload | null = null
  const off = s.watch('guest', g, (p) => (seen = p))
  assert.deepEqual(seen!.claims, { B: 'you' })
  // A third station that holds Bob's key (a resumed registration) can only take the side over once the first is gone.
  const third = { key: s.keyOf(gb) }
  assert.equal(s.send('third', null, { type: 'joinSession', sessionId: sid }, third).ok, false, 'taken while the guest is connected')
  off()
  assert.equal(s.send('third', null, { type: 'joinSession', sessionId: sid }, third).ok, true, 'a disconnected station’s side can be re-joined')
  assert.equal(bid(s, 'guest', g, 'B').ok, false, 'and the old station no longer controls it')
})

test('refresh/reconnect: a lost station does not pause the match; others see it as disconnected until it is back', () => {
  const s = setup()
  const { ga: g, gb, sid } = s.duo('host', 'c2')
  bid(s, 'host', g, 'A')
  assert.equal(s.send('c2', gb, { type: 'joinSession', sessionId: sid }).ok, true)
  let seen: Payload | null = null
  s.watch('c2', g, (p) => (seen = p))
  const off = s.watch('host', g, () => {})
  s.host.flush()
  assert.deepEqual(seen!.offline[sid], [])
  s.advance(3_000)
  off()
  s.host.flush()
  assert.equal(currentLot(s.session(g)).running, true, 'the match keeps running')
  assert.deepEqual(seen!.offline[sid], ['A'])
  let back: Payload | null = null
  s.watch('host', g, (p) => (back = p))
  s.host.flush()
  assert.deepEqual(seen!.offline[sid], [])
  const backSession = back!.event.participants[0].run!.session!
  assert.ok(backSession.lots.length > 0, 'reconnecting gets the full state back')
})

const WORDS = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')
const entries = Object.fromEntries(RUBRIC.map((c) => [c.id, { score: c.max - 2, note: '' }])) as Record<CriterionId, { score: number; note: string }>

test('full flow: duplicate submission rejected; scoring needs a signed-in judge; leaderboard comes from the server', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const act = (action: Action, extra: Partial<Request> = {}) => s.send('host', g, action, extra)
  const j = s.signIn('judge1')
  const run = (action: Action) => s.send('proj', g, action, { session: j.session })
  for (let i = 0; i < 3; i++) {
    bid(s, 'host', g, 'A')
    assert.equal(act({ type: 'pass', side: 'B' }).ok, true)
    run({ type: 'advanceLot' })
    run({ type: 'setClockRunning', running: true })
  }
  for (let i = 0; i < 2; i++) {
    act({ type: 'pass', side: 'A' })
    act({ type: 'pass', side: 'B' })
    run({ type: 'advanceLot' })
    run({ type: 'setClockRunning', running: true })
  }
  assert.equal(s.session(g).status, 'complete')
  assert.equal(s.session(g).sides.A.portfolio.length, 3)
  act({ type: 'continueToMission' })
  act({ type: 'acknowledgeTwist' })
  act({ type: 'startSolution', side: 'A' })
  const techIds = [...s.session(g).sides.A.portfolio]
  assert.equal(act({ type: 'updateDraft', side: 'A', draft: { techIds, characteristics: ['sustainable'], text: WORDS } }).ok, true)
  const first = act({ type: 'submitSolution', side: 'A' })
  const again = act({ type: 'submitSolution', side: 'A' })
  assert.equal(first.ok, true)
  assert.equal(again.ok, false)
  const sub = s.host.event.participants[0].run!.solutions.A!.submission!

  const judge = s.signIn('Judge 1')
  // A spoofed operator in the body is ignored: the audit actor is the session name.
  const admin = (action: Action, session: typeof judge.session | null = judge.session) => s.send('judge', null, action, { session, operator: 'Mallory' } as Partial<Request>)
  assert.equal(admin({ type: 'queueSubmission', submissionId: sub.submissionId }, null).ok, false, 'no session')
  assert.equal(admin({ type: 'queueSubmission', submissionId: sub.submissionId }, null).status, 403)
  assert.equal(act({ type: 'publishScore', submissionId: sub.submissionId }).ok, false, 'a participant cannot publish')
  assert.equal(admin({ type: 'queueSubmission', submissionId: sub.submissionId }).ok, true)
  assert.equal(admin({ type: 'submitScores', submissionId: sub.submissionId, entries }).ok, true)
  assert.equal(admin({ type: 'publishScore', submissionId: sub.submissionId }).ok, false, 'must be verified first')
  assert.equal(admin({ type: 'verifyScore', submissionId: sub.submissionId }).ok, true)
  assert.equal(admin({ type: 'publishScore', submissionId: sub.submissionId }).ok, true)
  assert.equal(s.host.event.scores[sub.submissionId].publishedBy, 'Judge 1', 'the signed-in judge name is recorded, not the spoofed operator')
  assert.equal(s.host.event.settings.operator, '', 'without changing the shared settings')

  let p: Payload | null = null
  s.watch('someone-else', null, (x) => (p = x))
  assert.equal(p!.leaderboard.length, 1)
  assert.equal(p!.leaderboard[0].rubric, 100 - 12)
  assert.equal(p!.leaderboard[0].total, 100 - 12 + p!.leaderboard[0].tools, 'final = rubric + tool points')
  assert.equal(p!.event.participants.length, 0, 'a spectator sees the leaderboard, not other players’ runs')
})

test('HTTP: 24 concurrent clients in 12 matches register, stream state and bid; responses stay fast', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-'))
  const { port, close } = await startServer({ port: 0, dataDir: dir, adminPin: '111111', serveStatic: false, quiet: true, concurrentMatches: true })
  const base = `http://127.0.0.1:${port}`
  const timings: number[] = []
  const post = async (body: unknown, cookie?: string) => {
    const t = performance.now()
    const headers = cookie ? { cookie, 'content-type': 'application/json' } : { 'content-type': 'application/json' }
    const r = await fetch(`${base}/api/action`, { method: 'POST', headers, body: JSON.stringify(body) })
    timings.push(performance.now() - t)
    return r.json() as Promise<{ ok: boolean; gameId?: string; key?: string; message: string }>
  }
  try {
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'admin', password: '111111' }) })
    const adminCookie = login.headers.get('set-cookie')!.split(';')[0]
    const clients = await Promise.all(
      Array.from({ length: 24 }, async (_, i) => {
        const clientId = `load-${i}`
        const reg = await post({ requestId: `${clientId}-reg`, clientId, gameId: null, action: { type: 'register', input: { name: `Load ${i}`, mode: 'individual', teamName: '', teammates: [] } } })
        assert.equal(reg.ok, true)
        const ctrl = new AbortController()
        const res = await fetch(`${base}/api/stream?client=${clientId}&game=${reg.gameId}&key=${encodeURIComponent(reg.key!)}`, { signal: ctrl.signal })
        const reader = res.body!.getReader()
        const first = await readEvent(reader)
        assert.deepEqual(first.event.participants.map((p) => p.gameId), [reg.gameId])
        return { clientId, gameId: reg.gameId!, key: reg.key!, ctrl, reader }
      }),
    )
    await Promise.all(
      clients.map(async ({ clientId, gameId, key, reader }, i) => {
        // Even clients host a match with the next client as Side B; guests only keep their stream open.
        if (i % 2) return
        const a = (action: unknown, k: string) => post({ requestId: `${clientId}-${k}`, clientId, gameId, key, action })
        // Only the pairing carries the admin cookie; the players' own requests stay cookie-less.
        const paired = await post({ requestId: `${clientId}-pair`, clientId: 'proj', gameId: null, action: { type: 'pairMatch', gameIds: [gameId, clients[i + 1]!.gameId], rulesetId: i % 2 ? 'short' : 'normal', timed: true } }, adminCookie)
        assert.equal(paired.ok, true, paired.message)
        // Lots are drawn per run, so read the opening price of the first lot from this client's stream.
        let view = await readEvent(reader)
        while (view.event.participants[0]?.run?.session?.status !== 'live') view = await readEvent(reader)
        const opened = view.event.participants[0]!.run!.session!
        const amount = openingBid(opened.rules, opened.lots[0]!.techId)
        // The auctioneer (admin cookie) skips the intro; the player's own requests cannot.
        await post({ requestId: `${clientId}-run`, clientId, gameId, action: { type: 'setClockRunning', running: true } }, adminCookie)
        const r = await a({ type: 'bid', side: 'A', amount }, 'b1')
        assert.equal(r.ok, true, r.message)
        // The same request sent again (a network retry) is not applied twice.
        await a({ type: 'bid', side: 'A', amount }, 'b1')
      }),
    )
    // Every client's stream received its own updated state, and nobody else's.
    for (const c of clients.filter((_, i) => i % 2 === 0)) {
      let last = await readEvent(c.reader)
      while (currentLot(last.event.participants[0].run?.session ?? ({ lots: [{}], current: 0 } as never))?.bid == null) last = await readEvent(c.reader)
      assert.deepEqual(last.event.participants.map((p) => p.gameId), [c.gameId])
      const s = last.event.participants[0].run!.session!
      assert.equal(s.events.filter((e) => e.type === 'bid_accepted' && e.sideId === 'A').length, 1)
      c.ctrl.abort()
    }
    for (const c of clients) c.ctrl.abort()
    timings.sort((x, y) => x - y)
    const p95 = timings[Math.floor(timings.length * 0.95)]
    assert.ok(p95 < 300, `p95 ${p95.toFixed(1)} ms`)
  } finally {
    await close()
    rmSync(dir, { recursive: true, force: true })
  }
})

async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Payload> {
  const buf = ((reader as unknown as { _buf?: string })._buf ??= '')
  let text = buf
  for (;;) {
    const at = text.indexOf('\n\n')
    if (at >= 0) {
      const chunk = text.slice(0, at)
      ;(reader as unknown as { _buf: string })._buf = text.slice(at + 2)
      const data = chunk.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
      if (data) return JSON.parse(data)
      text = (reader as unknown as { _buf: string })._buf
      continue
    }
    const { value, done } = await reader.read()
    if (done) throw new Error('stream ended')
    text += new TextDecoder().decode(value)
  }
}

test('a revoked judge’s live admin stream is downgraded at once', () => {
  const s = setup()
  const j = s.signIn('Judge 1')
  s.register('c1', 'Ada')
  const got: Payload[] = []
  s.host.subscribe({ clientId: 'j', gameId: null, admin: true, token: j.token, send: (p) => got.push(p) })
  assert.equal(got.at(-1)!.admin, true)
  assert.equal(got.at(-1)!.judge, 'Judge 1')
  s.auth.revoke('Judge 1')
  s.host.kick()
  assert.equal(got.at(-1)!.admin, false)
  assert.equal(got.at(-1)!.event.audit.length, 0)
  assert.equal(got.at(-1)!.event.participants.length, 0)
})

test('clearLobby is judge-only and keeps participants', () => {
  const s = setup()
  const judge = s.signIn('Judge 1')
  s.register('a', 'Ada')
  assert.equal(s.send('a', null, { type: 'clearLobby', reason: 'new round' }).status, 403)
  const r = s.send('c', null, { type: 'clearLobby', reason: 'new round' }, { session: judge.session })
  assert.equal(r.ok, true)
  assert.equal(s.host.event.participants.length, 1)
  assert.ok(s.host.event.show.lobbySince)
})

test('resetEvent and updateSettings are event-lead only', () => {
  const s = setup()
  const judge = s.signIn('Judge 1')
  const lead = s.signIn('admin')
  assert.equal(s.send('c', null, { type: 'resetEvent' }, { session: judge.session }).status, 403)
  assert.equal(s.send('c', null, { type: 'updateSettings', patch: { eventName: 'X' } }, { session: judge.session }).status, 403)
  assert.equal(s.send('c', null, { type: 'resetEvent' }, { session: lead.session }).ok, true)
})

test('judge management is superadmin only and never echoes passwords', () => {
  const s = setup()
  const judge = s.signIn('Judge 1')
  const lead = s.signIn('admin')
  const add = { type: 'addJudge', name: 'Newbie', password: 'secret-pass-1' } as const
  assert.equal(s.send('c', null, add).status, 403, 'no session')
  assert.equal(s.send('c', null, add, { session: judge.session }).status, 403, 'plain judge')
  const ok = s.send('c', null, add, { session: lead.session })
  assert.equal(ok.ok, true)
  assert.ok(!JSON.stringify(ok).includes('secret-pass-1'))
  const list = s.send('c', null, { type: 'listJudges' }, { session: lead.session })
  assert.deepEqual(list.judges!.map((j) => j.name).sort(), ['Judge 1', 'Newbie'])
  assert.ok(!JSON.stringify(list).includes('hash'))
})

test('HTTP login: HttpOnly cookie carries the session; ?pin= and body identity grant nothing; logout ends it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-auth-'))
  const srv = await startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true })
  const base = `http://127.0.0.1:${srv.port}`
  try {
    let n = 0
    const post = (path: string, body: unknown, cookie?: string) =>
      fetch(base + path, { method: 'POST', headers: cookie ? { cookie, 'content-type': 'application/json' } : { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const act = (action: unknown, cookie?: string, extra: object = {}) =>
      post('/api/action', { requestId: `a${++n}`, clientId: 'x', gameId: null, action, ...extra }, cookie).then(async (r) => ({ status: r.status, body: (await r.json()) as { ok: boolean } }))
    const resetEvent = { type: 'resetEvent' }
    assert.equal((await act(resetEvent, undefined, { pin: '424242', operator: 'Mallory' })).status, 403, 'no cookie, body pin ignored')

    const bad = await post('/api/login', { name: 'admin', password: 'nope' })
    assert.equal(bad.status, 401)
    const login = await post('/api/login', { name: 'admin', password: '424242' })
    assert.equal(login.status, 200)
    const setCookie = login.headers.get('set-cookie')!
    assert.match(setCookie, /^ta_sid=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/api/)
    const text = await login.text()
    assert.ok(!text.includes(setCookie.split(';')[0].slice(11)), 'token is not in the body')
    const cookie = setCookie.split(';')[0]

    const stream = await fetch(`${base}/api/stream?client=a&pin=424242`)
    const r1 = stream.body!.getReader()
    assert.equal((await readEvent(r1)).admin, false, '?pin= grants nothing')
    await r1.cancel()
    const withCookie = await fetch(`${base}/api/stream?client=a`, { headers: { cookie } })
    const r2 = withCookie.body!.getReader()
    assert.equal((await readEvent(r2)).admin, true)
    await r2.cancel()

    assert.equal((await act({ type: 'listJudges' }, cookie)).body.ok, true)
    assert.equal((await act({ type: 'listJudges' })).status, 403)
    await post('/api/logout', {}, cookie)
    assert.equal((await act({ type: 'listJudges' }, cookie)).status, 403, 'logged out')
  } finally {
    await srv.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('HTTP login: loopback is never locked out and a client-supplied ip is ignored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-pin-'))
  const srv = await startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true })
  try {
    let n = 0
    const login = (password: string) =>
      fetch(`http://127.0.0.1:${srv.port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `u${++n}`, password, ip: `spoof-${n}` }) }).then((r) => r.status)
    // The test client is loopback (the host PC), which is never locked out, whatever ip the body claims.
    for (let i = 0; i < 7; i++) assert.equal(await login('wrong-password'), 401)
  } finally {
    await srv.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a corrupt judges.json stops the server from starting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-judges-'))
  writeFileSync(join(dir, 'judges.json'), 'garbage')
  try {
    await assert.rejects(async () => startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true }), /judges\.json could not be read/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('auctioneer: an admin controls a match clock without a claim, and it is logged', () => {
  const logs: string[] = []
  const s = setup({ log: (m) => logs.push(m) })
  const { ga: g, gb, sid } = s.duo('host', 'c2')
  s.send('c2', gb, { type: 'joinSession', sessionId: sid })
  s.watch('c2', g, () => {})
  const j = s.signIn('judge1')
  const run = (action: Action) => s.send('proj', g, action, { session: j.session })
  assert.equal(run({ type: 'setClockRunning', running: false }).ok, true)
  assert.equal(currentLot(s.session(g)).running, false)
  assert.equal(run({ type: 'setClockRunning', running: true }).ok, true)
  assert.equal(currentLot(s.session(g)).running, true)
  bid(s, 'host', g, 'A')
  s.send('c2', g, { type: 'pass', side: 'B' })
  assert.equal(currentLot(s.session(g)).status, 'sold')
  const before = s.session(g).current
  assert.equal(run({ type: 'advanceLot' }).ok, true)
  assert.equal(s.session(g).current, before + 1)
  assert.ok(logs.some((m) => m.includes('Auctioneer judge1')))
})

test('auctioneer: an admin session cannot bid or pass', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const j = s.signIn('judge1')
  const n = s.session(g).events.length
  for (const action of [{ type: 'bid', side: 'A', amount: 120 }, { type: 'pass', side: 'A' }] as Action[]) {
    assert.equal(s.send('proj', g, action, { session: j.session }).status, 403)
  }
  assert.equal(s.session(g).events.length, n)
})

test('no participant, no control: clock actions without a judge are 403, and an unknown game is 404 for a judge', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const before = s.host.event
  assert.equal(s.send('x', null, { type: 'setClockRunning', running: false }).status, 403)
  assert.equal(s.send('x', 'GAME-NOPE', { type: 'advanceLot' }).status, 403)
  assert.equal(s.host.event, before)
  assert.equal(currentLot(s.session(g)).running, true)
  const j = s.signIn('judge1')
  assert.equal(s.send('proj', 'GAME-NOPE', { type: 'advanceLot' }, { session: j.session }).status, 404)
})

test('players cannot start, pause or advance lots; the auctioneer can', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const denied = s.send('host', g, { type: 'setClockRunning', running: false })
  assert.equal(denied.ok, false)
  assert.equal(denied.status, 403)
  assert.equal(denied.message, 'The auctioneer controls the lots.')
  assert.equal(s.send('host', g, { type: 'advanceLot' }).status, 403)
  assert.equal(currentLot(s.session(g)).running, true, 'the player could not pause it')
  const j = s.signIn('judge1')
  assert.equal(s.send('proj', g, { type: 'setClockRunning', running: false }, { session: j.session }).ok, true)
  assert.equal(currentLot(s.session(g)).running, false)
})

test('the server runs the intro and the result pause by itself, and players cannot skip them', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const j = s.signIn('judge1')
  assert.equal(s.pair(ga, gb, j).ok, true)
  s.host.tickAll()
  assert.deepEqual([currentLot(s.session(ga)).phase, currentLot(s.session(ga)).running], ['intro', true], 'the intro runs on its own')
  assert.equal(s.send('cA', ga, { type: 'bid', side: 'A', amount: 120 }).ok, false, 'no bids during the intro')
  assert.equal(s.send('cA', ga, { type: 'setClockRunning', running: true }).status, 403)
  s.advance(9_000)
  s.host.tickAll()
  assert.equal(currentLot(s.session(ga)).phase, 'intro')
  s.advance(1_000)
  s.host.tickAll()
  assert.equal(currentLot(s.session(ga)).phase, 'open', 'bidding opens after 10 s')
  assert.equal(s.send('cA', ga, { type: 'bid', side: 'A', amount: nextValidBid(s.session(ga)) }).ok, true)
  // Both sides pass on the next lot's bidding (the first closes as SOLD above); the result pause runs, then the next lot opens.
  assert.equal(s.send('cB', ga, { type: 'pass', side: 'B' }).ok, true)
  assert.equal(currentLot(s.session(ga)).status, 'sold')
  s.advance(5_000)
  s.host.tickAll()
  assert.equal(s.session(ga).current, 0, 'the result is still on screen')
  s.advance(1_000)
  s.host.tickAll()
  assert.equal(s.session(ga).current, 1)
  assert.equal(currentLot(s.session(ga)).phase, 'intro')
})

test('a re-paired Game ID does not count the idle time since its cancelled match’s last action', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const gc = s.register('cC', 'Cy')
  const j = s.signIn('judge1')
  const run = (g: string, action: Action) => s.send('proj', g, action, { session: j.session })
  assert.equal(s.pair(ga, gb, j).ok, true)
  // One lot closes, the next one is shown, then the match is cancelled: the last catch-up for Ada's Game ID was just now.
  run(ga, { type: 'setClockRunning', running: true })
  assert.equal(s.send('cA', ga, { type: 'pass', side: 'A' }).ok, true)
  assert.equal(s.send('cB', ga, { type: 'pass', side: 'B' }).ok, true)
  run(ga, { type: 'advanceLot' })
  assert.equal(run(ga, { type: 'cancelRun', gameId: ga, reason: 'restarted for a test' }).ok, true)
  s.advance(3_600_000) // an hour passes before the Game ID is paired again
  const again = s.pair(ga, gc, j)
  assert.equal(again.ok, true, again.message)
  s.host.tickAll()
  assert.deepEqual([s.session(ga).current, currentLot(s.session(ga)).phase], [0, 'intro'], 'the new intro starts at pairing, not an hour earlier')
})

test('a non-admin live stream still sees only its own game', async () => {
  const s = setup()
  const g1 = s.ivi('c1', 'Ada')
  const g2 = s.ivi('c2', 'Bob')
  let p: Payload | null = null
  s.watch('c1', g1, (x) => (p = x), { live: true })
  bid(s, 'c2', g2, 'A')
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(p!.event.participants.length, 1)
  assert.equal(p!.event.participants[0].gameId, g1)
  assert.equal(p!.event.audit.length, 0)
})

test('a live admin stream is floored at 150 ms; a normal one is', async () => {
  const s = setup({ adminIntervalMs: 1000 })
  const g = s.ivi('c1', 'Ada')
  const token = s.signIn('judge1').token
  let live = 0
  let slow = 0
  s.host.subscribe({ clientId: 'l', gameId: null, admin: true, token, live: true, send: () => live++ })
  s.host.subscribe({ clientId: 's', gameId: null, admin: true, token, send: () => slow++ })
  const [l0, s0] = [live, slow]
  bid(s, 'c1', g, 'A')
  s.advance(200)
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(live, l0 + 1)
  assert.equal(slow, s0)
  // Let the throttled push drain (the test clock is frozen, so it would otherwise re-arm forever).
  s.advance(2000)
  await new Promise((r) => setTimeout(r, 1000))
  assert.equal(slow, s0 + 1)
})

test('admin pairs two waiting players: both stations land in the same match on their own side', () => {
  const logs: string[] = []
  const s = setup({ log: (m) => logs.push(m) })
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const j = s.signIn('judge1')
  const r = s.pair(ga, gb, j)
  assert.equal(r.ok, true, r.message)
  const sess = s.session(ga)
  assert.equal(sess.status, 'live')
  assert.equal(currentLot(sess).phase, 'intro', 'pairing opens the first lot in its intro countdown')
  assert.deepEqual([sess.sides.A.name, sess.sides.B.name, sess.sides.B.gameId], ['Ada', 'Bob', gb])
  assert.ok(logs.some((m) => m.startsWith('Matchmaking judge1: Ada, Bob (')))

  // Bob's station sees the hint, then joins with its own Game ID.
  let seenB: Payload | null = null
  s.watch('cB', gb, (p) => (seenB = p))
  assert.equal(seenB!.paired!.sessionId, sess.sessionId)
  const join = s.send('cB', gb, { type: 'joinSession', sessionId: sess.sessionId })
  assert.deepEqual([join.ok, join.gameId, join.side], [true, ga, 'B'])

  // Each station now subscribes to the shared match: claims differ by station.
  let pA: Payload | null = null
  let pB: Payload | null = null
  s.watch('cA', ga, (p) => (pA = p))
  s.watch('cB', ga, (p) => (pB = p))
  assert.deepEqual(pA!.claims, { B: 'other' })
  assert.deepEqual(pB!.claims, { B: 'you' })
  assert.equal(pA!.paired, null)

  s.send('proj', ga, { type: 'setClockRunning', running: true }, { session: j.session })
  assert.equal(bid(s, 'cB', ga, 'B').ok, true, 'Bob plays Side B')
  assert.equal(bid(s, 'cB', ga, 'A').ok, false, 'Bob cannot act for Side A')
  assert.equal(bid(s, 'cA', ga, 'A').ok, true, 'Ada plays Side A')
})

test('only a signed-in judge can pair players', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  assert.equal(s.send('cA', null, { type: 'pairMatch', gameIds: [ga, gb] }).status, 403)
  assert.equal(s.send('cA', null, { type: 'pairMatch', gameIds: [ga, gb, s.register('cC', 'Cy')] }).status, 403)
  assert.equal(s.host.event.participants.every((p) => !p.run), true, 'no run created')
})

test('players cannot start, discard or replay matches; a paired match opens only on its Side B station', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const bot = { type: 'createMatch', config: { matchType: 'ivbot', rulesetId: 'normal', timed: false, opponents: [{ kind: 'bot', name: 'ChronoBot', members: [], controller: 'bot' }] } } as const
  assert.equal(s.send('cA', ga, bot).status, 403)
  assert.equal(s.send('cA', ga, { type: 'discardMatch' }).status, 403)
  assert.equal(s.send('cA', ga, { type: 'replay' }).status, 403)
  assert.equal(s.host.event.participants[0].run, null)

  const j = s.signIn('judge1')
  assert.equal(s.pair(ga, gb, j).ok, true)
  const sid = s.session(ga).sessionId
  assert.equal(s.send('x', null, { type: 'joinSession', sessionId: sid }).status, 403, 'no Game ID')
  assert.equal(s.send('x', ga, { type: 'joinSession', sessionId: sid }).status, 403, 'Side A registration')
  assert.equal(s.send('x', gb, { type: 'joinSession', sessionId: sid }).ok, true, 'Side B registration')
})

test('pairing a player already in a match is rejected; a lone player cannot be paired', () => {
  const s = setup()
  const [ga, gb, gc] = ['Ada', 'Bob', 'Cy'].map((n, i) => s.register(`c${i}`, n))
  const j = s.signIn('judge1')
  assert.equal(s.pair(ga, gb, j).ok, true)
  assert.equal(s.pair(ga, gc, j).status, 409)
  assert.equal(s.pair(gc, gb, j).status, 409)
  assert.equal(s.pair(gc, gc, j).status, 400)
  assert.equal(s.pair(gc, null, j).status, 400, 'a lone player cannot be paired')
})

test('one match at a time: a new pair waits until the current auction has finished', () => {
  const s = setup()
  const [ga, gb, gc, gd] = ['Ada', 'Bob', 'Cy', 'Dee'].map((n, i) => s.register(`c${i}`, n))
  const j = s.signIn('judge1')
  assert.equal(s.pair(ga, gb, j).ok, true)
  const r = s.pair(gc, gd, j)
  assert.equal(r.status, 409)
  assert.match(r.message, /One match at a time/)
  s.host.event.participants.find((p) => p.gameId === ga)!.run!.session!.status = 'complete'
  assert.equal(s.pair(gc, gd, j).ok, true, 'free once the auction is over')
})

test('five players pair into one match: each station joins and owns exactly its own side', () => {
  const s = setup()
  const SIDE = ['A', 'B', 'C', 'D', 'E']
  const gs = ['Ada', 'Bob', 'Cy', 'Dee', 'Eve'].map((n, i) => s.register(`c${i}`, n))
  const j = s.signIn('judge1')
  const r = s.pairMany(gs, j)
  assert.equal(r.ok, true, r.message)
  const sess = s.session(gs[0])
  assert.deepEqual(sidesOf(sess), SIDE)
  assert.equal(sess.matchType, 'multi')
  assert.equal(currentLot(sess).phase, 'intro', 'pairing opens the first lot in its intro countdown')
  s.send('proj', gs[0], { type: 'setClockRunning', running: true }, { session: j.session })

  const seen = new Map<number, Payload>()
  for (let i = 1; i < 5; i++) s.watch(`c${i}`, gs[i], (p) => seen.set(i, p))
  for (let i = 1; i < 5; i++) {
    assert.equal(seen.get(i)!.paired!.sessionId, sess.sessionId, `station ${i} sees paired`)
    const join = s.send(`c${i}`, gs[i], { type: 'joinSession', sessionId: sess.sessionId })
    assert.deepEqual([join.ok, join.gameId, join.side], [true, gs[0], SIDE[i]])
  }
  // Each station subscribes to the shared match and sees only its own side as 'you'.
  for (let i = 1; i < 5; i++) {
    let p: Payload | null = null
    s.watch(`c${i}`, gs[0], (x) => (p = x))
    assert.deepEqual(p!.claims, Object.fromEntries(SIDE.slice(1).map((id) => [id, id === SIDE[i] ? 'you' : 'other'])))
    assert.equal(p!.paired, null)
  }
  assert.equal(bid(s, 'c2', gs[0], 'C').ok, true, 'Cy plays Side C')
  assert.equal(bid(s, 'c2', gs[0], 'B').ok, false, 'Cy cannot bid for Side B')
  assert.equal(bid(s, 'c2', gs[0], 'A').ok, false, 'Cy cannot bid for Side A')
  assert.equal(bid(s, 'c0', gs[0], 'A').ok, true, 'the host plays Side A')
})

test('a station cannot claim a second side of the same match', () => {
  const s = setup()
  const gs = ['Ada', 'Bob', 'Cy'].map((n, i) => s.register(`c${i}`, n))
  assert.equal(s.pairMany(gs, s.signIn('judge1')).ok, true)
  const sid = s.session(gs[0]).sessionId
  assert.equal(s.send('x', gs[1], { type: 'joinSession', sessionId: sid }).side, 'B')
  const again = s.send('x', gs[2], { type: 'joinSession', sessionId: sid })
  assert.equal(again.status, 403)
})

test('a busy player cannot be paired again (409), in a pair or in a larger group', () => {
  const s = setup()
  const gs = ['Ada', 'Bob', 'Cy', 'Dee'].map((n, i) => s.register(`c${i}`, n))
  const j = s.signIn('judge1')
  assert.equal(s.pairMany(gs.slice(0, 3), j).ok, true)
  assert.equal(s.pairMany([gs[2], gs[3]], j).status, 409)
  assert.equal(s.pairMany([gs[3], gs[0]], j).status, 409)
  assert.equal(s.pairMany([gs[3]], j, true).status, 400, 'bot matches are gone')
})

test('pairMatch with bot: true is rejected (400), and so is a single player', () => {
  const s = setup()
  const gs = ['Ada', 'Bob'].map((n, i) => s.register(`c${i}`, n))
  const j = s.signIn('judge1')
  assert.equal(s.pairMany(gs, j, true).status, 400)
  assert.equal(s.pairMany([gs[0]], j, true).status, 400)
  assert.equal(s.pairMany([gs[0]], j).status, 400, 'a match needs at least two humans')
  assert.equal(s.pairMany([gs[0], gs[0]], j).status, 400, 'no duplicates')
  assert.equal(s.host.event.participants.every((p) => !p.run), true, 'nothing created')
})

test('a v3 event.json loads as v6; a corrupt event.json is still refused on start', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-v3-'))
  const file = join(dir, 'event.json')
  try {
    writeFileSync(file, JSON.stringify({ ...emptyEvent(new Date(T0).toISOString()), version: 3 }))
    const boot = loadEvent(() => readFileSync(file, 'utf8'))
    assert.equal(boot.kind, 'ok')
    assert.equal(boot.kind === 'ok' && boot.state.version, 6)
    assert.equal(boot.kind === 'ok' && boot.migratedFrom, 3)
    const srv = await startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true })
    await srv.close()

    writeFileSync(file, '{not json')
    await assert.rejects(async () => startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true }), /event\.json could not be read/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('setShow is judge-only; the show state is audit-free and reaches the administrator payload', () => {
  const s = setup()
  const j = s.signIn('judge1')
  const g = s.register('cA', 'Ada')
  assert.equal(s.send('cA', g, { type: 'setShow', patch: { stage: 'teams' } }).status, 403)
  assert.equal(s.send('proj', null, { type: 'setShow', patch: { stage: 'nope' as never } }, { session: j.session }).ok, false)
  assert.equal(s.send('proj', null, { type: 'setShow', patch: { focus: 'SES-404' } }, { session: j.session }).ok, false)
  assert.equal(s.send('proj', null, { type: 'setShow', patch: { stage: 'teams' } }, { session: j.session }).ok, true)
  assert.deepEqual(s.host.event.show, { stage: 'teams', focus: null })
  assert.equal(s.host.event.audit.length, 0, 'show changes are not audited')
  let admin: Payload | null = null
  s.host.subscribe({ clientId: 'proj', gameId: null, admin: true, token: j.token, send: (p) => (admin = p) })
  assert.deepEqual(admin!.event.show, { stage: 'teams', focus: null })
})

test('a held pair stays ready until the host starts it; players cannot start it; the host start opens the full intro', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const j = s.signIn('judge1')
  const r = s.send('proj', null, { type: 'pairMatch', gameIds: [ga, gb], hold: true }, { session: j.session })
  assert.equal(r.ok, true, r.message)
  assert.equal(r.message, 'Match ready. Start it from the host console.')
  assert.equal(s.session(ga).status, 'ready')
  assert.equal(s.session(ga).sides.B.gameId, gb)
  const denied = s.send('cA', ga, { type: 'proceedToAuction' })
  assert.deepEqual([denied.ok, denied.status, denied.message], [false, 403, 'The host starts the auction.'])
  assert.equal(s.session(ga).status, 'ready')
  assert.equal(s.send('proj', ga, { type: 'proceedToAuction' }, { session: j.session }).ok, true)
  assert.equal(s.session(ga).status, 'live')
  assert.equal(currentLot(s.session(ga)).phase, 'intro')
  assert.deepEqual([s.host.event.show.stage, s.host.event.show.focus], ['auction', s.session(ga).sessionId], 'starting puts the room on the projector')
})

test('a held twist: players cannot continue or reveal it; the host reveal moves both stations to the twist', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const j = s.signIn('judge1')
  assert.equal(s.pair(ga, gb, j).ok, true)
  // Bob's station joins Side B before the auction: a finished auction cannot be joined.
  assert.equal(s.send('cB', gb, { type: 'joinSession', sessionId: s.session(ga).sessionId }).ok, true)
  const judge = (action: Request['action']) => s.send('proj', ga, action, { session: j.session })
  judge({ type: 'setClockRunning', running: true })
  for (let i = 0; i < 3; i++) {
    bid(s, 'cA', ga, 'A')
    assert.equal(s.send('cB', ga, { type: 'pass', side: 'B' }).ok, true)
    judge({ type: 'advanceLot' })
    judge({ type: 'setClockRunning', running: true })
  }
  for (let i = 0; i < 2; i++) {
    s.send('cA', ga, { type: 'pass', side: 'A' })
    s.send('cB', ga, { type: 'pass', side: 'B' })
    judge({ type: 'advanceLot' })
    judge({ type: 'setClockRunning', running: true })
  }
  assert.equal(s.session(ga).status, 'complete')
  assert.equal(s.host.event.participants[0].run!.phase, 'summary')

  const blocked = s.send('cA', ga, { type: 'continueToMission' })
  assert.equal(blocked.ok, false)
  assert.match(blocked.message, /host reveals the Timeline Twist/)
  assert.equal(s.send('cB', ga, { type: 'revealTwist' }).status, 403)

  let pA: Payload | null = null
  let pB: Payload | null = null
  s.watch('cA', ga, (p) => (pA = p))
  s.watch('cB', ga, (p) => (pB = p))
  assert.equal(judge({ type: 'revealTwist' }).ok, true)
  s.host.flush()
  assert.equal(pA!.event.participants[0].run!.phase, 'twist')
  assert.equal(pB!.event.participants[0].run!.phase, 'twist')
  assert.equal(s.send('cA', ga, { type: 'acknowledgeTwist' }).ok, true, 'the twist can be read and acknowledged as before')
})

test('/api/hello gives the join address other stations can open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-hello-'))
  const srv = await startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true })
  try {
    const body = (await (await fetch(`http://127.0.0.1:${srv.port}/api/hello`)).json()) as { ok: boolean; join: string | null }
    assert.equal(body.ok, true)
    assert.equal(body.join, lanUrls(srv.port)[0] ?? null)
    assert.ok(body.join === null || body.join.endsWith(`:${srv.port}`))
  } finally {
    await srv.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Game ID alone cannot read or act for a registration', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const j = s.signIn('judge1')
  assert.equal(s.pair(ga, gb, j).ok, true)
  s.send('proj', ga, { type: 'setClockRunning', running: true }, { session: j.session })

  let seen: Payload | null = null
  s.host.subscribe({ clientId: 'thief', gameId: ga, admin: false, send: (p) => (seen = p) })
  assert.deepEqual(seen!.event.participants, [], 'no key, no records')
  assert.equal(s.send('thief', ga, { type: 'bid', side: 'A', amount: nextValidBid(s.session(ga)) }, { key: null }).status, 403)
  assert.equal(s.send('thief', ga, { type: 'pass', side: 'A' }, { key: null }).status, 403)
  assert.equal(s.send('thief', ga, { type: 'bid', side: 'A', amount: nextValidBid(s.session(ga)) }, { key: `${ga}.${'0'.repeat(32)}` }).status, 403, 'forged key')
  assert.equal(s.send('cA', ga, { type: 'bid', side: 'A', amount: nextValidBid(s.session(ga)) }, { key: s.keyOf(ga) }).ok, true)
})

test('moving station needs a judge-issued, single-use, expiring resume code', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const j = s.signIn('judge1')
  assert.equal(s.send('new', null, { type: 'resume', code: 'DEADBEEF0042' }).status, 404)
  assert.equal(s.send('new', null, { type: 'issueResumeCode', gameId: ga }).status, 403, 'players cannot issue codes')
  assert.equal(s.send('proj', null, { type: 'issueResumeCode', gameId: 'GAME-NOPE' }, { session: j.session }).status, 404)
  const issued = s.send('proj', null, { type: 'issueResumeCode', gameId: ga }, { session: j.session })
  assert.equal(issued.ok, true)
  assert.match(issued.code ?? '', /^[0-9A-F]{12}$/)
  const back = s.send('new', null, { type: 'resume', code: ` ${issued.code!.toLowerCase()} ` }, { key: null })
  assert.deepEqual([back.ok, back.gameId], [true, ga])
  assert.notEqual(back.key, s.keyOf(ga), 'redeeming a code retires the old key')
  assert.deepEqual(s.host.snapshot({ clientId: 'cA', gameId: ga, key: s.keyOf(ga), admin: false }).event.participants, [], 'old key is dead')
  assert.equal(s.host.snapshot({ clientId: 'new', gameId: ga, key: back.key, admin: false }).event.participants.length, 1)
  assert.equal(s.send('new', null, { type: 'resume', code: issued.code! }).status, 404, 'single use')
  const late = s.send('proj', null, { type: 'issueResumeCode', gameId: ga }, { session: j.session })
  s.advance(10 * 60_000 + 1)
  assert.equal(s.send('new', null, { type: 'resume', code: late.code! }).status, 404, 'expired')
})

test('a station cannot take over an opponent’s side and sees no other side’s Game ID', () => {
  const s = setup()
  const [ga, gb, gc] = ['Ada', 'Bob', 'Cy'].map((n, i) => s.register(`c${i}`, n))
  const j = s.signIn('judge1')
  assert.equal(s.pairMany([ga, gb, gc], j).ok, true)
  const sid = s.session(ga).sessionId
  const own = s.send('c1', gb, { type: 'joinSession', sessionId: sid })
  assert.deepEqual([own.ok, own.side], [true, 'B'])
  assert.equal(s.send('evil', gc, { type: 'joinSession', sessionId: sid }, { key: null }).status, 403, 'a Game ID alone does not open Side C')
  const stolen = s.send('evil', gc, { type: 'joinSession', sessionId: sid }, { key: s.keyOf(gb) })
  assert.equal(stolen.side, 'B', 'the key decides the side, not the Game ID')
  assert.equal(s.send('evil2', ga, { type: 'bid', side: 'C', amount: nextValidBid(s.session(ga)) }, { key: s.keyOf(gb) }).status, 403)

  let pB: Payload | null = null
  s.watch('c1', ga, (p) => (pB = p))
  const sides = pB!.event.participants[0].run!.session!.sides
  assert.deepEqual(Object.values(sides).map((u) => u.gameId), [undefined, undefined, undefined])
})

test('players cannot see the twist, run ID or unopened lots before the reveal', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const gb = s.register('cB', 'Bob')
  const j = s.signIn('judge1')
  assert.equal(s.send('proj', null, { type: 'pairMatch', gameIds: [ga, gb], hold: true }, { session: j.session }).ok, true)
  const real = s.host.event.participants.find((p) => p.gameId === ga)!.run!
  let pB: Payload | null = null
  let admin: Payload | null = null
  s.watch('cB', ga, (p) => (pB = p))
  s.host.subscribe({ clientId: 'proj', gameId: null, admin: true, token: j.token, send: (p) => (admin = p) })
  const run = () => pB!.event.participants[0].run!
  assert.equal(run().twistId, '')
  assert.equal(run().runId, 'SEALED')
  assert.equal(run().session!.runId, 'SEALED')
  assert.ok(run().session!.lots.every((l) => l.techId === ''))
  const text = JSON.stringify(pB!.event)
  assert.equal(text.includes(real.runId), false)
  assert.equal(text.includes(`"${real.twistId}"`), false)
  assert.equal(admin!.event.participants.find((p) => p.gameId === ga)!.run!.runId, real.runId)

  const judge = (action: Request['action']) => s.send('proj', ga, action, { session: j.session })
  judge({ type: 'proceedToAuction' })
  judge({ type: 'setClockRunning', running: true })
  s.host.flush()
  const lots = run().session!.lots
  assert.notEqual(lots[0].techId, '')
  assert.equal(lots[1].techId, '')
  const seen = new Set(lots.map((l) => l.techId).filter(Boolean))
  assert.ok((run().session!.rules.offThemeTechIds ?? []).every((id) => seen.has(id)))

  s.host.event.participants.find((p) => p.gameId === ga)!.run!.session!.status = 'complete'
  s.host.event.participants.find((p) => p.gameId === ga)!.run!.phase = 'summary'
  assert.equal(judge({ type: 'revealTwist' }).ok, true)
  s.host.flush()
  assert.equal(run().twistId, real.twistId)
  assert.equal(run().runId, real.runId)
})

test('registrations are limited per station address; loopback (the host PC) is exempt', () => {
  const s = setup()
  const reg = (ip: string, i: number) => s.send(`c${ip}${i}`, null, { type: 'register', input: { name: `P ${ip} ${i}`, mode: 'individual', teamName: '', teammates: [] } }, { ip })
  assert.equal(reg('10.0.0.7', 1).ok, true)
  assert.equal(reg('10.0.0.7', 2).ok, true)
  assert.equal(reg('10.0.0.7', 3).status, 429)
  assert.equal(reg('10.0.0.8', 1).ok, true)
  for (let i = 0; i < 5; i++) assert.equal(reg('127.0.0.1', i).ok, true)
})

test('a judge can end a stale match that blocks matchmaking; its players fall back to their own record', () => {
  const s = setup()
  const [ga, gb, gc, gd] = ['Ada', 'Bob', 'Cy', 'Dee'].map((n, i) => s.register(`c${i}`, n))
  const j = s.signIn('judge1')
  assert.equal(s.send('proj', null, { type: 'pairMatch', gameIds: [ga, gb], hold: true }, { session: j.session }).ok, true)
  assert.equal(s.pair(gc, gd, j).status, 409)
  assert.equal(s.send('proj', ga, { type: 'cancelRun', gameId: ga, reason: 'stale match' }, { session: j.session }).ok, true)
  assert.equal(s.pair(gc, gd, j).ok, true)
  let pB: Payload | null = null
  s.watch('c1', ga, (p) => (pB = p))
  assert.deepEqual(pB!.event.participants, [])
})

test('createHost refuses a short or empty secret (fails closed)', () => {
  const auth = createAuth({ now: () => T0, superPassword: '424242' })
  const initial = emptyEvent(new Date(T0).toISOString())
  assert.throws(() => createHost({ initial, auth, secret: '' }), /secret/)
  assert.throws(() => createHost({ initial, auth, secret: 'short' }), /secret/)
})

test('an empty server-secret file is replaced by a fresh secret', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-secret-'))
  try {
    writeFileSync(join(dir, 'server-secret'), '  \n')
    const srv = await startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true })
    await srv.close()
    assert.ok(readFileSync(join(dir, 'server-secret'), 'utf8').trim().length >= 32)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a participant stream’s leaderboard carries no other player’s Game ID or run ID', () => {
  const s = setup()
  const g = s.ivi('host', 'Ada')
  const act = (action: Action) => s.send('host', g, action)
  const j = s.signIn('judge1')
  const run = (action: Action) => s.send('proj', g, action, { session: j.session })
  for (let i = 0; i < 3; i++) {
    bid(s, 'host', g, 'A')
    act({ type: 'pass', side: 'B' })
    run({ type: 'advanceLot' })
    run({ type: 'setClockRunning', running: true })
  }
  for (let i = 0; i < 2; i++) {
    act({ type: 'pass', side: 'A' })
    act({ type: 'pass', side: 'B' })
    run({ type: 'advanceLot' })
    run({ type: 'setClockRunning', running: true })
  }
  act({ type: 'continueToMission' })
  act({ type: 'acknowledgeTwist' })
  act({ type: 'startSolution', side: 'A' })
  act({ type: 'updateDraft', side: 'A', draft: { techIds: [...s.session(g).sides.A.portfolio], characteristics: ['sustainable'], text: WORDS } })
  act({ type: 'submitSolution', side: 'A' })
  const sub = s.host.event.participants[0].run!.solutions.A!.submission!
  for (const type of ['queueSubmission', 'verifyScore', 'publishScore'] as const) {
    if (type === 'verifyScore') run({ type: 'submitScores', submissionId: sub.submissionId, entries })
    assert.equal(run({ type, submissionId: sub.submissionId }).ok, true, type)
  }
  const runId = s.host.event.participants[0].run!.runId
  let p: Payload | null = null
  s.watch('other', null, (x) => (p = x))
  assert.equal(p!.leaderboard.length, 1)
  assert.equal(JSON.stringify(p).includes(g), false, 'no Game ID')
  assert.equal(JSON.stringify(p).includes(runId), false, 'no run ID')
  let own: Payload | null = null
  s.watch('host', g, (x) => (own = x))
  assert.equal(own!.leaderboard[0].gameId, g, 'own row stays identifiable')
})

test('resume codes are 12 hex chars and a failed resume is not cached', () => {
  const s = setup()
  const ga = s.register('cA', 'Ada')
  const j = s.signIn('judge1')
  const issued = s.send('proj', null, { type: 'issueResumeCode', gameId: ga }, { session: j.session })
  assert.match(issued.code ?? '', /^[0-9A-F]{12}$/)
  const bad = s.host.dispatch({ requestId: 'same', clientId: 'n', gameId: null, action: { type: 'resume', code: issued.code! } })
  assert.equal(bad.ok, true)
  const issued2 = s.send('proj', null, { type: 'issueResumeCode', gameId: ga }, { session: j.session })
  const first = s.host.dispatch({ requestId: 'retry', clientId: 'n', gameId: null, action: { type: 'resume', code: 'NOPE' } })
  assert.equal(first.status, 404)
  const second = s.host.dispatch({ requestId: 'retry', clientId: 'n', gameId: null, action: { type: 'resume', code: issued2.code! } })
  assert.equal(second.ok, true, 'same request ID with a valid code is not answered from a cached failure')
})

test('a bid or pass without a valid side is 400', () => {
  const s = setup()
  const g = s.ivi('cA', 'Ada')
  assert.equal(s.send('cA', g, { type: 'bid' } as never).status, 400)
  assert.equal(s.send('cA', g, { type: 'pass', side: 'Z' } as never).status, 400)
  // Prototype keys are not sides, even for a judge (who skips the station-key check).
  const j = s.signIn('judge1')
  for (const side of ['__proto__', 'constructor'])
    for (const type of ['startSolution', 'updateDraft'])
      assert.equal(s.send('cJ', g, { type, side, draft: {} } as never, { session: j.session }).status, 400, `${type} ${side}`)
})

test('judge-run registrations do not count toward the per-address limit', () => {
  const s = setup()
  const j = s.signIn('judge1')
  const reg = (c: string, extra: object) => s.send(c, null, { type: 'register', input: { name: c, mode: 'individual', teamName: '', teammates: [] } }, { ip: '10.0.0.9', ...extra })
  for (let i = 0; i < 3; i++) assert.equal(reg(`j${i}`, { session: j.session }).ok, true)
  assert.equal(reg('p1', {}).ok, true)
})

/** Ada (cA) vs Bob (cB, joined), Ada wins every lot, twist revealed. */
function finished(s: ReturnType<typeof setup>) {
  const { ga, gb, sid } = s.duo('cA', 'cB')
  assert.equal(s.send('cB', gb, { type: 'joinSession', sessionId: sid }).ok, true)
  const j = s.signIn('judge1')
  const judge = (a: Request['action']) => s.send('proj', ga, a, { session: j.session })
  for (let i = 0; i < 5; i++) {
    bid(s, 'cA', ga, 'A')
    s.send('cB', ga, { type: 'pass', side: 'B' })
    judge({ type: 'advanceLot' })
    judge({ type: 'setClockRunning', running: true })
  }
  assert.equal(s.session(ga).status, 'complete')
  assert.equal(judge({ type: 'revealTwist' }).ok, true)
  return { ga, gb, j, judge }
}

test('malformed or oversized input is refused with 400 and stores nothing', () => {
  const s = setup()
  const d = (requestId: string, clientId: string, action: unknown, gameId: string | null = null) => s.host.dispatch({ requestId, clientId, gameId, action } as never)
  const input = (o: object) => ({ type: 'register', input: { name: 'Ok', mode: 'individual', teamName: '', teammates: [], ...o } })
  assert.equal(d('m1', 'c', input({ name: 'x'.repeat(10_000) })).status, 400)
  assert.equal(d('m2', 'c', input({ name: 42 })).status, 400)
  assert.equal(d('m3', 'c', input({ mode: 'team', teamName: 'T', teammates: Array(1000).fill('m') })).status, 400)
  assert.equal(d('m4', 'c'.repeat(500), input({})).status, 400)
  assert.equal(d('m5', 'c', { type: 'hello' }).status, 400)
  assert.equal(s.host.event.participants.length, 0)
  const g = s.ivi('cA', 'Ada')
  assert.equal(d('m6', 'cA', { type: 'updateDraft', side: 'A', draft: { techIds: [], characteristics: [], text: 'x'.repeat(100_000) } }, g).status, 400)
  assert.equal(d('m7', 'cA', { type: 'updateDraft', side: 'A', draft: { techIds: [], characteristics: ['nope'], text: '' } }, g).status, 400)
})

test('replies are cached per station, and refusals are never cached', () => {
  const s = setup()
  const reg = (name: string): Request['action'] => ({ type: 'register', input: { name, mode: 'individual', teamName: '', teammates: [] } })
  const r1 = s.host.dispatch({ requestId: 'FIXED', clientId: 'cA', gameId: null, action: reg('Zed') })
  const r2 = s.host.dispatch({ requestId: 'FIXED', clientId: 'evil', gameId: null, action: reg('Eve') })
  assert.equal(r2.ok, true)
  assert.notEqual(r2.key, r1.key)
  assert.equal(s.host.event.participants.length, 2)
  const fb = { overall: 3, auctionClarity: 3, missionDifficulty: 3, comment: '' }
  const act = { type: 'saveFeedback', runId: 'R', input: fb } as const
  assert.equal(s.host.dispatch({ requestId: 'R', clientId: 'cA', gameId: r1.gameId!, key: null, action: act }).status, 403)
  assert.notEqual(s.host.dispatch({ requestId: 'R', clientId: 'cA', gameId: r1.gameId!, key: r1.key, action: act }).status, 403)
})

test('matchmates see whether the other side submitted, never its draft or solution', () => {
  const s = setup()
  const { ga, judge } = finished(s)
  let pA: Payload | null = null
  let pB: Payload | null = null
  s.watch('cA', ga, (p) => (pA = p))
  s.watch('cB', ga, (p) => (pB = p))
  assert.equal(s.send('cA', ga, { type: 'acknowledgeTwist' }).ok, true)
  assert.equal(s.send('cA', ga, { type: 'startSolution', side: 'A' }).ok, true)
  const portfolio = [...s.session(ga).sides.A.portfolio]
  const draft = { techIds: portfolio.slice(0, s.session(ga).rules.solutionTechCount), characteristics: ['sustainable' as const], text: 'SECRET ' + WORDS }
  assert.equal(s.send('cA', ga, { type: 'updateDraft', side: 'A', draft }).ok, true)
  s.host.flush()
  assert.equal(pB!.event.participants[0].run!.solutions.A!.draft.text, '')
  assert.deepEqual(pB!.event.participants[0].run!.solutions.A!.draft.techIds, [])
  assert.ok(pA!.event.participants[0].run!.solutions.A!.draft.text.startsWith('SECRET'))
  assert.equal(s.send('cA', ga, { type: 'submitSolution', side: 'A' }).ok, true)
  s.host.flush()
  const real = s.host.event.participants[0].run!.solutions.A!.submission!
  const seen = pB!.event.participants[0].run!.solutions.A!.submission
  assert.equal(seen?.submissionId, real.submissionId)
  assert.equal(seen!.text, '')
  assert.equal(seen!.wordCount, 0)
  assert.ok(real.wordCount > 0)
  assert.deepEqual(seen!.selectedTechIds, [])
  assert.ok(pA!.event.participants[0].run!.solutions.A!.submission!.text.startsWith('SECRET'))
  void judge
})

test('scores reach players as status until published, without judge names; notes only for the own side; a guest gets its own record', () => {
  const s = setup()
  const { ga, judge } = finished(s)
  let pA: Payload | null = null
  let pB: Payload | null = null
  s.watch('cA', ga, (p) => (pA = p))
  s.watch('cB', ga, (p) => (pB = p))
  s.send('cA', ga, { type: 'acknowledgeTwist' })
  s.send('cA', ga, { type: 'startSolution', side: 'A' })
  const draft = { techIds: [...s.session(ga).sides.A.portfolio].slice(0, s.session(ga).rules.solutionTechCount), characteristics: ['sustainable' as const], text: WORDS }
  s.send('cA', ga, { type: 'updateDraft', side: 'A', draft })
  assert.equal(s.send('cA', ga, { type: 'submitSolution', side: 'A' }).ok, true)
  const sub = s.host.event.participants[0].run!.solutions.A!.submission!
  const noted = Object.fromEntries(RUBRIC.map((c) => [c.id, { score: c.max - 2, note: 'PRIVATE' }])) as typeof entries
  assert.equal(judge({ type: 'queueSubmission', submissionId: sub.submissionId }).ok, true)
  assert.equal(judge({ type: 'submitScores', submissionId: sub.submissionId, entries: noted }).ok, true)
  s.host.flush()
  const rec = (p: Payload | null) => Object.values(p!.event.scores)[0]
  assert.equal(rec(pA)?.status, 'scored')
  for (const e of Object.values(rec(pA)!.entries)) assert.deepEqual(e, { score: null, note: '' })
  assert.equal(rec(pA)!.scoredBy, undefined)
  assert.equal(rec(pA)!.queuedBy, '')
  assert.deepEqual(rec(pA)!.corrections, [])
  assert.equal(rec(pB)?.status, 'scored')
  assert.equal(pB!.event.participants[0].player.name, 'Bob')
  assert.deepEqual(pB!.event.participants[0].pastRuns, [])
  assert.equal(judge({ type: 'verifyScore', submissionId: sub.submissionId }).ok, true)
  assert.equal(judge({ type: 'publishScore', submissionId: sub.submissionId }).ok, true)
  s.host.flush()
  assert.deepEqual(rec(pA)!.entries.relevance, { score: 18, note: 'PRIVATE' })
  assert.equal(rec(pA)!.publishedBy, undefined)
  assert.deepEqual(rec(pB)!.entries.relevance, { score: 18, note: '' })
})

test('each station gives its own feedback once; a matchmate cannot use up the host’s slot', () => {
  const s = setup()
  const { ga, gb } = finished(s)
  const runId = s.host.event.participants[0].run!.runId
  const fb = { overall: 4, auctionClarity: 4, missionDifficulty: 4, comment: 'ok' }
  const give = (c: string) => s.send(c, ga, { type: 'saveFeedback', runId, input: fb })
  assert.equal(give('cB').ok, true)
  assert.equal(give('cB').ok, false)
  assert.equal(give('cA').ok, true)
  assert.deepEqual(s.host.event.feedback.map((f) => f.gameId), [gb, ga])
  let pA: Payload | null = null
  let pB: Payload | null = null
  s.watch('cA', ga, (p) => (pA = p))
  s.watch('cB', ga, (p) => (pB = p))
  assert.deepEqual(pA!.event.feedback.map((f) => f.gameId), [ga])
  assert.deepEqual(pB!.event.feedback.map((f) => f.gameId), [gb])
})

test('a redeemed resume code retires the old key; the new PC can retake Side B while the old tab is open; leaving retires a key', () => {
  const s = setup()
  const { ga, gb, sid } = s.duo('cA', 'cB')
  assert.equal(s.send('cB', gb, { type: 'joinSession', sessionId: sid }).ok, true)
  const j = s.signIn('judge1')
  let old: Payload | null = null
  s.watch('cB', ga, (p) => (old = p))
  assert.equal(old!.event.participants.length, 1)
  const code = s.send('proj', null, { type: 'issueResumeCode', gameId: gb }, { session: j.session }).code!
  const moved = s.send('cB2', null, { type: 'resume', code }, { key: null })
  assert.equal(moved.ok, true)
  assert.notEqual(moved.key, s.keyOf(gb))
  s.host.flush()
  assert.deepEqual(old!.event.participants, [])
  assert.equal(s.send('cB', ga, { type: 'pass', side: 'B' }).status, 403)
  assert.equal(s.send('cB2', gb, { type: 'joinSession', sessionId: sid }, { key: moved.key }).ok, true)
  assert.equal(s.send('cB2', ga, { type: 'pass', side: 'B' }, { key: moved.key }).ok, true)
  assert.equal(s.send('cA', ga, { type: 'leaveStation' }).ok, true)
  assert.equal(s.send('cA', ga, { type: 'pass', side: 'A' }).status, 403)
})

test('a retired key stays retired after a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-keys-'))
  try {
    const opts = { port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true }
    const srv = await startServer(opts)
    const r = srv.host.dispatch({ requestId: 'k1', clientId: 'x', gameId: null, action: { type: 'register', input: { name: 'Ada', mode: 'individual', teamName: '', teammates: [] } } })
    const sub = (h: typeof srv.host) => h.snapshot({ clientId: 'x', gameId: r.gameId!, key: r.key, admin: false }).event.participants.length
    assert.equal(sub(srv.host), 1)
    assert.equal(srv.host.dispatch({ requestId: 'k2', clientId: 'x', gameId: null, key: r.key, action: { type: 'leaveStation' } }).ok, true)
    await srv.close()
    const again = await startServer(opts)
    try {
      assert.equal(sub(again.host), 0)
      assert.ok(readFileSync(join(dir, 'keys.json'), 'utf8').includes(r.gameId!))
    } finally {
      await again.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a judge name never reaches a player through a cancelled run', () => {
  const s = setup()
  const { ga } = s.duo('cA', 'cB')
  const j = s.signIn('judge1')
  assert.equal(s.send('proj', ga, { type: 'cancelRun', gameId: ga, reason: 'tablet died' }, { session: j.session }).ok, true)
  assert.equal(s.host.event.participants[0].pastRuns[0].cancelled!.by, 'judge1')
  let pA: Payload | null = null
  s.watch('cA', ga, (p) => (pA = p))
  assert.equal(pA!.event.participants[0].pastRuns[0].cancelled!.by, '')
  assert.equal(pA!.event.participants[0].pastRuns[0].cancelled!.reason, 'tablet died')
})

test('feedback input cannot forge the owner, the ID or add keys; the matchmate still gives his own', () => {
  const s = setup()
  const { ga, gb } = finished(s)
  const runId = s.host.event.participants[0].run!.runId
  const input = { overall: 4, auctionClarity: 4, missionDifficulty: 4, comment: 'ok', gameId: gb, feedbackId: 'FORGED', junk: 'x'.repeat(50_000) }
  assert.equal(s.send('cA', ga, { type: 'saveFeedback', runId, input }).ok, true)
  const [f] = s.host.event.feedback
  assert.equal(f.gameId, ga)
  assert.notEqual(f.feedbackId, 'FORGED')
  assert.equal(Object.hasOwn(f, 'junk'), false)
  assert.equal(s.send('cB', ga, { type: 'saveFeedback', runId, input: { overall: 3, auctionClarity: 3, missionDifficulty: 3, comment: '' } }).ok, true)
  assert.deepEqual(s.host.event.feedback.map((x) => x.gameId), [ga, gb])
})

test('a junk bid is refused with 400 and never reaches the session log; a junk draft key is not stored', () => {
  const s = setup()
  const { ga, gb, sid } = s.duo('cA', 'cB')
  assert.equal(s.send('cB', gb, { type: 'joinSession', sessionId: sid }).ok, true)
  const before = s.session(ga).events.length
  assert.equal(s.send('cA', ga, { type: 'bid', side: 'A', amount: { x: 'y'.repeat(1000) } as never }).status, 400)
  assert.equal(s.send('cA', ga, { type: 'bid', side: 'A', amount: -1 }).status, 400)
  assert.equal(s.send('cA', ga, { type: 'bid', side: 'A'.repeat(500), amount: 5 }).status, 400)
  assert.equal(s.session(ga).events.length, before)
})

test('a draft stores only its three fields', () => {
  const s = setup()
  const { ga } = finished(s)
  s.send('cA', ga, { type: 'acknowledgeTwist' })
  s.send('cA', ga, { type: 'startSolution', side: 'A' })
  const draft = { techIds: [], characteristics: [], text: 'hi', junk: 'x'.repeat(5000) }
  assert.equal(s.send('cA', ga, { type: 'updateDraft', side: 'A', draft }).ok, true)
  assert.deepEqual(Object.keys(s.host.event.participants[0].run!.solutions.A!.draft).sort(), ['characteristics', 'techIds', 'text'])
})

test('an unclaimed side whose station key was retired shows as offline', () => {
  const s = setup()
  const { ga, gb, sid } = s.duo('cA', 'cB')
  assert.equal(s.send('cB', gb, { type: 'joinSession', sessionId: sid }).ok, true)
  let seenB: Payload | null = null
  s.watch('cB', ga, (p) => (seenB = p))
  s.watch('cA', ga, () => {})
  s.host.flush()
  assert.deepEqual(seenB!.offline[sid], [])
  assert.equal(s.send('cA', ga, { type: 'leaveStation' }).ok, true)
  s.host.flush()
  assert.deepEqual(seenB!.offline[sid], ['A'])
})

test('retiring a key reaches keys.json at once, not on the 200 ms timer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-keys-now-'))
  try {
    const srv = await startServer({ port: 0, dataDir: dir, adminPin: '424242', serveStatic: false, quiet: true })
    try {
      const r = srv.host.dispatch({ requestId: 'k1', clientId: 'x', gameId: null, action: { type: 'register', input: { name: 'Ada', mode: 'individual', teamName: '', teammates: [] } } })
      assert.equal(srv.host.dispatch({ requestId: 'k2', clientId: 'x', gameId: null, key: r.key, action: { type: 'leaveStation' } }).ok, true)
      assert.ok(readFileSync(join(dir, 'keys.json'), 'utf8').includes(r.gameId!))
    } finally {
      await srv.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('projector fit: judge-only, clamped, junk refused, not audited, and kept by resetEvent', () => {
  const s = setup()
  const j = s.signIn('judge1')
  const g = s.register('cA', 'Ada')
  const root = s.signIn('admin')
  assert.equal(s.send('cA', g, { type: 'setShow', patch: { display: { scale: 90 } as never } }).status, 403)
  assert.equal(s.host.event.show.display, undefined)
  const fit = { scale: 1000, top: -4, right: 99, bottom: 2.6, left: 3, guides: true }
  assert.equal(s.send('proj', null, { type: 'setShow', patch: { display: fit } }, { session: j.session }).ok, true)
  const want = { scale: 150, top: 0, right: 20, bottom: 3, left: 3, guides: true }
  assert.deepEqual(s.host.event.show.display, want)
  for (const display of [null, 'big', [], { scale: '90' }, { top: null }, { guides: 'yes' }])
    assert.equal(s.send('proj', null, { type: 'setShow', patch: { display } as never }, { session: j.session }).ok, false, JSON.stringify(display))
  assert.deepEqual(s.host.event.show.display, want)
  assert.equal(s.host.event.audit.length, 0)
  assert.equal(s.send('proj', null, { type: 'resetEvent' }, { session: root.session }).ok, true)
  assert.deepEqual(s.host.event.show.display, want)
})

test('a timed solution locks itself when the clock runs out, as written, even below the word minimum', () => {
  const s = setup()
  const { ga } = finished(s)
  assert.equal(s.send('cA', ga, { type: 'acknowledgeTwist' }).ok, true)
  assert.equal(s.send('cA', ga, { type: 'startSolution', side: 'A' }).ok, true)
  const sol = () => s.host.event.participants.find((p) => p.gameId === ga)!.run!.solutions.A!
  assert.notEqual(sol().deadline, null, 'server-paired matches are timed by default')
  const draft = { techIds: [s.session(ga).sides.A.portfolio[0], 'not-owned'], characteristics: [], text: 'only a few words here' }
  assert.equal(s.send('cA', ga, { type: 'updateDraft', side: 'A', draft }).ok, true)
  assert.equal(s.send('cA', ga, { type: 'autoSubmit', side: 'A' }).ok, false, 'not before the deadline')
  s.advance(sol().deadline! - Date.parse(sol().startedAt) + 1000)
  s.host.tickAll()
  assert.equal(sol().submission, null, 'the grace for the last draft save is still running')
  s.advance(5000)
  s.host.tickAll()
  const sub = sol().submission!
  assert.equal(sub.auto, true)
  assert.equal(sub.text, 'only a few words here')
  assert.deepEqual(sub.selectedTechIds, [draft.techIds[0]], 'technologies the side does not own are dropped')
  s.host.tickAll()
  assert.equal(sol().submission!.submissionId, sub.submissionId, 'locked once')
})
