import type { Action } from '../game/actions.ts'
import type { LeaderRow } from '../game/leaderboard.ts'
import type { EventState, RulesetId, SideId } from '../game/types.ts'
import { randomHex } from '../game/ids.ts'

/** Browser side of the event server: one SSE subscription for state, POST for actions. */

export interface Payload {
  version: number
  serverNow: number
  event: EventState
  leaderboard: Omit<LeaderRow, 'rank'>[]
  claims: Partial<Record<SideId, 'you' | 'other'>>
  admin: boolean
  /** The signed-in judge's name ("admin" for the event lead); null when not signed in. */
  judge: string | null
  superadmin: boolean
  /** Non-admin: an admin paired this registration as a non-A side of that match; the station joins it. */
  paired: { sessionId: string } | null
  /** Live sessions → human sides whose station is not connected. */
  offline?: Record<string, SideId[]>
  /** Admin only: Game IDs with a connected participant station. */
  online?: string[]
}

export interface Reply {
  ok: boolean
  message: string
  gameId?: string
  /** Station key: returned by register and resume, sent with every action and stream request. */
  key?: string
  /** issueResumeCode: the one-time code to hand to the player. */
  code?: string
  side?: SideId
  version?: number
  status?: number
  judges?: { name: string; createdAt: string; sessions: number }[]
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
  | { type: 'pairMatch'; gameIds: string[]; rulesetId?: RulesetId; timed?: boolean; hold?: boolean }

export type Connection = 'connecting' | 'online' | 'reconnecting'

const KEY = { client: 'timeauction:client', game: 'timeauction:active', operator: 'timeauction:operator', key: 'timeauction:key' }

const read = (store: () => Storage, k: string) => {
  try {
    return store().getItem(k)
  } catch {
    return null
  }
}
const write = (store: () => Storage, k: string, v: string | null) => {
  try {
    if (v === null) store().removeItem(k)
    else store().setItem(k, v)
  } catch {
    // Storage unavailable: the value lasts for this page only.
  }
}

export const device = {
  /** Per tab, so two tabs are two stations; survives a refresh. A lost tab's side can be re-joined (see the server). */
  clientId() {
    let id = read(() => sessionStorage, KEY.client)
    if (!id) {
      id = randomHex()
      write(() => sessionStorage, KEY.client, id)
    }
    return id
  },
  gameId: () => read(() => localStorage, KEY.game),
  setGameId: (v: string | null) => write(() => localStorage, KEY.game, v),
  /** Proves this browser owns its registration (issued by the server on register or resume). */
  key: () => read(() => localStorage, KEY.key),
  setKey: (v: string | null) => write(() => localStorage, KEY.key, v),
  /** The Game ID inside the key, or null. */
  ownGameId() {
    const k = read(() => localStorage, KEY.key)
    const i = k ? k.lastIndexOf('.') : -1
    return k && i > 0 ? k.slice(0, i) : null
  },
  operator: () => read(() => localStorage, KEY.operator) ?? '',
  setOperator: (v: string) => write(() => localStorage, KEY.operator, v),
}

/** Sign-in and sign-out in one tab tell the others on this device to reconnect: all tabs share the session cookie. */
export const AUTH_KEY = 'timeauction:auth'
export const announceAuth = () => write(() => localStorage, AUTH_KEY, String(Date.now()))

/** The event server's name and the address stations join from (null when the server has no LAN address). */
export async function hello(): Promise<{ eventName: string; join: string | null } | null> {
  try {
    const r = await fetch('/api/hello', { signal: AbortSignal.timeout(2500), cache: 'no-store' })
    const body = r.ok ? await r.json() : null
    return body?.ok === true ? { eventName: body.eventName, join: body.join ?? null } : null
  } catch {
    return null
  }
}

/** Resolves true when an event server answers within the timeout. */
export async function detectServer(timeoutMs = 2500): Promise<boolean> {
  try {
    const r = await fetch('/api/hello', { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    if (!r.ok) return false
    const body = await r.json()
    return body?.ok === true
  } catch {
    return false
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Sends one action. Network failures are retried with the same request ID, which the server
 * answers from its cache, so a retry can never apply an action twice.
 */
export async function send(action: Action | ServerAction, gameId: string | null): Promise<Reply> {
  const body = JSON.stringify({
    requestId: randomHex(),
    clientId: device.clientId(),
    gameId,
    action,
    key: device.key(),
  })
  for (const delay of [0, 400, 1200, 2500]) {
    if (delay) await wait(delay)
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(6000) })
      if (r.status === 502 || r.status === 503 || r.status === 504) continue // gateway errors: the server may be restarting
      const reply = (await r.json()) as Reply
      return reply
    } catch {
      // Network error or timeout: retry.
    }
  }
  return {
    ok: false,
    message: 'Could not reach the event server. If the action reached it, the screen will update when the connection returns; otherwise try again.',
  }
}

/** Signs in; the server answers with an HttpOnly session cookie that this code never sees. */
export async function login(name: string, password: string): Promise<{ ok: boolean; message: string; name?: string; superadmin?: boolean }> {
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password }), credentials: 'same-origin' })
    return await r.json()
  } catch {
    return { ok: false, message: 'Could not reach the event server.' }
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {
    // Offline: the server session simply expires.
  }
}

export function subscribe(gameId: string | null, onPayload: (p: Payload) => void, onStatus: (c: Connection) => void, live = false) {
  const params = new URLSearchParams({ client: device.clientId() })
  if (gameId) params.set('game', gameId)
  if (live) params.set('live', '1')
  const key = device.key()
  if (key) params.set('key', key)
  const source = new EventSource(`/api/stream?${params}`)
  onStatus('connecting')
  source.onmessage = (m) => {
    onStatus('online')
    onPayload(JSON.parse(m.data) as Payload)
  }
  // EventSource reconnects by itself; the first message after reconnecting is a full snapshot.
  source.onerror = () => onStatus('reconnecting')
  return () => source.close()
}
