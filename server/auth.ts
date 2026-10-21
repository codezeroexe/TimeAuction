import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Judge accounts and sessions. Pure: no file or HTTP access, the caller persists via save().
 * Sessions live in memory only (a server restart signs everyone out).
 */

export interface JudgeRecord {
  name: string
  salt: string
  hash: string
  createdAt: string
}
export interface JudgesFile {
  v: 1
  judges: Record<string, JudgeRecord>
}
export interface SessionInfo {
  name: string
  superadmin: boolean
}
export type LoginResult = ({ ok: true; token: string } & SessionInfo) | { ok: false; status: 401 | 429; message: string }
export type OpResult = { ok: true } | { ok: false; status: 400 | 404 | 409; message: string }

export const IDLE_MS = 8 * 3600_000
export const ABSOLUTE_MS = 12 * 3600_000
export const SUPERADMIN = 'admin'
const NAME_RE = /^[A-Za-z0-9 ._-]{1,40}$/
export const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const BAD_LOGIN = 'Wrong username or password.'

export const emptyJudges = (): JudgesFile => ({ v: 1, judges: {} })

export function parseJudges(text: string): JudgesFile {
  const f = JSON.parse(text) as JudgesFile
  const str = (x: unknown) => typeof x === 'string'
  if (!f || typeof f !== 'object' || f.v !== 1 || !f.judges || typeof f.judges !== 'object' || Array.isArray(f.judges)) throw new Error('unexpected judges file shape')
  for (const [k, j] of Object.entries(f.judges)) {
    if (!j || !str(j.name) || !str(j.salt) || !str(j.hash) || !str(j.createdAt) || k !== j.name.toLowerCase() || !/^[0-9a-f]+$/.test(j.salt) || !/^[0-9a-f]{64}$/.test(j.hash))
      throw new Error('unexpected judges file shape')
  }
  return f
}

