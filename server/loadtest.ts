/**
 * Load test: about 34 simulated stations play complete auctions at the same time against a real event server.
 *   2 rooms of 12 stations (12-side matches), 1 room of 6 (6-side match), 2 rooms of 2 (2-side).
 *   The admin pairs each room with pairMatch; every other station joins its side from its own `paired` field.
 *   Each station holds a live Server-Sent Events stream and reacts to it. No station drives the clock: the server
 *   runs every lot's intro, bidding and result pause by itself, and the stations only bid or pass while bidding is open.
 *
 *   npm run loadtest                     starts a private server on a free port (Normal rules)
 *   npm run loadtest -- http://host:8787  runs against an already running server (needs TIMEAUCTION_ADMIN_PIN)
 *
 * Exits non-zero on any integrity error, unreconciled wallet, incomplete session, network failure, or p95 bid ack above 300 ms.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './index.ts'
import type { Payload, Reply } from './host.ts'
import { currentLot, nextValidBid } from '../src/game/auction.ts'
import { checkSession } from '../src/game/integrity.ts'
import { summarise } from '../src/game/summary.ts'
import type { Session, SideId } from '../src/game/types.ts'

const external = process.argv[2]
const PIN = process.env.TIMEAUCTION_ADMIN_PIN ?? '777777'
const RULESET = 'normal'
const P95_LIMIT_MS = 300
const dir = external ? null : mkdtempSync(join(tmpdir(), 'chrono-load-'))
const server = external ? null : await startServer({ port: 0, dataDir: dir!, adminPin: PIN, serveStatic: false, quiet: true, concurrentMatches: true })
const base = external ?? `http://127.0.0.1:${server!.port}`

// Sign in once as the superadmin and reuse the session cookie for the matchmaking calls.
const loginRes = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'admin', password: PIN }) })
if (!loginRes.ok) throw new Error(`Login failed (${loginRes.status}); check TIMEAUCTION_ADMIN_PIN.`)
const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]

const requestLatencies: number[] = []
const bidLatencies: number[] = []
let requests = 0
let failures = 0
let seq = 0

/** Only the matchmaking call carries the admin cookie: a signed-in judge cannot bid, so players never send it. */
async function post(clientId: string, gameId: string | null, action: unknown, opts: { signedIn?: boolean; bid?: boolean; key?: string } = {}) {
  const t = performance.now()
  requests++
  try {
    const r = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: opts.signedIn ? { 'content-type': 'application/json', cookie } : { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: `${clientId}-${++seq}`, clientId, gameId, key: opts.key, action }),
    })
    const body = (await r.json()) as Reply
    const ms = performance.now() - t
    requestLatencies.push(ms)
    if (opts.bid) bidLatencies.push(ms)
    return body
  } catch (e) {
    failures++
    return { ok: false, message: String(e) } as Reply
  }
}

interface Station {
  id: string
  /** Station key from the registration reply; sent with every action and stream. */
  key: string
  /** The Game ID this station views: its own, or the host's once a guest has joined (as the client does). */
  gameId: string
  /** Room label for payload stats: 12, 6 or 2. */
  room: number
  side: SideId | null
  session: Session | null
  paired: string | null
  pushes: number
  close: () => void
}

/** A live SSE subscription. `onPayload` gets the parsed state and its JSON size in bytes. */
function openStream(clientId: string, query: string, headers: Record<string, string>, onPayload: (p: Payload, bytes: number) => void) {
  const ctrl = new AbortController()
  const ready = fetch(`${base}/api/stream?client=${clientId}${query}`, { headers, signal: ctrl.signal }).then(async (res) => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buf += decoder.decode(value, { stream: true })
        let at
        while ((at = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, at)
          buf = buf.slice(at + 2)
          const data = chunk.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
          if (data) onPayload(JSON.parse(data) as Payload, Buffer.byteLength(data, 'utf8'))
        }
      }
    } catch {
      // aborted at the end of the run
    }
  })
  return { close: () => ctrl.abort(), ready }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const roomStats = new Map<number, { maxBytes: number; pushes: number }>()
const stat = (room: number) => {
  let s = roomStats.get(room)
  if (!s) roomStats.set(room, (s = { maxBytes: 0, pushes: 0 }))
  return s
}

