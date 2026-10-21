import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { LOOPBACK, type Auth, type SessionInfo } from './auth.ts'
import { ADMIN_ACTIONS, applyAction, DRAFT_GRACE_MS, RUN_ACTIONS, type Action } from '../src/game/actions.ts'
import { eligibleRows } from '../src/game/leaderboard.ts'
import { inputError } from '../src/game/validation.ts'
import { ID_MAX } from '../src/game/rules.ts'
import { emptyEntries } from '../src/game/scoring.ts'
import { currentLot, MAX_SIDES, MIN_SIDES, sidesOf } from '../src/game/auction.ts'
import { activeMatch, activeView, setActive, waitingParticipants } from '../src/game/event.ts'
import type { EventState, Run, RulesetId, ScoreRecord, Session, SideId } from '../src/game/types.ts'

/**
 * The authoritative event host. Node runs one request at a time, so each action is applied
 * to the latest state in full before the next one is read: no two bids can interleave.
 * Transport-agnostic: index.ts wires it to HTTP + Server-Sent Events, tests call it directly.
 */

export type Claims = Record<string, Partial<Record<SideId, string>>> // sessionId → side → clientId

export interface Request {
  requestId: string
  clientId: string
  gameId: string | null
  /** Set by the transport from the session cookie, never from the body. Null/absent = not signed in. */
  session?: SessionInfo | null
  /** Station key from the registration reply; proves this station owns that registration. */
  key?: string | null
  /** Set by the transport from the socket, never from the body. */
  ip?: string
  action: Action | ServerAction
}

export type ServerAction =
  | { type: 'resume'; code: string }
  | { type: 'leaveStation' }
  | { type: 'issueResumeCode'; gameId: string }
  | { type: 'joinSession'; sessionId: string }
  | { type: 'addJudge'; name: string; password: string }
  | { type: 'resetJudgePassword'; name: string; password: string }
  | { type: 'revokeJudge'; name: string }
  | { type: 'listJudges' }
  | { type: 'pairMatch'; gameIds: string[]; bot?: boolean; rulesetId?: RulesetId; timed?: boolean; hold?: boolean }

export interface Reply {
  ok: boolean
  message: string
  gameId?: string
  side?: SideId
  status?: number
  /** The state version this reply reflects; the client waits for it before showing the outcome. */
  version?: number
  /** register and resume: the station key to keep and present from now on. */
  key?: string
  /** issueResumeCode only. */
  code?: string
  /** listJudges only. */
  judges?: { name: string; createdAt: string; sessions: number }[]
}

export interface Payload {
  version: number
  serverNow: number
  event: EventState
  leaderboard: ReturnType<typeof eligibleRows>
  /** For the subscriber's current session: which sides are controlled by this device or another one. */
  claims: Partial<Record<SideId, 'you' | 'other'>>
  admin: boolean
  /** The signed-in judge's name ("admin" for the superadmin), null when not signed in. */
  judge: string | null
  superadmin: boolean
  /** Non-admin: an admin paired this registration as a non-A side of that match; the station joins it. */
  paired: { sessionId: string } | null
  /** Live sessions the subscriber may see → human sides whose station is not connected right now. */
  offline: Record<string, SideId[]>
  /** Admin only: Game IDs with a participant station connected right now (the projector's Teams list). */
  online?: string[]
}

export interface Subscriber {
  clientId: string
  gameId: string | null
  /** Station key; without a valid one a participant stream carries nothing. */
  key?: string | null
  admin: boolean
  /** Session token of an admin subscriber; re-checked on every push so revoking a judge cuts the live stream. */
  token?: string
  send: (p: Payload) => void
  /** Admin pushes are coalesced to one per second; this is when the last one went. */
  lastSent?: number
  /** Auctioneer screen: admin pushes are not throttled. */
  live?: boolean
}

export interface HostOptions {
  initial: EventState
  claims?: Claims
  auth: Auth
  log?: (msg: string) => void
  now?: () => number
  save?: (ev: EventState, claims: Claims, keyVersions: Record<string, number>) => void
  /** Registration → key version; a bumped version retires every earlier key for it. */
  keyVersions?: Record<string, number>
  /** Writes the key versions at once (a retired key must survive a hard kill). */
  saveKeys?: (keys: Record<string, number>) => void
  adminIntervalMs?: number
  /** The event runs one match at a time; stress tests turn this off to drive many rooms at once. */
  concurrentMatches?: boolean
  /** Secret behind the station keys; random per start when omitted (keys then do not survive a restart). */
  secret?: string
  /** Registrations allowed per station address; 0 = unlimited, loopback exempt. Default 2. */
  registrationsPerIp?: number
}

