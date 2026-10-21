import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { randomBytes, randomInt } from 'node:crypto'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEvent } from '../src/state/storage.ts'
import { emptyEvent } from '../src/game/event.ts'
import { createHost, type Claims, type Host, type Request } from './host.ts'
import { createAuth, emptyJudges, parseJudges, type JudgesFile } from './auth.ts'

/**
 * TimeAuction event server: zero dependencies, Node 22.18+.
 *   POST /api/action   apply one action (idempotent per requestId)
 *   GET  /api/stream   Server-Sent Events: the subscriber's state, pushed on every change
 *   POST /api/login    {name, password} -> sets the ta_sid session cookie (HttpOnly)
 *   POST /api/logout   ends the session
 *   GET  /api/hello    reachability check
 * Also serves the built app from dist/ so every station only needs the host's address.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_BODY = 256 * 1024
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

export interface ServerOptions {
  port?: number
  dataDir?: string
  adminPin?: string
  now?: () => number
  serveStatic?: boolean
  quiet?: boolean
  /** Stress tests only: allow several matches at once (the event runs one at a time). */
  concurrentMatches?: boolean
  /** Registrations allowed per station address (0 = unlimited; loopback is exempt). Default: TIMEAUCTION_REGS_PER_IP or 0, since event PCs are shared by successive players. */
  registrationsPerIp?: number
}

/** Saves are coalesced and written atomically (temp file + rename), so a crash never leaves half a file. */
function persistence(dataDir: string) {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'event.json')
  const claimsFile = join(dataDir, 'claims.json')
  const keysFile = join(dataDir, 'keys.json')
  let pending: { ev: unknown; claims: Claims; keys: Record<string, number> } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  // A timestamped copy every 5 minutes (last 12 kept), so a damaged event.json costs at most 5 minutes of the event.
  const backupDir = join(dataDir, 'backups')
  const backup = () => {
    if (!existsSync(file)) return
    mkdirSync(backupDir, { recursive: true })
    copyFileSync(file, join(backupDir, `event-${new Date().toISOString().replace(/[:.]/g, '-')}.json`))
    for (const old of readdirSync(backupDir).filter((f) => f.startsWith('event-')).sort().slice(0, -12)) rmSync(join(backupDir, old))
  }
  const backupTimer = setInterval(() => {
    try {
      backup()
    } catch (e) {
      console.error('Backup failed:', e)
    }
  }, 5 * 60_000)
  backupTimer.unref()
  const write = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!pending) return
    const next = pending
    pending = null
    try {
      writeFileSync(file + '.tmp', JSON.stringify(next.ev))
      replaceFile(file + '.tmp', file)
      writeFileSync(claimsFile + '.tmp', JSON.stringify(next.claims))
      replaceFile(claimsFile + '.tmp', claimsFile)
      writeFileSync(keysFile + '.tmp', JSON.stringify(next.keys))
      replaceFile(keysFile + '.tmp', keysFile)
    } catch (e) {
      // Never crash the event over a save: keep the latest state and try again shortly.
      console.error(`Saving event data failed, retrying in 1 s: ${(e as Error).message}`)
      pending ??= next
      if (!closed) timer ??= setTimeout(write, 1000)
    }
  }
  return {
    file,
    /** The generated admin PIN is kept with the data, so judges stay signed in across a server restart. */
    pin() {
      const pinFile = join(dataDir, 'admin-pin')
      if (existsSync(pinFile)) return readFileSync(pinFile, 'utf8').trim()
      const pin = String(randomInt(100000, 1000000))
      writeFileSync(pinFile, pin)
      return pin
    },
    /** Secret behind the station keys, kept with the data so keys survive a server restart. */
    secret() {
      const secretFile = join(dataDir, 'server-secret')
      if (existsSync(secretFile)) {
        const stored = readFileSync(secretFile, 'utf8').trim()
        if (stored.length >= 32) return stored
      }
      const secret = randomBytes(32).toString('hex')
      writeFileSync(secretFile + '.tmp', secret, { mode: 0o600 })
      replaceFile(secretFile + '.tmp', secretFile)
      return secret
    },
    load() {
      const boot = loadEvent(() => (existsSync(file) ? readFileSync(file, 'utf8') : null))
      let claims: Claims = {}
      try {
        if (existsSync(claimsFile)) claims = JSON.parse(readFileSync(claimsFile, 'utf8'))
      } catch {
        claims = {}
      }
      // Retired station keys: an unreadable file stops the server, or old keys would silently work again.
      let keys: Record<string, number> = {}
      if (existsSync(keysFile)) {
        try {
          const k = JSON.parse(readFileSync(keysFile, 'utf8'))
          if (!k || typeof k !== 'object' || Array.isArray(k) || !Object.values(k).every((v) => Number.isInteger(v) && (v as number) >= 0)) throw new Error('not a map of key versions')
          keys = k
        } catch (e) {
          throw new Error(`${keysFile} could not be read (${(e as Error).message}). Move it aside, then start again (retired station keys will work again).`)
        }
      }
      return { boot, claims, keys }
    },
    save(ev: unknown, claims: Claims, keys: Record<string, number>) {
      if (closed) return
      pending = { ev, claims, keys }
      timer ??= setTimeout(write, 200)
    },
    saveKeys(keys: Record<string, number>) {
      try {
        writeFileSync(keysFile + '.tmp', JSON.stringify(keys))
        replaceFile(keysFile + '.tmp', keysFile)
      } catch (e) {
        console.error(`Saving station keys failed (the timed save retries): ${(e as Error).message}`)
      }
    },
    backup,
    /** Judge accounts. A missing file is an empty list; an unreadable one stops the server rather than being overwritten. */
    judges(): JudgesFile {
      const f = join(dataDir, 'judges.json')
      if (!existsSync(f)) return emptyJudges()
      try {
        return parseJudges(readFileSync(f, 'utf8'))
      } catch (e) {
        throw new Error(`${f} could not be read (${(e as Error).message}). Move it aside, then start again.`)
      }
    },
    saveJudges(j: JudgesFile) {
      const f = join(dataDir, 'judges.json')
      writeFileSync(f + '.tmp', JSON.stringify(j), { mode: 0o600 })
      replaceFile(f + '.tmp', f)
    },
    close() {
      clearInterval(backupTimer)
      write()
      closed = true
    },
  }
}