/** Opens (or re-opens) one station's stream and keeps its latest session and paired match up to date. */
function attach(st: Station, gameId: string) {
  st.close()
  st.gameId = gameId
  st.session = null
  st.close = openStream(st.id, `&game=${gameId}&key=${encodeURIComponent(st.key)}`, {}, (p, bytes) => {
    st.pushes++
    const rs = stat(st.room)
    rs.pushes++
    rs.maxBytes = Math.max(rs.maxBytes, bytes)
    st.session = p.event.participants[0]?.run?.session ?? null
    st.paired = p.paired?.sessionId ?? null
  }).close
}

function station(id: string, gameId: string, key: string, room: number): Station {
  const st: Station = { id, key, gameId, room, side: null, session: null, paired: null, pushes: 0, close: () => {} }
  attach(st, gameId)
  return st
}

async function waitFor<T>(what: string, pick: () => T | null | undefined, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const v = pick()
    if (v) return v
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`)
    await sleep(50)
  }
}

/** Plays one side until the session completes: bids up to a cap per lot (passing when over it), otherwise passes. */
async function play(st: Station, cap: number) {
  const deadline = Date.now() + 15 * 60_000
  while (Date.now() < deadline) {
    await sleep(150 + Math.random() * 350)
    const s = st.session
    if (!s || s.status === 'ready') continue
    if (s.status === 'complete') return
    const side = st.side!
    const lot = currentLot(s)
    // Intro, result pause or paused: nothing to do; the server moves the lot on by itself.
    if (lot.status !== 'open' || lot.phase !== 'open' || !lot.running) continue
    if (lot.leader === side || lot.passed.includes(side)) continue
    const next = nextValidBid(s)
    if (next <= cap && next <= s.sides[side]!.wallet.balance) {
      const r = await post(st.id, st.gameId, { type: 'bid', side, amount: next }, { bid: true, key: st.key })
      // A refused bid (lot closed, portfolio cap, wallet) is answered with a pass so the station never spins.
      if (!r.ok) await post(st.id, st.gameId, { type: 'pass', side }, { key: st.key })
    } else await post(st.id, st.gameId, { type: 'pass', side }, { key: st.key })
  }
  throw new Error(`${st.id} did not see its session complete`)
}

const started = performance.now()
const stations: Station[] = []
const register = async (clientId: string, name: string, room: number) => {
  const r = await post(clientId, null, { type: 'register', input: { name, mode: 'individual', teamName: '', teammates: [] } })
  if (!r.gameId) throw new Error(`register failed: ${r.message}`)
  const st = station(clientId, r.gameId, r.key ?? '', room)
  stations.push(st)
  return st
}

// Room plan: each entry is one match; the first station hosts (Side A), the rest join their own side.
const rooms: { label: string; size: number }[] = [
  { label: 'room-12a', size: 12 },
  { label: 'room-12b', size: 12 },
  { label: 'room-6', size: 6 },
  { label: 'duo-0', size: 2 },
  { label: 'duo-1', size: 2 },
]

const sessions: { label: string; room: number; host: Station; members: Station[] }[] = []
const runs: Promise<void>[] = []

// Register every station first, then pair. Registration is cheap; the pairing flow is what is under test.
const plan = await Promise.all(
  rooms.map(async (room) => {
    const members = await Promise.all(Array.from({ length: room.size }, (_, i) => register(`${room.label}-${i}`, `${room.label} ${i}`, room.size)))
    return { ...room, members }
  }),
)

for (const room of plan) {
  const gameIds = room.members.map((m) => m.gameId)
  const paired = await post('loadtest-judge', null, { type: 'pairMatch', gameIds, rulesetId: RULESET, timed: true }, { signedIn: true })
  if (!paired.ok) throw new Error(`pair failed (${room.label}): ${paired.message}`)
  const host = room.members[0]!
  host.side = 'A'
  sessions.push({ label: room.label, room: room.size, host, members: room.members })
}

// Guests learn their match from their own stream (`paired`) and join with their own Game ID.
for (const sess of sessions) {
  for (const guest of sess.members.slice(1)) {
    const sid = await waitFor(`paired for ${guest.id}`, () => guest.paired)
    const join = await post(guest.id, guest.gameId, { type: 'joinSession', sessionId: sid }, { key: guest.key })
    if (!join.ok) throw new Error(`join failed (${guest.id}): ${join.message}`)
    guest.side = join.side ?? null
    // The client switches to the host's Game ID after joining; the guest's view is then the shared match.
    attach(guest, join.gameId!)
  }
}
// Each station knows its side once its session view shows it; resolve from the session itself.
for (const sess of sessions) {
  const s = await waitFor(`session for ${sess.label}`, () => sess.host.session)
  for (const m of sess.members) {
    if (m.side) continue
    m.side = (Object.keys(s.sides) as SideId[]).find((id) => s.sides[id].gameId === m.gameId) ?? null
  }
}

// Human sides play; nobody drives the clock.
for (const sess of sessions) {
  for (const m of sess.members) {
    const cap = 260 + Math.floor(Math.random() * 300)
    runs.push(play(m, cap))
  }
}

await Promise.all(runs)
const elapsed = (performance.now() - started) / 1000

// Verify every session from the administrator's full view.
const adminView = await new Promise<Payload>((resolve) => {
  openStream('load-admin', '', { cookie }, (p) => resolve(p))
})

let complete = 0
let issues = 0
let unreconciled = 0
let negative = 0
let duplicates = 0
for (const sess of sessions) {
  const s = adminView.event.participants.find((p) => p.gameId === sess.host.gameId)!.run!.session!
  if (s.status === 'complete') complete++
  issues += checkSession(s).filter((x) => x.severity === 'error').length
  for (const u of Object.values(summarise(s))) if (!u.reconciled) unreconciled++
  const owners = s.lots.filter((l) => l.status === 'sold').map((l) => l.techId)
  if (new Set(owners).size !== owners.length) duplicates++
  for (const id of Object.keys(s.sides) as SideId[]) if (s.sides[id].wallet.balance < 0) negative++
}

const pct = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : 0
}
const bidP95 = pct(bidLatencies, 0.95)
const pushes = stations.reduce((a, s) => a + s.pushes, 0)
const totalSides = plan.reduce((a, r) => a + r.members.length, 0)

console.log(`\n${totalSides} stations · ${sessions.length} sessions (2×12, 1×6 human rooms; 2×2 human rooms) · ${RULESET} rules`)
console.log(`  duration                  ${elapsed.toFixed(1)} s`)
console.log(`  bid ack p50 / p95 / max   ${pct(bidLatencies, 0.5).toFixed(1)} / ${bidP95.toFixed(1)} / ${Math.max(0, ...bidLatencies).toFixed(1)} ms (${bidLatencies.length} bids)`)
console.log(`  all requests p50 / p95 / max  ${pct(requestLatencies, 0.5).toFixed(1)} / ${pct(requestLatencies, 0.95).toFixed(1)} / ${Math.max(0, ...requestLatencies).toFixed(1)} ms (${requests} requests, ${failures} network failures)`)
console.log(`  state pushes received     ${pushes}`)
for (const room of [12, 6, 2]) {
  const rs = roomStats.get(room)
  if (rs) console.log(`  payload, ${String(room)}-side room${room === 12 ? '' : ' '}   max ${(rs.maxBytes / 1024).toFixed(1)} KB (${rs.pushes} pushes)`)
}
console.log(`  sessions complete         ${complete} / ${sessions.length}`)
console.log(`  integrity errors          ${issues}`)
console.log(`  unreconciled wallets      ${unreconciled}`)
console.log(`  negative wallets          ${negative}`)
console.log(`  duplicate tech owners     ${duplicates}\n`)

const ok = complete === sessions.length && issues === 0 && unreconciled === 0 && negative === 0 && duplicates === 0 && failures === 0 && bidP95 <= P95_LIMIT_MS
if (bidP95 > P95_LIMIT_MS) console.log(`FAIL: bid ack p95 ${bidP95.toFixed(1)} ms is over ${P95_LIMIT_MS} ms`)

for (const st of stations) st.close()
await server?.close()
if (dir) rmSync(dir, { recursive: true, force: true })
process.exit(ok ? 0 : 1)