const REPLY_CACHE = 5000
/** Destructive or event-wide: the event lead only. */
const SUPER_ONLY = new Set(['resetEvent', 'updateSettings'])
export const SEALED = 'SEALED'
/** Player copy of a run: no side's Game ID; before the reveal no twist, no run ID (the twist is drawn from it), no unopened lot. */
export function forPlayer(run: Run): Run {
  const s = run.session
  const sealed = run.phase === 'setup' || run.phase === 'auction' || run.phase === 'summary'
  if (!s) return sealed ? { ...run, runId: SEALED, twistId: '' } : run
  const sides = Object.fromEntries(Object.entries(s.sides).map(([id, u]) => [id, { ...u, gameId: undefined }])) as Session['sides']
  if (!sealed) return { ...run, session: { ...s, sides } }
  const lots = s.lots.map((l) => (l.status === 'pending' ? { ...l, techId: '' } : l))
  const seen = new Set(lots.filter((l) => l.techId).map((l) => l.techId))
  const rules = { ...s.rules, lots: lots.map((l) => l.techId), offThemeTechIds: s.rules.offThemeTechIds?.filter((id) => seen.has(id)), wildcardTechId: s.rules.wildcardTechId && seen.has(s.rules.wildcardTechId) ? s.rules.wildcardTechId : undefined }
  return { ...run, runId: SEALED, twistId: '', session: { ...s, runId: SEALED, sides, lots, rules } }
}
/** Sides registration `me` plays in a session whose run belongs to `host`. */
function sidesFor(s: Session, host: string, me: string): SideId[] {
  return me === host
    ? sidesOf(s).filter((id) => id === 'A' || (s.sides[id].controller === 'human' && !s.sides[id].gameId))
    : sidesOf(s).filter((id) => id !== 'A' && s.sides[id].gameId === me)
}
/** Other sides' solutions: whether they started/submitted, never what they wrote. */
function hideOthers(run: Run, mine: SideId[]): Run {
  const solutions = Object.fromEntries(Object.entries(run.solutions).map(([id, sol]) => [id,
    !sol ? sol
    : mine.includes(id) ? { ...sol, reopened: sol.reopened?.map((r) => ({ ...r, by: '' })) }
    : { startedAt: sol.startedAt, deadline: sol.deadline, draft: { techIds: [], characteristics: [], text: '' },
        submission: sol.submission && { ...sol.submission, text: '', wordCount: 0, selectedTechIds: [], characteristics: [] } }])) as Run['solutions']
  return { ...run, solutions, ...(run.cancelled && { cancelled: { ...run.cancelled, by: '' } }) }
}
/** Status always; criterion scores only once published; notes only for the viewer's own side; no judge names or corrections. */
function scoreFor(rec: ScoreRecord, mine: boolean): ScoreRecord {
  const entries = rec.status !== 'published' ? emptyEntries()
    : mine ? rec.entries
    : (Object.fromEntries(Object.entries(rec.entries).map(([k, e]) => [k, { ...e, note: '' }])) as ScoreRecord['entries'])
  return { ...rec, entries, queuedBy: '', scoredBy: undefined, verifiedBy: undefined, publishedBy: undefined, corrections: [] }
}
const SIDE_ACTIONS = new Set(['bid', 'pass', 'startSolution', 'updateDraft', 'submitSolution'])
const JUDGE_ACTIONS = new Set(['addJudge', 'resetJudgePassword', 'revokeJudge', 'listJudges', 'issueResumeCode'])
const KNOWN = new Set<string>([...ADMIN_ACTIONS, ...RUN_ACTIONS, 'register', 'resume', 'leaveStation', 'issueResumeCode', 'joinSession', 'addJudge', 'resetJudgePassword', 'revokeJudge', 'listJudges', 'pairMatch'])
export function createHost(opts: HostOptions) {
  const now = opts.now ?? Date.now
  const auth = opts.auth
  const adminInterval = opts.adminIntervalMs ?? 1000
  let ev = opts.initial
  let claims: Claims = opts.claims ?? {}
  let keyVersions: Record<string, number> = { ...(opts.keyVersions ?? {}) }
  let version = 1
  const replies = new Map<string, Reply>()
  const lastTick = new Map<string, number>()
  const subs = new Set<Subscriber>()
  const dirty = { games: new Set<string>(), event: false }
  /** Whether this subscriber's session is still valid (does not refresh the idle timer: pushes are not activity). */
  const sessionOfSub = (sub: Pick<Subscriber, 'admin' | 'token'>) => (sub.admin ? auth.session(sub.token, false) : null)
  /** Downgrades an admin subscriber whose session ended; returns true if it did. */
  function downgrade(sub: Subscriber) {
    if (!sub.admin || sessionOfSub(sub)) return false
    sub.admin = false
    sub.send(payloadFor(sub))
    return true
  }
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let adminTimer: ReturnType<typeof setTimeout> | null = null

  const iso = () => new Date(now()).toISOString()
  const participant = (gameId: string | null) => ev.participants.find((p) => p.gameId === gameId)
  const sessionOf = (gameId: string | null) => participant(gameId)?.run?.session ?? null

  if (opts.secret !== undefined && opts.secret.length < 32) throw new Error('Station-key secret must be at least 32 characters.')
  const secret = opts.secret ?? randomBytes(32).toString('hex')
  const ver = (g: string) => (Object.hasOwn(keyVersions, g) ? keyVersions[g] : 0)
  // Version 0 hashes the bare Game ID, so keys issued before versions existed keep working.
  const mac = (g: string) => createHmac('sha256', secret).update(ver(g) ? `${g}#${ver(g)}` : g).digest('hex').slice(0, 32)
  const keyFor = (g: string) => `${g}.${mac(g)}`
  /** The registration a station key belongs to, or null if the key is missing, forged or for a registration that no longer exists. */
  function ownerOf(key: string | null | undefined): string | null {
    if (typeof key !== 'string') return null
    const i = key.lastIndexOf('.')
    if (i <= 0) return null
    const g = key.slice(0, i)
    const got = Buffer.from(key.slice(i + 1))
    const want = Buffer.from(mac(g))
    return got.length === want.length && timingSafeEqual(got, want) && participant(g) ? g : null
  }
  /** Sides the key holder may act for in gameId's run ([] = may read, no session); null = no access. */
  function access(gameId: string | null, key: string | null | undefined): SideId[] | null {
    const me = ownerOf(key)
    if (!me || !gameId) return null
    const s = sessionOf(gameId)
    const mine = s ? sidesFor(s, gameId, me) : []
    return me === gameId ? mine : mine.length ? [mine[0]] : null
  }
  const persist = () => opts.save?.(ev, claims, keyVersions)
  /** Invalidates every key issued so far for this registration. */
  function retireKey(g: string) {
    keyVersions = { ...keyVersions, [g]: ver(g) + 1 }
    opts.saveKeys?.(keyVersions)
    persist()
    dirty.event = true
    scheduleFlush()
  }
  const codes = new Map<string, { gameId: string; until: number }>() // ponytail: in memory; a restart voids codes, re-issue
  const perIp = opts.registrationsPerIp ?? 2
  const regsByIp = new Map<string, number>() // ponytail: in memory, reset on restart

  function commit(next: EventState, gameId: string | null, eventLevel: boolean) {
    if (next === ev) return
    ev = next
    version++
    if (gameId) dirty.games.add(gameId)
    if (eventLevel) dirty.event = true
    persist()
    scheduleFlush()
  }

  /** Brings a running countdown (intro, bidding or result pause) up to the current time, so a late bid is judged against the real clock. */
  function catchUp(gameId: string) {
    const t = now()
    const s = sessionOf(gameId)
    const lot = s && s.status === 'live' ? currentLot(s) : null
    const last = lastTick.get(gameId) ?? t
    lastTick.set(gameId, t)
    if (!lot?.running || t <= last) return
    const before = { events: s!.events.length, current: s!.current, status: lot.status, phase: lot.phase }
    const r = applyAction(ev, { type: 'tick', deltaMs: t - last }, { at: iso(), nowMs: t, gameId })
    if (!r.ok) return
    const after = r.ev.participants.find((p) => p.gameId === gameId)!.run!.session!
    const meaningful = after.events.length !== before.events || after.current !== before.current || currentLot(after).status !== before.status || currentLot(after).phase !== before.phase
    // Clock-only progress is not broadcast: clients count down locally from the last snapshot.
    if (meaningful) commit(r.ev, gameId, false)
    else {
      ev = r.ev
      persist()
    }
  }

  /** Pushes a participant view to admin streams whose session has ended (revoked, expired, signed out). */
  function kick() {
    for (const sub of subs) downgrade(sub)
  }

  function tickAll() {
    kick()
    for (const p of ev.participants) {
      const lot = p.run?.session?.status === 'live' ? currentLot(p.run.session) : null
      if (lot?.running) catchUp(p.gameId)
    }
    autoSubmitDue()
  }

  /** Locks every timed solution whose clock (plus the draft grace) has run out, even when its station is gone. */
  function autoSubmitDue() {
    const t = now()
    for (const p of ev.participants) {
      const run = p.run
      if (!run || run.cancelled) continue
      for (const [side, sol] of Object.entries(run.solutions)) {
        if (!sol || sol.submission || sol.deadline === null || t <= sol.deadline + DRAFT_GRACE_MS) continue
        const r = applyAction(ev, { type: 'autoSubmit', side }, { at: iso(), nowMs: t, gameId: p.gameId })
        if (r.ok) {
          commit(r.ev, p.gameId, false)
          opts.log?.(`Solution time over: ${run.session?.sides[side]?.name ?? side} submitted automatically`)
        }
      }
    }
  }

  function claimsFor(gameId: string | null, clientId: string): Payload['claims'] {
    const s = sessionOf(gameId)
    const c = s ? claims[s.sessionId] : undefined
    if (!s || !c) return {}
    const out: Payload['claims'] = {}
    for (const side of sidesOf(s)) if (c[side]) out[side] = c[side] === clientId ? 'you' : 'other'
    return out
  }

  /** Human sides of a live session with no connected station: the claimed device is gone, or nobody has opened that side. */
  function offlineSides(s: Session): SideId[] {
    const c = claims[s.sessionId] ?? {}
    const hostId = ev.participants.find((p) => p.run?.session?.sessionId === s.sessionId)?.gameId
    return sidesOf(s).filter((side) => {
      const u = s.sides[side]
      if (u.controller === 'bot') return false
      if (c[side]) return ![...subs].some((x) => x.clientId === c[side] && ownerOf(x.key) === (u.gameId ?? hostId))
      // Unclaimed side (usually the host, A): any connected station of this match that holds no other side.
      const holders = new Set(Object.values(c))
      return ![...subs].some((x) => !x.admin && !holders.has(x.clientId) && ownerOf(x.key) === (u.gameId ?? hostId) && (x.gameId === hostId || x.gameId === u.gameId))
    })
  }

  function offlineFor(sessions: Session[]): Record<string, SideId[]> {
    return Object.fromEntries(sessions.filter((s) => s.status === 'live').map((s) => [s.sessionId, offlineSides(s)]))
  }

  /** What one subscriber may see: an administrator gets the whole event, a participant only their own records. */
  function payloadFor(sub: Pick<Subscriber, 'clientId' | 'gameId' | 'key' | 'admin' | 'token'>): Payload {
    const all = eligibleRows(ev)
    const who = sessionOfSub(sub)
    if (sub.admin && who) return { version, serverNow: now(), event: ev, leaderboard: all, claims: claimsFor(sub.gameId, sub.clientId), admin: true, judge: who.name, superadmin: who.superadmin, paired: null, offline: offlineFor(ev.participants.flatMap((p) => (p.run?.session && !p.run.cancelled ? [p.run.session] : []))), online: [...new Set([...subs].flatMap((x) => (!x.admin && x.gameId ? [x.gameId] : [])))] }
    // A Game ID alone proves nothing: the station key decides which records this stream may carry.
    const g = sub.gameId && access(sub.gameId, sub.key) ? sub.gameId : null
    const me = g ? ownerOf(sub.key) : null
    const p = participant(g)
    const guest = p && me !== g ? participant(me) : undefined // joined station (Side B, C, ...)
    const runs = p ? [p.run, ...(guest ? [] : p.pastRuns)].filter((r): r is Run => !!r) : []
    const sidesIn = (r: Run) => (r.session && me ? sidesFor(r.session, g!, me) : [])
    const view = (r: Run) => forPlayer(hideOthers(r, sidesIn(r)))
    const own = p ? [{ ...p, player: guest ? guest.player : p.player, run: p.run && view(p.run), pastRuns: guest ? [] : p.pastRuns.map(view) }] : []
    // Other players' IDs stay off the board; my own row shows SEALED while my run is sealed.
    const sealedId = p?.run && forPlayer(p.run).runId === SEALED ? p.run.runId : null
    const rows = all.map((r) => (r.gameId === g ? { ...r, runId: r.runId === sealedId ? SEALED : r.runId } : { ...r, gameId: '', runId: '' }))
    const scores = Object.fromEntries(Object.values(ev.scores).flatMap((rec) => {
      const r = rec.gameId === g ? runs.find((x) => x.runId === rec.runId) : undefined
      return r ? [[rec.submissionId, scoreFor(rec, sidesIn(r).includes(rec.sideId))]] : []
    }))
    const event: EventState = {
      ...ev,
      settings: { ...ev.settings, operator: '' },
      participants: own,
      activeGameId: g,
      scores,
      feedback: me ? ev.feedback.filter((f) => f.gameId === me) : [],
      audit: [],
    }
    const host = g ? ev.participants.find((p) => p.run?.session && !p.run.cancelled && sidesOf(p.run.session).some((id) => id !== 'A' && p.run!.session!.sides[id].gameId === g)) : undefined
    return { version, serverNow: now(), event, leaderboard: rows, claims: claimsFor(g, sub.clientId), admin: false, judge: null, superadmin: false, paired: host ? { sessionId: host.run!.session!.sessionId } : null, offline: (() => { const mine = sessionOf(g); return mine ? offlineFor([mine]) : {} })() }
  }

  function scheduleFlush() {
    flushTimer ??= setTimeout(flush, 15)
  }

  function flush() {
    flushTimer = null
    const games = new Set(dirty.games)
    const eventLevel = dirty.event
    dirty.games.clear()
    dirty.event = false
    let adminPending = false
    for (const sub of subs) {
      if (downgrade(sub)) continue
      if (sub.admin) {
        adminPending = true
        continue
      }
      if (eventLevel || (sub.gameId && games.has(sub.gameId))) sub.send(payloadFor(sub))
    }
    if (adminPending) flushAdmins(eventLevel)
  }

  /** Administrators see participant activity at most once a second; their own (event-level) changes go out at once. */
  function flushAdmins(force = false) {
    const t = now()
    let wait = 0
    for (const sub of subs) {
      if (downgrade(sub) || !sub.admin) continue
      const since = t - (sub.lastSent ?? 0)
      const iv = sub.live ? Math.min(150, adminInterval) : adminInterval
      if (force || since >= iv) {
        sub.lastSent = t
        sub.send(payloadFor(sub))
      } else wait = wait ? Math.min(wait, iv - since) : iv - since
    }
    if (wait && !adminTimer) {
      adminTimer = setTimeout(() => {
        adminTimer = null
        flushAdmins()
      }, wait)
    }
  }

  function remember(requestId: string, reply: Reply): Reply {
    replies.set(requestId, reply)
    if (replies.size > REPLY_CACHE) replies.delete(replies.keys().next().value!)
    return reply
  }

  function dispatch(req: Request): Reply {
    // A retried request (same ID) gets the original answer and is never applied twice.
    const a = req.action as { type?: unknown } | null
    if (typeof req.clientId !== 'string' || !req.clientId || req.clientId.length > ID_MAX || !(req.gameId === null || (typeof req.gameId === 'string' && req.gameId.length <= ID_MAX)) || typeof req.requestId !== 'string' || !a || typeof a.type !== 'string' || !KNOWN.has(a.type))
      return { ok: false, message: 'Malformed request.', status: 400 }
    const bad = inputError(req.action as { type: string } & Record<string, unknown>)
    if (bad) return { ok: false, message: bad, status: 400 }
    // The cache is per station: one station's request ID can never replay another's reply (it holds a key).
    const id = `${req.clientId}:${req.requestId}`
    const seen = replies.get(id)
    if (seen) return seen
    const reply = handle(req)
    // Only a reply that changed state (or succeeded) is replayed; refusals are recomputed, so they can't be pinned or used to evict.
    // Judge-management replies are never cached: a retry must re-check, and listJudges must be fresh.
    // ponytail: one global LRU; a key-holder spamming drafts can still evict, per-client caps if that ever matters.
    return (reply.ok || reply.version !== undefined) && !JUDGE_ACTIONS.has(req.action.type) ? remember(id, reply) : reply
  }

  function judgeAction(session: SessionInfo | null | undefined, action: Extract<ServerAction, { type: 'addJudge' | 'resetJudgePassword' | 'revokeJudge' | 'listJudges' }>): Reply {
    if (!session?.superadmin) return { ok: false, message: 'Only the event lead (admin) can manage judges.', status: 403 }
    if (action.type === 'listJudges') return { ok: true, message: 'Judges.', judges: auth.list() }
    const r = action.type === 'addJudge' ? auth.addJudge(action.name, action.password) : action.type === 'resetJudgePassword' ? auth.resetPassword(action.name, action.password) : auth.revoke(action.name)
    if (!r.ok) return { ok: false, message: r.message, status: r.status }
    // Names only, never passwords.
    opts.log?.(`Judge ${action.type === 'addJudge' ? 'added' : action.type === 'revokeJudge' ? 'revoked' : 'password reset'}: ${action.name}`)
    if (action.type !== 'addJudge') kick()
    return { ok: true, message: action.type === 'addJudge' ? 'Judge added.' : action.type === 'revokeJudge' ? 'Judge revoked.' : 'Password reset.' }
  }

  function handle({ clientId, gameId, session, action, key, ip }: Request): Reply {
    const isAdmin = !!session

    if (action.type === 'addJudge' || action.type === 'resetJudgePassword' || action.type === 'revokeJudge' || action.type === 'listJudges') return judgeAction(session, action)

    if (action.type === 'resume') {
      const code = String(action.code ?? '').trim().toUpperCase()
      const found = codes.get(code)
      if (!found || found.until < now() || !participant(found.gameId)) return { ok: false, message: 'That resume code is not valid or has expired. Ask the event team for a new one.', status: 404 }
      codes.delete(code)
      // Moving station: whatever key the old station holds stops working.
      retireKey(found.gameId)
      return { ok: true, message: 'Resumed.', gameId: found.gameId, key: keyFor(found.gameId) }
    }

    if (action.type === 'leaveStation') {
      const me = ownerOf(key)
      if (!me) return { ok: false, message: 'This station is not signed in.', status: 403 }
      retireKey(me)
      return { ok: true, message: 'This station has left the registration.' }
    }

    if (action.type === 'issueResumeCode') {
      if (!session) return { ok: false, message: 'Sign in as a judge to issue resume codes.', status: 403 }
      const p = participant(action.gameId)
      if (!p) return { ok: false, message: 'Participant not found.', status: 404 }
      const name = p.player.team?.name ?? p.player.name
      const code = randomBytes(6).toString('hex').toUpperCase()
      codes.set(code, { gameId: p.gameId, until: now() + 10 * 60_000 })
      opts.log?.(`Resume code issued by ${session.name} for ${name}`)
      return { ok: true, message: `Resume code for ${name}: ${code}. Valid once, for 10 minutes.`, code }
    }

    if (action.type === 'pairMatch') {
      if (!session) return { ok: false, message: 'Sign in as a judge to start matches.', status: 403 }
      const ids = action.gameIds
      if (action.bot) return { ok: false, message: 'ChronoBot matches are no longer offered. Pick human players only.', status: 400 }
      if (ids.length < MIN_SIDES || ids.length > MAX_SIDES) return { ok: false, message: `Pick ${MIN_SIDES} to ${MAX_SIDES} players.`, status: 400 }
      if (new Set(ids).size !== ids.length) return { ok: false, message: 'Choose different participants.', status: 400 }
      const ps = ids.map((id) => participant(id))
      if (ps.some((p) => !p)) return { ok: false, message: 'Participant not found.', status: 404 }
      const players = ps as NonNullable<(typeof ps)[number]>[]
      const waiting = new Set(waitingParticipants(ev).map((p) => p.gameId))
      for (const p of players) if (!waiting.has(p.gameId)) return { ok: false, message: `${p.player.team?.name ?? p.player.name} is already in a match.`, status: 409 }
      const busy = opts.concurrentMatches ? null : activeMatch(ev)
      if (busy) return { ok: false, message: `One match at a time: finish or end the match in ${busy.room} first (Matchmaking).`, status: 409 }
      const unit = (p: (typeof players)[number]) => ({ kind: p.player.mode, name: p.player.team?.name ?? p.player.name, members: p.player.team?.members ?? [p.player.name], controller: 'human' as const, gameId: p.gameId })
      const team = (p: (typeof players)[number]) => p.player.mode === 'team'
      const [first, second] = players
      const matchType = players.length > 2 ? 'multi' : team(first) && team(second!) ? 'tvt' : !team(first) && !team(second!) ? 'ivi' : 'ivt'
      const opponents = players.slice(1).map(unit)
      const names = players.map((p) => unit(p).name)
      const at = iso(), ctx = { at, nowMs: now(), gameId: first.gameId }
      // The intro countdown starts now: its clock must not count time from an earlier match on this Game ID.
      lastTick.set(first.gameId, now())
      // Server pairs always hold the Timeline Twist for the host's reveal. With `hold` the match stays ready until the host starts it.
      const c = applyAction(setActive(ev, first.gameId), { type: 'createMatch', config: { matchType, rulesetId: action.rulesetId ?? ev.settings.defaultRuleset, timed: action.timed ?? ev.settings.defaultTimed, opponents, holdTwist: true } }, ctx)
      const r = c.ok && !action.hold ? applyAction(c.ev, { type: 'proceedToAuction' }, ctx) : c
      if (!r.ok) return { ok: false, message: r.message, status: 409 }
      const before = version
      commit(r.ev, first.gameId, false)
      // Every other side's station learns `paired` on the same flush.
      for (const p of players.slice(1)) dirty.games.add(p.gameId)
      const sid = activeView(ev).run!.session!.sessionId
      opts.log?.(`Matchmaking ${session.name}: ${names.join(', ')} (${sid})`)
      return { ok: true, message: action.hold ? 'Match ready. Start it from the host console.' : 'Match started.', gameId: first.gameId, version: version !== before ? version : undefined }
    }

    if (action.type === 'joinSession') {
      const id = action.sessionId.trim().toUpperCase()
      const host = ev.participants.find((p) => p.run?.session?.sessionId === id)
      const s = host?.run?.session
      if (!host || !s) return { ok: false, message: 'No match with that Session ID on this event server.', status: 404 }
      const seats = sidesOf(s).filter((id) => id !== 'A')
      if (!seats.some((id) => s.sides[id].controller === 'human')) return { ok: false, message: 'Side B of this match is ChronoBot; there is nothing to join.', status: 409 }
      if (s.status === 'complete') return { ok: false, message: 'That auction has already finished.', status: 409 }
      // A side bound to a registration opens only on the station holding that registration's key.
      const me = ownerOf(key)
      if (!me) return { ok: false, message: 'Register or resume on this station first.', status: 403 }
      const side = seats.find((id) => s.sides[id].gameId === me)
      if (!side) return { ok: false, message: 'You are not in this match.', status: 403 }
      const c = claims[s.sessionId] ?? {}
      // One station, one side per match.
      const owned = Object.keys(c).find((id) => id !== side && c[id] === clientId)
      if (owned) return { ok: false, message: `This station already plays Side ${owned} of this match.`, status: 403 }
      // A side can be taken over only when the station holding it is no longer connected (closed tab, crashed device).
      const holderOnline = [...subs].some((x) => x.clientId === c[side] && ownerOf(x.key) === me)
      if (c[side] && c[side] !== clientId && holderOnline) return { ok: false, message: `Side ${side} of this match is already controlled by another station that is still connected.`, status: 409 }
      claims = { ...claims, [s.sessionId]: { ...c, [side]: clientId } }
      dirty.games.add(host.gameId)
      persist()
      scheduleFlush()
      return { ok: true, message: `Joined ${s.sides[side].name} (Side ${side}).`, gameId: host.gameId, side }
    }

    if (ADMIN_ACTIONS.has(action.type) && !isAdmin) return { ok: false, message: 'Sign in as a judge to do this.', status: 403 }
    if (SUPER_ONLY.has(action.type) && !session?.superadmin) return { ok: false, message: 'Only the event lead (admin) can do this.', status: 403 }
    if (!session && (action.type === 'createMatch' || action.type === 'discardMatch' || action.type === 'replay')) return { ok: false, message: 'Matches are started by the event team.', status: 403 }
    if (action.type === 'tick') return { ok: false, message: 'The event server runs the clock.', status: 400 }
    // Lots are paced by the auctioneer's judge session; a player station cannot start, pause or skip them.
    if ((action.type === 'setClockRunning' || action.type === 'advanceLot') && !session) return { ok: false, message: 'The auctioneer controls the lots.', status: 403 }
    // A held match starts only from the host console; the Timeline Twist is revealed only by the host.
    if (action.type === 'proceedToAuction' && !session) return { ok: false, message: 'The host starts the auction.', status: 403 }
    if (action.type === 'revealTwist' && !session) return { ok: false, message: 'Only the host can reveal the Timeline Twist.', status: 403 }

    if (session && (action.type === 'bid' || action.type === 'pass')) return { ok: false, message: 'Judges and the auctioneer cannot bid.', status: 403 }

    if (RUN_ACTIONS.has(action.type)) {
      if (!participant(gameId)) return { ok: false, message: 'Participant not found. Register or resume with your Game ID.', status: 404 }
      const side = 'side' in action ? action.side : null
      if (SIDE_ACTIONS.has(action.type)) {
        const gs = sessionOf(gameId)
        if (typeof side !== 'string' || !gs || !Object.hasOwn(gs.sides, side)) return { ok: false, message: 'Name a side in this match.', status: 400 }
      }
      // Judges act by session; a player station must present the key of this registration (or of a side bound to it).
      if (!session) {
        const may = access(gameId, key)
        if (!may) return { ok: false, message: 'This station is not signed in to that registration. Ask the event team for a resume code.', status: 403 }
        if (side && !may.includes(side)) return { ok: false, message: `This station cannot act for Side ${side}.`, status: 403 }
      }
      const s = sessionOf(gameId)
      const c = s ? claims[s.sessionId] : undefined
      // Once another station has taken a side, only that station can act for it, and it can act for nothing else.
      if (side && c) {
        const owner = c[side]
        const ownsOther = Object.keys(c).some((id) => id !== side && c[id] === clientId)
        if ((owner && owner !== clientId) || (!owner && ownsOther))
          return { ok: false, message: `Side ${side} is controlled from another station.`, status: 403 }
      }
      // The joined station plays its side only; setting up or abandoning the run stays with its owner.
      if (c && Object.keys(c).some((id) => id !== 'A' && c[id] === clientId) && (action.type === 'createMatch' || action.type === 'discardMatch' || action.type === 'replay'))
        return { ok: false, message: 'Only the station that created this match can change it.', status: 403 }
      catchUp(gameId!)
    }

    if (action.type === 'register' && !session && perIp > 0 && ip && !LOOPBACK.has(ip) && (regsByIp.get(ip) ?? 0) >= perIp)
      return { ok: false, message: 'This station has already registered. Ask the event team if you need help.', status: 429 }
    const at = iso()
    const before = version
    const r = applyAction(ev, action, { at, nowMs: now(), gameId, operator: session?.name, actor: session ? undefined : (ownerOf(key) ?? undefined) })
    if (session && r.ok && (action.type === 'setClockRunning' || action.type === 'advanceLot'))
      opts.log?.(`Auctioneer ${session.name}: ${action.type === 'advanceLot' ? 'next technology' : action.running ? 'start/resume' : 'pause'} on ${sessionOf(gameId)?.sessionId ?? gameId}`)
    if (session && r.ok && action.type === 'proceedToAuction') opts.log?.(`Host ${session.name}: auction started on ${sessionOf(gameId)?.sessionId ?? gameId}`)
    if (session && r.ok && action.type === 'revealTwist') opts.log?.(`Host ${session.name}: Timeline Twist revealed on ${sessionOf(gameId)?.sessionId ?? gameId}`)
    if (session && r.ok && action.type === 'setShow') opts.log?.(`Show ${session.name}: ${Object.entries(action.patch).map(([k, v]) => `${k} ${v !== null && typeof v === 'object' ? JSON.stringify(v) : (v ?? 'none')}`).join(', ')}`)
    if (action.type === 'register' && r.ok && ip && !session) regsByIp.set(ip, (regsByIp.get(ip) ?? 0) + 1)
    if (action.type === 'resetEvent' && r.ok) {
      claims = {}
      lastTick.clear()
      codes.clear()
      regsByIp.clear()
      keyVersions = {}
      persist()
    }
    commit(r.ev, action.type === 'register' ? (r.gameId ?? null) : gameId, ADMIN_ACTIONS.has(action.type))
    return { ok: r.ok, message: r.message, gameId: r.gameId ?? undefined, key: action.type === 'register' && r.ok && r.gameId ? keyFor(r.gameId) : undefined, version: version !== before ? version : undefined }
  }

  /** Presence changed for a session: push it to its stations and to the admins/auctioneer. */
  function markPresence(gameId: string) {
    dirty.games.add(gameId)
    scheduleFlush()
  }

  function subscribe(sub: Subscriber) {
    if (!sub.admin && sub.gameId && !access(sub.gameId, sub.key)) sub.gameId = null
    subs.add(sub)
    if (sub.admin) sub.lastSent = now()
    else if (sub.gameId) markPresence(sub.gameId)
    sub.send(payloadFor(sub))
    return () => {
      subs.delete(sub)
      // A participant leaving (refresh, closed tab, lost network) no longer pauses the match: the others play on,
      // and every station and the auctioneer see that side as disconnected until it reconnects.
      if (!sub.admin && sub.gameId) markPresence(sub.gameId)
    }
  }

  return {
    kick,
    dispatch,
    subscribe,
    tickAll,
    snapshot: (sub: Pick<Subscriber, 'clientId' | 'gameId' | 'key' | 'admin' | 'token'>) => payloadFor(sub),
    get event() {
      return ev
    },
    get claims() {
      return claims
    },
    get subscriberCount() {
      return subs.size
    },
    flush,
  }
}

export type Host = ReturnType<typeof createHost>
