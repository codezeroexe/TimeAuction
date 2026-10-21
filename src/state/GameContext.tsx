import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CriterionEntry, CriterionId, EventSettings, EventState, GameState, RegistrationInput, ShowState, SideId, SolutionDraft } from '../game/types.ts'
import { applyAction, type Action, type MatchConfig } from '../game/actions.ts'
import { eligibleRows, type LeaderRow } from '../game/leaderboard.ts'
import * as E from '../game/event.ts'
import { saveEvent, STORAGE_KEY, type LoadResult } from './storage.ts'
import { AUTH_KEY, announceAuth, device, login, logout, send, subscribe, type Connection, type Payload, type Reply, type ServerAction } from './remote.ts'
import { useRoute } from './useRoute.ts'
import Recovery from '../screens/Recovery.tsx'

export type { MatchConfig }

export interface ActionResult {
  ok: boolean
  message: string
}

/**
 * `local`: this browser holds the event (localStorage) and is the authority; one device only.
 * `remote`: the event server is the authority; this browser only shows what the server confirmed.
 */
export type Mode = 'local' | 'remote'

interface GameApi {
  mode: Mode
  /** Remote mode only: the live connection to the event server. */
  connection: Connection | 'local'
  /** The active participant's view. */
  state: GameState
  /** Local mode: the whole event. Remote mode: what the server shares with this device (everything for an administrator). */
  event: EventState
  /** Published, eligible leaderboard rows, as computed by the authority. */
  leaderboard: Omit<LeaderRow, 'rank'>[]
  /** Whether this device may run administrator actions (always in local mode; signed in as a judge in remote mode). */
  isAdmin: boolean
  /** Remote mode: sign in with a judge name (or "admin") and password. Local mode: always allowed. */
  unlockAdmin: (name: string, password: string) => Promise<ActionResult>
  lockAdmin: () => void
  /** The signed-in judge's name (remote mode); null in local mode or when signed out. */
  judge: string | null
  /** The event lead ("admin") can manage judges. */
  superadmin: boolean
  /** True after a signed-in session ended (expired or revoked). */
  sessionExpired: boolean
  /** Remote mode, superadmin only: add / reset / revoke / list judges. */
  manageJudges: (action: Extract<ServerAction, { type: 'addJudge' | 'resetJudgePassword' | 'revokeJudge' | 'listJudges' }>) => Promise<Reply>
  /** Auctioneer screen: a participant's view (with a running local countdown), and the clock controls for any match. */
  viewOf: (gameId: string) => GameState
  runFor: (gameId: string, action: { type: 'setClockRunning'; running: boolean } | { type: 'advanceLot' } | { type: 'proceedToAuction' } | { type: 'revealTwist' }) => Promise<ActionResult>
  tickFor: (gameId: string, deltaMs: number) => void
  /** Which side this device controls when another station has joined the match; null means both (hot-seat). */
  mySide: SideId | null
  /** Sides of a match whose station is disconnected (event server only; always empty on one device). */
  offlineOf: (sessionId: string) => SideId[]
  /** Game IDs with a connected station (admins, event-server mode); null when unknown, e.g. single-device mode. */
  online: string[] | null
  /** Whether this device may act for a side. */
  controls: (side: SideId) => boolean
  register: (input: RegistrationInput) => Promise<ActionResult>
  /** Remote: the resume code from the event team. Local: a Game ID on this device. */
  resume: (codeOrGameId: string) => Promise<ActionResult>
  /** Remote, judges only: one-time code for moving a registration to another station. */
  issueResumeCode: (gameId: string) => Promise<ActionResult>
  joinSession: (sessionId: string) => Promise<ActionResult>
  /** Remote mode: retire this station's key and forget the registration here. */
  leaveStation: () => Promise<ActionResult>
  /** Remote mode, judges only: start a match between two waiting registrations. */
  pairMatch: (gameIds: string[], hold?: boolean) => Promise<ActionResult>
  /** Projector stage and focused room. Judges only; not audited. */
  setShow: (patch: Partial<ShowState>) => Promise<ActionResult>
  switchParticipant: (gameId: string | null) => void
  resetEvent: () => Promise<ActionResult>
  createMatch: (config: MatchConfig) => Promise<ActionResult>
  discardMatch: () => Promise<ActionResult>
  proceedToAuction: () => Promise<ActionResult>
  bid: (side: SideId, amount: number) => Promise<ActionResult>
  pass: (side: SideId) => Promise<ActionResult>
  tickClock: (deltaMs: number) => void
  setClockRunning: (running: boolean) => Promise<ActionResult>
  advanceLot: () => Promise<ActionResult>
  continueToMission: () => Promise<ActionResult>
  acknowledgeTwist: () => Promise<ActionResult>
  startSolution: (side: SideId) => Promise<ActionResult>
  updateDraft: (side: SideId, draft: SolutionDraft) => Promise<ActionResult>
  submitSolution: (side: SideId) => Promise<ActionResult>
  /** After the deadline: lock the draft as it is (the event server also does this by itself). */
  autoSubmit: (side: SideId) => Promise<ActionResult>
  replay: () => Promise<ActionResult>
  queueSubmission: (submissionId: string) => Promise<ActionResult>
  saveScoreDraft: (submissionId: string, entries: Record<CriterionId, CriterionEntry>) => Promise<ActionResult>
  submitScores: (submissionId: string, entries: Record<CriterionId, CriterionEntry>) => Promise<ActionResult>
  verifyScore: (submissionId: string) => Promise<ActionResult>
  publishScore: (submissionId: string) => Promise<ActionResult>
  correctScore: (submissionId: string, criterion: CriterionId, value: number, reason: string) => Promise<ActionResult>
  reopenSubmission: (submissionId: string, reason: string) => Promise<ActionResult>
  setLeaderboardLock: (locked: boolean, reason: string) => Promise<ActionResult>
  cancelRun: (gameId: string, reason: string) => Promise<ActionResult>
  clearLobby: (reason: string) => Promise<ActionResult>
  returnToLobby: (gameId: string) => Promise<ActionResult>
  hideFromLobby: (gameId: string) => Promise<ActionResult>
  updateSettings: (patch: Partial<Omit<EventSettings, 'leaderboardLocked' | 'leaderboardLockedAt'>>) => Promise<ActionResult>
  saveFeedback: (runId: string, input: E.FeedbackInput) => Promise<ActionResult>
}