/**
 * Atomic replace that survives Windows: antivirus, Search indexing or OneDrive briefly lock a file,
 * and rename then fails with EPERM/EBUSY/EACCES. Retry a few times, then fall back to copy.
 */
export function replaceFile(tmp: string, dest: string) {
  for (let i = 0; i < 8; i++) {
    try {
      renameSync(tmp, dest)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (i + 1))
    }
  }
  copyFileSync(tmp, dest)
  rmSync(tmp, { force: true })
}

/** Addresses other stations can open this server on (IPv4, non-loopback). */
export function lanUrls(port: number): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a!.address}:${port}`)
}

const sid = (req: IncomingMessage) => /(?:^|;\s*)ta_sid=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1]
const cookie = (value: string, maxAge?: number) => `ta_sid=${value}; HttpOnly; SameSite=Strict; Path=/api${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        fail(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

const isJson = (req: IncomingMessage) => (req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')

const isRequest = (b: unknown): b is Request => {
  const r = b as Request
  return !!r && typeof r === 'object' && typeof r.requestId === 'string' && r.requestId.length <= 80 && typeof r.clientId === 'string' &&
    (r.gameId === null || typeof r.gameId === 'string') && (r.key === undefined || r.key === null || (typeof r.key === 'string' && r.key.length <= 200)) && !!r.action && typeof r.action.type === 'string'
}

function serveFile(res: ServerResponse, pathname: string) {
  const dist = join(root, 'dist')
  let file = normalize(join(dist, decodeURIComponent(pathname)))
  if (!file.startsWith(dist)) return json(res, 403, { message: 'Forbidden' })
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end('The app has not been built. Run "npm run event" (it builds first) or "npm run build".')
  }
  const immutable = file.includes(`${join('dist', 'assets')}`)
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
  res.end(readFileSync(file))
}

export function startServer(opts: ServerOptions = {}) {
  const store = persistence(opts.dataDir ?? join(root, 'event-data'))
  const { boot, claims, keys } = store.load()
  if (boot.kind === 'corrupt') {
    // Never overwrite an unreadable event file: stop and let the operator decide.
    throw new Error(`${store.file} could not be read (${boot.error}). Move it aside or restore a backup, then start again.`)
  }
  const superPassword = opts.adminPin || process.env.TIMEAUCTION_ADMIN_PIN?.trim() || store.pin()
  const auth = createAuth({ now: opts.now, judges: store.judges(), superPassword, save: (j) => store.saveJudges(j) })
  const host: Host = createHost({
    initial: boot.kind === 'ok' ? boot.state : emptyEvent(new Date().toISOString()),
    claims,
    keyVersions: keys,
    auth,
    log: opts.quiet ? undefined : (m) => console.log(m),
    now: opts.now,
    concurrentMatches: opts.concurrentMatches,
    secret: store.secret(),
    registrationsPerIp: opts.registrationsPerIp ?? Number(process.env.TIMEAUCTION_REGS_PER_IP || 0),
    save: (ev, c, k) => store.save(ev, c, k),
    saveKeys: (k) => store.saveKeys(k),
  })
  const ticker = setInterval(() => host.tickAll(), 100)

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (url.pathname === '/api/hello') return json(res, 200, { ok: true, eventId: host.event.eventId, eventName: host.event.settings.eventName, join: lanUrls(req.socket.localPort)[0] ?? null })

      if ((url.pathname === '/api/login' || url.pathname === '/api/action') && req.method === 'POST' && !isJson(req))
        return json(res, 415, { ok: false, message: 'Content-Type must be application/json.' })

      if (url.pathname === '/api/login' && req.method === 'POST') {
        let body: { name?: unknown; password?: unknown }
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          return json(res, 400, { ok: false, message: 'Request body is not valid JSON or is too large.' })
        }
        const r = auth.login(body?.name, body?.password, req.socket.remoteAddress ?? '')
        if (!r.ok) return json(res, r.status, { ok: false, message: r.message })
        // The token travels only in the HttpOnly cookie, never in the body or a URL.
        return json(res, 200, { ok: true, name: r.name, superadmin: r.superadmin }, { 'set-cookie': cookie(r.token) })
      }

      if (url.pathname === '/api/logout' && req.method === 'POST') {
        auth.logout(sid(req))
        host.kick()
        return json(res, 200, { ok: true }, { 'set-cookie': cookie('', 0) })
      }

      if (url.pathname === '/api/action' && req.method === 'POST') {
        let body: unknown
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          return json(res, 400, { ok: false, message: 'Request body is not valid JSON or is too large.' })
        }
        if (!isRequest(body)) return json(res, 400, { ok: false, message: 'Malformed request.' })
        // Identity comes from the cookie only: anything the body claims is dropped.
        const { session: _s, pin: _p, operator: _o, ip: _i, ...clean } = body as Request & { pin?: unknown; operator?: unknown; ip?: unknown }
        const reply = host.dispatch({ ...clean, ip: req.socket.remoteAddress ?? '', session: auth.session(sid(req)) })
        return json(res, reply.status ?? 200, reply)
      }

      if (url.pathname === '/api/stream' && req.method === 'GET') {
        const clientId = url.searchParams.get('client') ?? ''
        const gameId = url.searchParams.get('game') || null
        if (!clientId || clientId.length > 64) return json(res, 400, { message: 'client is required' })
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
        res.write('retry: 1500\n\n')
        const token = sid(req)
        const unsubscribe = host.subscribe({ clientId, gameId, key: url.searchParams.get('key'), admin: !!auth.session(token), token, live: url.searchParams.get('live') === '1', send: (p) => res.write(`data: ${JSON.stringify(p)}\n\n`) })
        const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20000)
        req.on('close', () => {
          clearInterval(keepAlive)
          unsubscribe()
        })
        return
      }

      if (url.pathname.startsWith('/api/')) return json(res, 404, { message: 'Not found' })
      if (opts.serveStatic === false) return json(res, 404, { message: 'Not found' })
      return serveFile(res, url.pathname)
    } catch (e) {
      if (!opts.quiet) console.error(e)
      if (!res.headersSent) json(res, 500, { ok: false, message: 'The event server hit an unexpected error. Nothing was recorded for this request.' })
    }
  })
  server.keepAliveTimeout = 65000

  return new Promise<{ host: Host; superPassword: string; port: number; close: () => Promise<void> }>((ok) => {
    server.listen(opts.port ?? 8787, '0.0.0.0', () => {
      const port = (server.address() as { port: number }).port
      ok({
        host,
        superPassword,
        port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(ticker)
            server.closeAllConnections()
            server.close(() => {
              store.close()
              done()
            })
          }),
      })
    })
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787)
  try {
    const { superPassword, close } = await startServer({ port })
    const addresses = lanUrls(port)
    console.log(`\nTimeAuction event server running`)
    console.log(`  This machine:   http://localhost:${port}`)
    for (const a of addresses) console.log(`  Other stations: ${a}`)
    console.log(`  Superadmin: user "admin", password ${superPassword} (locked out? sign in on this PC)${process.env.TIMEAUCTION_ADMIN_PIN?.trim() ? ' (from TIMEAUCTION_ADMIN_PIN)' : ' (stored in event-data/admin-pin; set TIMEAUCTION_ADMIN_PIN to choose your own)'}`)
    console.log(`  Event data:     ${join(root, 'event-data', 'event.json')}\n`)
    const stop = () => close().then(() => process.exit(0))
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  } catch (e) {
    console.error(`\n${(e as Error).message}\n`)
    process.exit(1)
  }
}
