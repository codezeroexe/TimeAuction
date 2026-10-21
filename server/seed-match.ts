/**
 * Dev seeding: registers N players on a running event server and pairs them into one match,
 * so a full room can be inspected on the projector view.
 *
 *   npm run seed:match              12 players
 *   npm run seed:match -- 6         6 players (2 to 12)
 *   BASE=http://192.168.1.20:8787 npm run seed:match -- 12
 *
 * Admin password: TIMEAUCTION_ADMIN_PIN, otherwise event-data/admin-pin. It is never printed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload, Reply } from './host.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.BASE ?? 'http://localhost:8787').replace(/\/$/, '')
const MAX_SIDES = 12

const count = process.argv[2] === undefined ? 12 : Number(process.argv[2])
if (!Number.isInteger(count) || count < 2 || count > MAX_SIDES) {
  console.error(`Pick a whole number of players from 2 to ${MAX_SIDES}, not "${process.argv[2]}".`)
  process.exit(1)
}

function adminPassword(): string {
  const fromEnv = process.env.TIMEAUCTION_ADMIN_PIN?.trim()
  if (fromEnv) return fromEnv
  const pinFile = join(root, 'event-data', 'admin-pin')
  if (existsSync(pinFile)) {
    const pin = readFileSync(pinFile, 'utf8').trim()
    if (pin) return pin
  }
  console.error('No admin password: set TIMEAUCTION_ADMIN_PIN or start the server once so event-data/admin-pin exists.')
  process.exit(1)
}

async function main() {
  const password = adminPassword()
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'admin', password }),
  }).catch(() => null)
  if (!login) throw new Error(`Cannot reach the event server at ${BASE}. Start it with npm run server.`)
  if (!login.ok) throw new Error(`Sign-in failed (${login.status}). Check the admin password.`)
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!

  let seq = 0
  const post = async (clientId: string, gameId: string | null, action: unknown, signedIn = false): Promise<Reply> => {
    const r = await fetch(`${BASE}/api/action`, {
      method: 'POST',
      headers: signedIn ? { 'content-type': 'application/json', cookie } : { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: `seed-${Date.now()}-${++seq}`, clientId, gameId, action }),
    })
    return (await r.json()) as Reply
  }

  const stamp = Date.now().toString(36).toUpperCase().slice(-4)
  const gameIds: string[] = []
  for (let i = 1; i <= count; i++) {
    const r = await post(`seed-${stamp}-${i}`, null, { type: 'register', input: { name: `Seed ${stamp}-${i}`, mode: 'individual', teamName: '', teammates: [] } })
    if (!r.ok || !r.gameId) throw new Error(`Register player ${i} failed: ${r.message}`)
    gameIds.push(r.gameId)
  }

  const paired = await post('seed-judge', null, { type: 'pairMatch', gameIds, rulesetId: 'normal', timed: true }, true)
  if (!paired.ok) throw new Error(`Pairing failed: ${paired.message}`)

  // The session ID is only in the signed-in view; read it from the admin stream once.
  const controller = new AbortController()
  const res = await fetch(`${BASE}/api/stream?client=seed-view`, { headers: { cookie }, signal: controller.signal })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let sessionId: string | undefined
  while (!sessionId) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const at = buf.indexOf('\n\n')
    if (at < 0) continue
    const data = buf.slice(0, at).split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
    buf = buf.slice(at + 2)
    if (!data) continue
    const p = JSON.parse(data) as Payload
    sessionId = p.event.participants.find((x) => x.gameId === gameIds[0])?.run?.session?.sessionId
  }
  controller.abort()
  if (!sessionId) throw new Error('The match was paired but its session could not be read.')

  console.log(`\nSeeded ${count} players in one match.`)
  console.log(`  Session ID   ${sessionId}`)
  console.log(`  Presentation ${BASE}/#/present   (sign in as a judge; the match shows as a room)`)
  console.log()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