const GameContext = createContext<GameApi | null>(null)
const now = () => new Date().toISOString()

export type Boot = { mode: 'local'; load: LoadResult } | { mode: 'remote' }

export function GameProvider({ boot, children }: { boot: Boot; children: ReactNode }) {
  return boot.mode === 'local' ? <LocalProvider boot={boot.load}>{children}</LocalProvider> : <RemoteProvider>{children}</RemoteProvider>
}

type Dispatch = (action: Action) => Promise<ActionResult>

/** Shared API surface: everything except how actions reach the authority. */
function buildApi(dispatch: Dispatch): Omit<GameApi, 'mode' | 'connection' | 'state' | 'event' | 'leaderboard' | 'isAdmin' | 'unlockAdmin' | 'lockAdmin' | 'judge' | 'superadmin' | 'sessionExpired' | 'manageJudges' | 'mySide' | 'offlineOf' | 'online' | 'controls' | 'register' | 'resume' | 'issueResumeCode' | 'joinSession' | 'leaveStation' | 'pairMatch' | 'switchParticipant' | 'tickClock' | 'updateSettings' | 'viewOf' | 'runFor' | 'tickFor'> {
  return {
    resetEvent: () => dispatch({ type: 'resetEvent' }),
    createMatch: (config) => dispatch({ type: 'createMatch', config }),
    discardMatch: () => dispatch({ type: 'discardMatch' }),
    proceedToAuction: () => dispatch({ type: 'proceedToAuction' }),
    bid: (side, amount) => dispatch({ type: 'bid', side, amount }),
    pass: (side) => dispatch({ type: 'pass', side }),
    setClockRunning: (running) => dispatch({ type: 'setClockRunning', running }),
    advanceLot: () => dispatch({ type: 'advanceLot' }),
    continueToMission: () => dispatch({ type: 'continueToMission' }),
    setShow: (patch) => dispatch({ type: 'setShow', patch }),
    acknowledgeTwist: () => dispatch({ type: 'acknowledgeTwist' }),
    startSolution: (side) => dispatch({ type: 'startSolution', side }),
    updateDraft: (side, draft) => dispatch({ type: 'updateDraft', side, draft }),
    submitSolution: (side) => dispatch({ type: 'submitSolution', side }),
    autoSubmit: (side) => dispatch({ type: 'autoSubmit', side }),
    replay: () => dispatch({ type: 'replay' }),
    saveFeedback: (runId, input) => dispatch({ type: 'saveFeedback', runId, input }),
    queueSubmission: (submissionId) => dispatch({ type: 'queueSubmission', submissionId }),
    saveScoreDraft: (submissionId, entries) => dispatch({ type: 'saveScoreDraft', submissionId, entries }),
    submitScores: (submissionId, entries) => dispatch({ type: 'submitScores', submissionId, entries }),
    verifyScore: (submissionId) => dispatch({ type: 'verifyScore', submissionId }),
    publishScore: (submissionId) => dispatch({ type: 'publishScore', submissionId }),
    correctScore: (submissionId, criterion, value, reason) => dispatch({ type: 'correctScore', submissionId, criterion, value, reason }),
    reopenSubmission: (submissionId, reason) => dispatch({ type: 'reopenSubmission', submissionId, reason }),
    setLeaderboardLock: (locked, reason) => dispatch({ type: 'setLeaderboardLock', locked, reason }),
    cancelRun: (gameId, reason) => dispatch({ type: 'cancelRun', gameId, reason }),
    clearLobby: (reason) => dispatch({ type: 'clearLobby', reason }),
    returnToLobby: (gameId) => dispatch({ type: 'returnToLobby', gameId }),
    hideFromLobby: (gameId) => dispatch({ type: 'hideFromLobby', gameId }),
  }
}