/** Counts failures per key; max failures lock the key for lockMs. */
export function createLimiter(now: () => number, max = 5, lockMs = 30_000) {
  const m = new Map<string, { n: number; until: number }>()
  return {
    locked: (key: string) => (m.get(key)?.until ?? 0) > now(),
    fail(key: string) {
      const f = m.get(key)
      const n = (f && !f.until ? f.n : 0) + 1
      m.set(key, n >= max ? { n: 0, until: now() + lockMs } : { n, until: 0 })
    },
    clear: (key: string) => void m.delete(key),
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest()
const scrypt = (pw: string, salt: Buffer) => scryptSync(pw, salt, 32)
const DUMMY_SALT = randomBytes(16)
const DUMMY_HASH = scrypt('dummy', DUMMY_SALT)

export interface AuthOptions {
  now?: () => number
  judges?: JudgesFile
  superPassword: string
  save?: (f: JudgesFile) => void
}

export function createAuth(opts: AuthOptions) {
  const now = opts.now ?? Date.now
  const file: JudgesFile = opts.judges ?? emptyJudges()
  const sessions = new Map<string, { name: string; superadmin: boolean; created: number; lastSeen: number }>()
  const limiter = createLimiter(now)
  const superHash = sha(opts.superPassword)
  const persist = () => opts.save?.(file)

  function killSessions(lower: string) {
    for (const [t, s] of sessions) if (!s.superadmin && s.name.toLowerCase() === lower) sessions.delete(t)
  }
  function open(name: string, superadmin: boolean): LoginResult {
    const token = randomBytes(32).toString('hex')
    sessions.set(token, { name, superadmin, created: now(), lastSeen: now() })
    return { ok: true, token, name, superadmin }
  }

  function login(name: unknown, pw: unknown, ip: string): LoginResult {
    const user = typeof name === 'string' ? name.trim().toLowerCase().slice(0, 40) : ''
    const pass = typeof pw === 'string' ? pw.slice(0, 200) : ''
    // Keyed by address, and by name+address: a bare per-name key would let anyone lock the real "admin" out.
    // The host PC itself (loopback) is never locked out, so the event lead can always sign in there.
    const ipKey = `ip:${ip}`
    const userKey = `user+ip:${user}|${ip}`
    const local = LOOPBACK.has(ip)
    if (!local && (limiter.locked(ipKey) || limiter.locked(userKey)))
      return { ok: false, status: 429, message: 'Too many failed sign-in attempts. Wait 30 seconds and try again.' }
    let good = false
    const j = file.judges[user]
    if (user === SUPERADMIN) good = timingSafeEqual(sha(pass), superHash)
    else if (j) good = timingSafeEqual(scrypt(pass, Buffer.from(j.salt, 'hex')), Buffer.from(j.hash, 'hex'))
    else timingSafeEqual(scrypt(pass, DUMMY_SALT), DUMMY_HASH) // same work for unknown users
    if (!good) {
      if (!local) {
        limiter.fail(ipKey)
        limiter.fail(userKey)
      }
      return { ok: false, status: 401, message: BAD_LOGIN }
    }
    limiter.clear(ipKey)
    limiter.clear(userKey)
    return user === SUPERADMIN ? open(SUPERADMIN, true) : open(j.name, false)
  }

  function session(token: string | undefined | null, touch = true): SessionInfo | null {
    if (!token) return null
    const s = sessions.get(token)
    if (!s) return null
    const t = now()
    if (t - s.lastSeen > IDLE_MS || t - s.created > ABSOLUTE_MS) {
      sessions.delete(token)
      return null
    }
    if (touch) s.lastSeen = t
    return { name: s.name, superadmin: s.superadmin }
  }

  const checkPw = (pw: unknown): OpResult =>
    typeof pw === 'string' && pw.length >= 8 && pw.length <= 200 ? { ok: true } : { ok: false, status: 400, message: 'Password must be 8 to 200 characters.' }
  const hashPw = (pw: string) => {
    const salt = randomBytes(16)
    return { salt: salt.toString('hex'), hash: scrypt(pw, salt).toString('hex') }
  }

  return {
    login,
    session,
    logout: (token: string | undefined | null) => void (token && sessions.delete(token)),
    addJudge(name: unknown, pw: unknown): OpResult {
      if (typeof name !== 'string' || !NAME_RE.test(name) || name.trim() !== name || !name) return { ok: false, status: 400, message: 'Name: 1 to 40 letters, digits, space . _ - (no leading or trailing space).' }
      const lower = name.toLowerCase()
      if (lower === SUPERADMIN) return { ok: false, status: 400, message: 'That name is reserved.' }
      if (file.judges[lower]) return { ok: false, status: 409, message: 'A judge with that name already exists.' }
      const p = checkPw(pw)
      if (!p.ok) return p
      file.judges[lower] = { name, ...hashPw(pw as string), createdAt: new Date(now()).toISOString() }
      try {
        persist()
      } catch (e) {
        delete file.judges[lower]
        throw e
      }
      return { ok: true }
    },
    resetPassword(name: unknown, pw: unknown): OpResult {
      const lower = typeof name === 'string' ? name.toLowerCase() : ''
      const j = file.judges[lower]
      if (!j) return { ok: false, status: 404, message: 'No such judge.' }
      const p = checkPw(pw)
      if (!p.ok) return p
      const prev = { ...j }
      Object.assign(j, hashPw(pw as string))
      try {
        persist()
      } catch (e) {
        Object.assign(j, prev)
        throw e
      }
      killSessions(lower)
      return { ok: true }
    },
    revoke(name: unknown): OpResult {
      const lower = typeof name === 'string' ? name.toLowerCase() : ''
      if (!file.judges[lower]) return { ok: false, status: 404, message: 'No such judge.' }
      const prev = file.judges[lower]
      delete file.judges[lower]
      try {
        persist()
      } catch (e) {
        file.judges[lower] = prev
        throw e
      }
      killSessions(lower)
      return { ok: true }
    },
    list() {
      const t = now()
      return Object.entries(file.judges).map(([lower, j]) => ({
        name: j.name,
        createdAt: j.createdAt,
        sessions: [...sessions.values()].filter((s) => !s.superadmin && s.name.toLowerCase() === lower && t - s.lastSeen <= IDLE_MS && t - s.created <= ABSOLUTE_MS).length,
      }))
    },
  }
}

export type Auth = ReturnType<typeof createAuth>