/* ---------------- single-device mode ---------------- */

function LocalProvider({ boot, children }: { boot: LoadResult; children: ReactNode }) {
  const [corrupt, setCorrupt] = useState(boot.kind === 'corrupt' ? boot : null)
  const [event, setEvent] = useState<EventState>(() => (boot.kind === 'ok' ? boot.state : E.emptyEvent(now())))
  // Actions read and write through this ref so two clicks in the same frame see each other's result.
  const evRef = useRef(event)
  const state = useMemo(() => E.activeView(event), [event])
  const leaderboard = useMemo(() => eligibleRows(event), [event])

  const commitEvent = useCallback((next: EventState) => {
    evRef.current = next
    setEvent(next)
  }, [])

  // Nothing is written while a corrupt save is awaiting the user's decision.
  useEffect(() => {
    if (!corrupt) saveEvent(event)
  }, [event, corrupt])

  const apply = useCallback(
    (action: Action, gameId?: string | null) => {
      const ev = evRef.current
      const r = applyAction(ev, action, { at: now(), nowMs: Date.now(), gameId: gameId === undefined ? ev.activeGameId : gameId })
      let next = r.ev
      if (action.type === 'register' && r.gameId) next = E.setActive(next, r.gameId)
      if (next !== ev) commitEvent(next)
      return r
    },
    [commitEvent],
  )

  const dispatch = useCallback<Dispatch>((action) => {
    const r = apply(action)
    return Promise.resolve({ ok: r.ok, message: r.message })
  }, [apply])
  const resume = useCallback((gameId: string) => {
    const found = evRef.current.participants.some((p) => p.gameId === gameId)
    if (found) commitEvent(E.setActive(evRef.current, gameId))
    return Promise.resolve(found ? { ok: true, message: 'Resumed.' } : { ok: false, message: 'No registration with that Game ID on this device.' })
  }, [commitEvent])
  const switchParticipant = useCallback((gameId: string | null) => commitEvent(E.setActive(evRef.current, gameId)), [commitEvent])

  // buildApi only stores the dispatcher in closures; refs are read when an action runs, not during render.
  // eslint-disable-next-line react-hooks/refs
  const base = useMemo(() => buildApi(dispatch), [dispatch])
  const api = useMemo<GameApi>(() => {
    return {
      ...base,
      mode: 'local',
      connection: 'local',
      state,
      event,
      leaderboard,
      isAdmin: true,
      unlockAdmin: () => Promise.resolve({ ok: true, message: '' }),
      lockAdmin: () => {},
      judge: null,
      superadmin: false,
      sessionExpired: false,
      manageJudges: () => Promise.resolve({ ok: false, message: 'Judge accounts need the event server.' }),
      mySide: null,
      offlineOf: () => [],
      online: null,
      controls: () => true,
      register: (input) => dispatch({ type: 'register', input }),
      resume,
      issueResumeCode: () => Promise.resolve({ ok: false, message: 'Resume codes need the event server.' }),
      joinSession: () => Promise.resolve({ ok: false, message: 'Joining a match from another station needs the event server.' }),
      pairMatch: () => Promise.resolve({ ok: false, message: 'Matchmaking needs the event server.' }),
      leaveStation: () => (switchParticipant(null), Promise.resolve({ ok: true, message: '' })),
      switchParticipant,
      tickClock: (deltaMs) => void apply({ type: 'tick', deltaMs }),
      viewOf: (gid) => E.activeView({ ...event, activeGameId: gid }),
      runFor: (gid, action) => {
        const r = apply(action, gid)
        return Promise.resolve({ ok: r.ok, message: r.message })
      },
      tickFor: (gid, deltaMs) => void apply({ type: 'tick', deltaMs }, gid),
      updateSettings: (patch) => dispatch({ type: 'updateSettings', patch }),
    }
  }, [state, event, leaderboard, apply, base, dispatch, resume, switchParticipant])

  if (corrupt) {
    return (
      <Recovery
        raw={corrupt.raw}
        error={corrupt.error}
        onReset={() => {
          localStorage.removeItem(STORAGE_KEY)
          setCorrupt(null)
          commitEvent(E.emptyEvent(now()))
        }}
      />
    )
  }
  return <GameContext.Provider value={api}>{children}</GameContext.Provider>
}

/* ---------------- event-server mode ---------------- */

/** Counts the live countdown (intro, bidding or result pause) down locally from the last confirmed snapshot. Display only; the server decides. */
function withLocalClock(view: GameState, elapsed: number): GameState {
  const s = view.run?.session
  const lot = s?.lots[s.current]
  if (!s || !lot || !lot.running || elapsed <= 0) return view
  const lots = s.lots.map((l, i) => (i === s.current ? { ...l, remainingMs: Math.max(0, l.remainingMs - elapsed) } : l))
  return { ...view, run: { ...view.run!, session: { ...s, lots } } }
}

function RemoteProvider({ children }: { children: ReactNode }) {
  const [gameId, setGameId] = useState<string | null>(() => device.gameId())
  // Bumped on sign-in / sign-out so the event stream reconnects with (or without) the session cookie.
  const [authEpoch, setAuthEpoch] = useState(0)
  const signedIn = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [payload, setPayload] = useState<(Payload & { receivedAt: number }) | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [clockNow, setClockNow] = useState(() => performance.now())
  const { route, param } = useRoute()
  // Unthrottled streams for the projector and the host's show console; the preview thumbnail stays on the normal stream.
  const live = (route === 'present' && param !== 'preview') || (route === 'admin' && param === 'show')
  const gameRef = useRef(gameId)
  useEffect(() => {
    gameRef.current = gameId
  }, [gameId])
  // Actions resolve only once the state they produced has been received and rendered.
  const waiters = useRef<{ version: number; done: () => void }[]>([])
  useEffect(() => {
    const v = payload?.version ?? 0
    waiters.current = waiters.current.filter((w) => (w.version <= v ? (w.done(), false) : true))
  }, [payload])
  const rendered = useCallback((version: number | undefined) => {
    if (!version) return Promise.resolve()
    return new Promise<void>((done) => {
      const timer = window.setTimeout(done, 4000) // the reply is still true even if the push is late
      waiters.current.push({ version, done: () => (window.clearTimeout(timer), done()) })
    })
  }, [])

  useEffect(
    () => {
      // Only a subscription opened while signed in may report "your session ended".
      let armed = signedIn.current
      return subscribe(
        gameId,
        (p) => {
          if (p.admin) {
            signedIn.current = true
            armed = true
          } else if (armed && signedIn.current) {
            armed = false
            signedIn.current = false
            setSessionExpired(true)
          }
          // A stale Game ID (event reset, or another event) is dropped instead of showing an empty participant.
          if (gameId && !p.admin && !p.event.participants.some((x) => x.gameId === gameId)) {
            const own = device.ownGameId()
            const next = own && own !== gameId ? own : null
            if (!next) device.setKey(null)
            device.setGameId(next)
            setGameId(next)
            return
          }
          setPayload({ ...p, receivedAt: performance.now() })
        },
        setConnection,
        live,
      )
    },
    [gameId, authEpoch, live],
  )

  // Another tab signed in or out (the cookie is shared): reconnect so this tab picks up that session.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_KEY) setAuthEpoch((n) => n + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const choose = useCallback((id: string | null) => {
    device.setGameId(id)
    setPayload(null)
    setGameId(id)
  }, [])

  // An admin paired this registration as Side B: join that match on this station, with this station's own Game ID.
  const pairedSessionId = payload?.paired?.sessionId
  useEffect(() => {
    if (!pairedSessionId) return
    void send({ type: 'joinSession', sessionId: pairedSessionId }, gameRef.current).then((r) => {
      if (r.ok && r.gameId) choose(r.gameId)
    })
  }, [pairedSessionId, choose])

  const event = useMemo<EventState | null>(() => {
    if (!payload) return null
    return { ...payload.event, activeGameId: gameId, settings: { ...payload.event.settings, operator: payload.judge ?? '' } }
  }, [payload, gameId])

  const state = useMemo(() => {
    if (!event || !payload) return E.EMPTY_VIEW
    return withLocalClock(E.activeView(event), clockNow - payload.receivedAt)
  }, [event, payload, clockNow])

  const claims = payload?.claims ?? {}
  // The side this station claimed; a station that hosts the match (A) claims nothing, so 'other' claims on any side mean A.
  const mySide: SideId | null = Object.keys(claims).find((id) => claims[id] === 'you') ?? (Object.values(claims).includes('other') ? 'A' : null)

  const dispatch = useCallback<Dispatch>(
    async (action) => {
      const r = await send(action, gameRef.current)
      await rendered(r.version)
      return { ok: r.ok, message: r.message }
    },
    [rendered],
  )

  // buildApi only stores the dispatcher in closures; refs are read when an action runs, not during render.
  // eslint-disable-next-line react-hooks/refs
  const base = useMemo(() => buildApi(dispatch), [dispatch])
  const api = useMemo<GameApi | null>(() => {
    if (!event || !payload) return null
    const serverOp = async (action: ServerAction, gid: string | null) => send(action, gid)
    return {
      ...base,
      mode: 'remote',
      connection,
      state,
      event,
      leaderboard: payload.leaderboard,
      isAdmin: payload.admin,
      async unlockAdmin(name, password) {
        const r = await login(name, password)
        if (r.ok) {
          signedIn.current = true
          setSessionExpired(false)
          setAuthEpoch((n) => n + 1)
          announceAuth()
        }
        return { ok: !!r.ok, message: r.message ?? '' }
      },
      lockAdmin() {
        signedIn.current = false
        setSessionExpired(false)
        void logout().then(() => {
          setAuthEpoch((n) => n + 1)
          announceAuth()
        })
      },
      judge: payload.judge,
      superadmin: payload.superadmin,
      sessionExpired,
      manageJudges: (action) => serverOp(action, null),
      mySide,
      offlineOf: (sid) => payload?.offline?.[sid] ?? [],
      online: payload?.online ?? null,
      controls: (side) => !mySide || mySide === side,
      async register(input) {
        const r = await send({ type: 'register', input }, null)
        if (r.ok && r.gameId) {
          if (r.key) device.setKey(r.key)
          choose(r.gameId)
        }
        return { ok: r.ok, message: r.message }
      },
      async resume(code) {
        const r = await serverOp({ type: 'resume', code }, null)
        if (r.ok && r.gameId) {
          if (r.key) device.setKey(r.key)
          choose(r.gameId)
        }
        return { ok: r.ok, message: r.message }
      },
      async issueResumeCode(gid) {
        const r = await serverOp({ type: 'issueResumeCode', gameId: gid }, null)
        return { ok: r.ok, message: r.message }
      },
      async joinSession(sessionId) {
        const r = await serverOp({ type: 'joinSession', sessionId }, gameRef.current)
        if (r.ok && r.gameId) choose(r.gameId)
        return { ok: r.ok, message: r.message }
      },
      async leaveStation() {
        try {
          const r = await serverOp({ type: 'leaveStation' }, null)
          return { ok: r.ok, message: r.message }
        } finally {
          // Forget the registration here even if the server could not be reached.
          device.setKey(null)
          choose(null)
        }
      },
      async pairMatch(gameIds, hold) {
        const r = await serverOp({ type: 'pairMatch', gameIds, hold }, null)
        await rendered(r.version)
        return { ok: r.ok, message: r.message }
      },
      switchParticipant: choose,
      // The server runs the auction clock (intro, bidding, result pause); this only refreshes the local countdown display.
      tickClock: () => setClockNow(performance.now()),
      viewOf: (gid) => withLocalClock(E.activeView({ ...event, activeGameId: gid }), clockNow - payload.receivedAt),
      async runFor(gid, action) {
        const r = await send(action, gid)
        await rendered(r.version)
        return { ok: r.ok, message: r.message }
      },
      tickFor: () => setClockNow(performance.now()),
      updateSettings(patch) {
        // The operator is the signed-in judge, set by the server; it is never taken from the client.
        const { operator: _op, ...rest } = patch
        return Object.keys(rest).length ? dispatch({ type: 'updateSettings', patch: rest }) : Promise.resolve({ ok: true, message: '' })
      },
    }
  }, [event, payload, state, connection, mySide, choose, base, dispatch, sessionExpired, clockNow, rendered])

  // eslint-disable-next-line react-hooks/refs -- same false positive: `api` holds closures, it does not read refs
  if (!api) return <Connecting status={connection} />
  return <GameContext.Provider value={api}>{children}</GameContext.Provider>
}

function Connecting({ status }: { status: Connection }) {
  return (
    <div className="grid min-h-svh place-items-center bg-paper px-6 text-ink">
      <div className="fade-later max-w-sm text-center" role="status" aria-live="polite">
        <p className="font-display text-3xl">TimeAuction</p>
        <p className="mt-3 text-[15px] text-ink-soft">
          {status === 'reconnecting' ? 'The event server is not answering. Retrying automatically…' : 'Connecting to the event server…'}
        </p>
      </div>
    </div>
  )
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>')
  return ctx
}
