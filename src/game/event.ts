import { checkRun } from './integrity.ts'
import { makeId } from './ids.ts'
import { collectSubmissions, findSubmission, type SubmissionRecord } from './records.ts'
import { emptyEntries, entriesErrors, entryError, missingCriteria, RUBRIC, finalScore, scoreTotal } from './scoring.ts'
import { SHOW_STAGES, type CriterionEntry, type CriterionId, type EventSettings, type EventState, type Feedback, type GameState, type Participant, type Run, type ScoreRecord, type Session, type ShowDisplay, type ShowState } from './types.ts'

/** Pure event-level operations. Each returns a new EventState (or the same one when rejected) plus a message. */

export interface OpResult {
  ev: EventState
  ok: boolean
  message: string
}

const fail = (ev: EventState, message: string): OpResult => ({ ev, ok: false, message })

export const DEFAULT_SHOW: ShowState = { stage: 'welcome', focus: null }
export const DEFAULT_DISPLAY: ShowDisplay = { scale: 100, top: 0, right: 0, bottom: 0, left: 0, guides: false }
/** Projector fit bounds: zoom in percent of the base zoom, each edge inset in percent of the screen. */
export const DISPLAY_LIMITS = { scale: [50, 150], inset: [0, 20] } as const
export const displayOf = (show: ShowState): ShowDisplay => show.display ?? DEFAULT_DISPLAY
/** `patch` over `base`, numbers rounded and clamped; null when a field has the wrong type or is not finite. The trust boundary for the fit. */
export function mergeDisplay(base: ShowDisplay, patch: unknown): ShowDisplay | null {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return null
  const p = patch as Record<string, unknown>
  const out = { ...base }
  for (const k of ['scale', 'top', 'right', 'bottom', 'left'] as const) {
    const v = p[k]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    const [lo, hi] = k === 'scale' ? DISPLAY_LIMITS.scale : DISPLAY_LIMITS.inset
    out[k] = Math.min(hi, Math.max(lo, Math.round(v)))
  }
  if (p.guides !== undefined) {
    if (typeof p.guides !== 'boolean') return null
    out.guides = p.guides
  }
  return out
}

export function emptyEvent(at: string): EventState {
  return {
    version: 6,
    eventId: makeId('EVT'),
    stationId: makeId('STN'),
    createdAt: at,
    settings: { eventName: 'TimeAuction event', operator: '', defaultRuleset: 'normal', defaultTimed: true, leaderboardLocked: false },
    participants: [],
    activeGameId: null,
    scores: {},
    feedback: [],
    audit: [],
    show: { ...DEFAULT_SHOW },
  }
}

export const actorOf = (ev: EventState) => ev.settings.operator.trim() || 'Unlabelled operator'

function audit(ev: EventState, at: string, action: string, target: string, reason = ''): EventState {
  return { ...ev, audit: [...ev.audit, { seq: ev.audit.length + 1, at, actor: actorOf(ev), action, target, reason }] }
}

/* ---------- participant view ---------- */

export const EMPTY_VIEW: GameState = { version: 2, gameId: null, player: null, run: null, pastRuns: [] }

export function activeView(ev: EventState): GameState {
  const p = ev.participants.find((x) => x.gameId === ev.activeGameId)
  return p ? { version: 2, gameId: p.gameId, player: p.player, run: p.run, pastRuns: p.pastRuns } : EMPTY_VIEW
}

/** Writes a participant view back into the event. A view without a player is ignored. */
export function withView(ev: EventState, view: GameState): EventState {
  if (!view.gameId || !view.player) return ev
  const old = ev.participants.find((p) => p.gameId === view.gameId)
  const next: Participant = { ...old, gameId: view.gameId, player: view.player, run: view.run, pastRuns: view.pastRuns }
  const exists = !!old
  return {
    ...ev,
    activeGameId: view.gameId,
    participants: exists ? ev.participants.map((p) => (p.gameId === view.gameId ? next : p)) : [...ev.participants, next],
  }
}

export function setActive(ev: EventState, gameId: string | null): EventState {
  if (gameId !== null && !ev.participants.some((p) => p.gameId === gameId)) return ev
  return { ...ev, activeGameId: gameId }
}

/** Registered participants not yet in a (non-cancelled) match: the admin matchmaking queue. */
export function waitingParticipants(ev: EventState): Participant[] {
  const live = (r: Run | null | undefined) => !!r?.session && !r.cancelled
  const taken = new Set<string>()
  // Every side but A (A's station is the match host, its registration is not in the queue for this match) holds its player.
  for (const p of ev.participants)
    for (const r of [p.run, ...p.pastRuns]) if (live(r)) for (const u of Object.values(r!.session!.sides)) if (u.id !== 'A' && u.gameId) taken.add(u.gameId)
  return ev.participants.filter((p) => !p.run?.session && p.pastRuns.every((r) => r.cancelled) && !taken.has(p.gameId))
}

/** Registered after the last lobby clear (or never cleared), or returned to the lobby by a judge. */
export const isFresh = (p: Participant, ev: EventState) => {
  const since = p.lobbyAt ?? p.player.registeredAt
  if (p.lobbyHiddenAt && p.lobbyHiddenAt >= since) return false
  return !ev.show.lobbySince || since >= ev.show.lobbySince
}

/** Waiting participants still in the lobby: the matchmaking queue after a clear. pairMatch still accepts any waiting registration. */
export const lobbyWaiting = (ev: EventState) => waitingParticipants(ev).filter((p) => isFresh(p, ev))

/** Everyone the lobby and projector list: fresh registrations plus the players of the ready/live match. */
export function lobbyParticipants(ev: EventState): Participant[] {
  const m = activeMatch(ev)
  const inMatch = new Set<string>(m ? [m.gameId, ...Object.values(m.session.sides).flatMap((u) => (u.gameId ? [u.gameId] : []))] : [])
  return ev.participants.filter((p) => isFresh(p, ev) || inMatch.has(p.gameId))
}

/** The one room the projector shows: the ready/live match, else the latest room created since the lobby clear. */
export function currentRoom<T extends { session: Session }>(ev: EventState, list: T[]): T | null {
  const open = list.find((r) => r.session.status === 'ready' || r.session.status === 'live')
  if (open) return open
  const since = ev.show.lobbySince
  const fresh = list.filter((r) => !since || r.session.createdAt >= since)
  return fresh[fresh.length - 1] ?? null
}

/** Every match on the event (non-cancelled active run with a session), oldest first. `room` is the session ID, the key `show.focus` uses. */
export function rooms(ev: EventState): { room: string; gameId: string; run: Run; session: Session }[] {
  return ev.participants
    .flatMap((p) => (p.run?.session && !p.run.cancelled ? [{ room: p.run.session.sessionId, gameId: p.gameId, run: p.run, session: p.run.session }] : []))
    .sort((a, b) => a.session.createdAt.localeCompare(b.session.createdAt))
}

/** Matches on the floor: held (ready) or still auctioning, oldest first. */
export const floorMatches = (ev: EventState) => rooms(ev).filter((r) => r.session.status === 'ready' || r.session.status === 'live')

/** The one match on the floor. The event runs one match at a time. */
export const activeMatch = (ev: EventState) => floorMatches(ev)[0] ?? null

/** Projector state. Not audited: it is presentation, not a judged action. */
export function setShow(ev: EventState, patch: Partial<ShowState>): OpResult {
  if (typeof patch !== 'object' || patch === null) return fail(ev, 'Show update is malformed.')
  const { stage, focus, display } = patch
  if (stage !== undefined && !SHOW_STAGES.includes(stage)) return fail(ev, 'Unknown show stage.')
  if (focus !== undefined && focus !== null && !rooms(ev).some((r) => r.room === focus)) return fail(ev, 'No match with that Session ID on this event.')
  const fit = display === undefined ? undefined : mergeDisplay(displayOf(ev.show), display)
  if (fit === null) return fail(ev, 'Projector fit settings are malformed.')
  const show: ShowState = { ...ev.show }
  if (stage !== undefined) show.stage = stage
  if (focus !== undefined) show.focus = focus
  if (fit) show.display = fit
  return { ev: { ...ev, show }, ok: true, message: 'Show updated.' }
}

/** Hides everyone waiting and every finished room from the lobby and projector. Deletes nothing; audited. */
export function clearLobby(ev: EventState, reason: string, at: string): OpResult {
  return { ev: audit({ ...ev, show: { ...ev.show, lobbySince: at } }, at, 'clearLobby', 'lobby', typeof reason === 'string' ? reason.trim().slice(0, 300) : ''), ok: true, message: 'Lobby cleared. Records are kept.' }
}

/** Brings a hidden participant back into the lobby by giving them a fresh lobby time. Audited. */
export function returnToLobby(ev: EventState, gameId: string, at: string): OpResult {
  if (!ev.participants.some((p) => p.gameId === gameId)) return fail(ev, 'Participant not found.')
  const next = { ...ev, participants: ev.participants.map((p) => (p.gameId === gameId ? { ...p, lobbyAt: at } : p)) }
  return { ev: audit(next, at, 'returnToLobby', gameId), ok: true, message: 'Returned to the lobby.' }
}

/** Hides one participant from the lobby and the projector's Teams slide (a stale or abandoned registration). Deletes nothing; audited. */
export function hideFromLobby(ev: EventState, gameId: string, at: string): OpResult {
  if (!ev.participants.some((p) => p.gameId === gameId)) return fail(ev, 'Participant not found.')
  const next = { ...ev, participants: ev.participants.map((p) => (p.gameId === gameId ? { ...p, lobbyHiddenAt: at } : p)) }
  return { ev: audit(next, at, 'hideFromLobby', gameId), ok: true, message: 'Hidden from the lobby.' }
}

/* ---------- scoring workflow ---------- */

function withScore(ev: EventState, rec: ScoreRecord): EventState {
  return { ...ev, scores: { ...ev.scores, [rec.submissionId]: rec } }
}

/** Only a locked submission whose run passes the integrity checks enters the queue. */
export function queueSubmission(ev: EventState, submissionId: string, at: string): OpResult {
  const r = findSubmission(ev, submissionId)
  if (!r?.submission) return fail(ev, 'Submission not found or not locked.')
  if (r.score) return fail(ev, 'This submission is already in the scoring workflow.')
  if (r.run.cancelled) return fail(ev, 'The run was cancelled.')
  const errors = checkRun(r.participant, r.run).filter((i) => i.severity === 'error')
  if (errors.length) return fail(ev, `Integrity check failed: ${errors[0].message}`)
  const rec: ScoreRecord = {
    submissionId,
    gameId: r.submission.gameId,
    runId: r.submission.runId,
    sessionId: r.submission.sessionId,
    sideId: r.sideId,
    status: 'awaiting',
    entries: emptyEntries(),
    queuedAt: at,
    queuedBy: actorOf(ev),
    corrections: [],
  }
  return { ev: audit(withScore(ev, rec), at, 'Queued for scoring', submissionId), ok: true, message: 'Accepted into the scoring queue.' }
}

export function saveScoreDraft(ev: EventState, submissionId: string, entries: Record<CriterionId, CriterionEntry>, at: string): OpResult {
  const rec = ev.scores[submissionId]
  if (!rec || (rec.status !== 'awaiting' && rec.status !== 'in_scoring')) return fail(ev, 'Only queued or in-progress scores can be saved as drafts.')
  const errs = entriesErrors(entries)
  if (errs.length) return fail(ev, errs[0])
  return { ev: withScore(ev, { ...rec, entries, status: 'in_scoring', draftSavedAt: at }), ok: true, message: 'Draft saved. Status: IN SCORING.' }
}

export function submitScores(ev: EventState, submissionId: string, entries: Record<CriterionId, CriterionEntry>, at: string): OpResult {
  const rec = ev.scores[submissionId]
  if (!rec || (rec.status !== 'awaiting' && rec.status !== 'in_scoring')) return fail(ev, 'Scores can only be submitted from the scoring queue.')
  const errs = entriesErrors(entries)
  if (errs.length) return fail(ev, errs[0])
  const missing = missingCriteria(entries)
  if (missing.length) return fail(ev, `All six criteria are required. Missing: ${missing.map((m) => m.label).join(', ')}.`)
  const next = { ...rec, entries, status: 'scored' as const, scoredAt: at, scoredBy: actorOf(ev) }
  const sub = findSubmission(ev, submissionId)?.submission
  const fin = sub ? finalScore(entries, sub) : scoreTotal(entries)
  const desc = `rubric ${scoreTotal(entries)}/100, final ${fin} with tool points`
  return { ev: audit(withScore(ev, next), at, `Scores submitted (${desc})`, submissionId), ok: true, message: `Scored: ${desc}. Awaiting verification.` }
}

export function verifyScore(ev: EventState, submissionId: string, at: string): OpResult {
  const rec = ev.scores[submissionId]
  if (rec?.status !== 'scored') return fail(ev, 'Only a SCORED submission can be verified.')
  if (missingCriteria(rec.entries).length) return fail(ev, 'Cannot verify an incomplete score.')
  const next = { ...rec, status: 'verified' as const, verifiedAt: at, verifiedBy: actorOf(ev) }
  return { ev: audit(withScore(ev, next), at, 'Score verified', submissionId), ok: true, message: 'Score verified. It can now be published.' }
}

export function publishScore(ev: EventState, submissionId: string, at: string): OpResult {
  const rec = ev.scores[submissionId]
  if (rec?.status !== 'verified') return fail(ev, 'Only a VERIFIED score can be published.')
  if (ev.settings.leaderboardLocked) return fail(ev, 'The leaderboard is locked. Unlock it to publish.')
  const next = { ...rec, status: 'published' as const, publishedAt: at, publishedBy: actorOf(ev) }
  return { ev: audit(withScore(ev, next), at, 'Published to leaderboard', submissionId), ok: true, message: 'Published to the leaderboard.' }
}

/** Deliberate correction: needs a reason, keeps the previous value, and sends the score back for re-verification. */
export function correctScore(ev: EventState, submissionId: string, criterion: CriterionId, value: number, reason: string, at: string): OpResult {
  const rec = ev.scores[submissionId]
  if (!rec || !['scored', 'verified', 'published'].includes(rec.status)) return fail(ev, 'Corrections apply to submitted scores only. Edit the draft instead.')
  if (rec.status === 'published' && ev.settings.leaderboardLocked) return fail(ev, 'The leaderboard is locked. Unlock it before correcting a published score.')
  if (reason.trim().length < 5) return fail(ev, 'Give a reason for the correction (at least 5 characters).')
  const err = entryError(criterion, value)
  if (err) return fail(ev, err)
  const previous = rec.entries[criterion].score!
  if (previous === value) return fail(ev, 'The corrected value is the same as the current value.')
  const label = RUBRIC.find((c) => c.id === criterion)!.label
  const next: ScoreRecord = {
    ...rec,
    entries: { ...rec.entries, [criterion]: { ...rec.entries[criterion], score: value } },
    status: 'scored',
    verifiedAt: undefined,
    verifiedBy: undefined,
    publishedAt: undefined,
    publishedBy: undefined,
    corrections: [...rec.corrections, { at, by: actorOf(ev), reason: reason.trim(), criterion, previous, corrected: value }],
  }
  return {
    ev: audit(withScore(ev, next), at, `Corrected ${label}: ${previous} → ${value}`, submissionId, reason.trim()),
    ok: true,
    message: `${label} corrected. The score must be verified${rec.status === 'published' ? ' and published' : ''} again.`,
  }
}

/** Unlocks a submission for the participant to edit. Any score in progress is voided (kept in the audit log). */
export function reopenSubmission(ev: EventState, submissionId: string, reason: string, at: string): OpResult {
  const r = findSubmission(ev, submissionId)
  if (!r?.submission) return fail(ev, 'Submission not found or not locked.')
  if (reason.trim().length < 5) return fail(ev, 'Give a reason for reopening (at least 5 characters).')
  if (!r.active) return fail(ev, 'Only a submission in the participant’s current run can be reopened; this run has been archived.')
  if (r.score?.status === 'published' && ev.settings.leaderboardLocked) return fail(ev, 'The leaderboard is locked. Unlock it first.')
  const p = r.participant
  const run = p.run!
  const sol = r.solution
  const prev = r.submission
  const nextRun = {
    ...run,
    phase: 'solution' as const,
    solutions: {
      ...run.solutions,
      [r.sideId]: {
        ...sol,
        deadline: null, // the administrator is granting more time
        draft: { techIds: [...prev.selectedTechIds], characteristics: [...prev.characteristics], text: prev.text },
        submission: null,
        reopened: [...(sol.reopened ?? []), { at, by: actorOf(ev), reason: reason.trim(), previous: prev }],
      },
    },
  }
  const scores = { ...ev.scores }
  delete scores[submissionId]
  const voided = r.score ? ` Voided score record (${r.score.status}, ${finalScore(r.score.entries, r.submission!)} points).` : ''
  const next = { ...ev, scores, participants: ev.participants.map((x) => (x.gameId === p.gameId ? { ...x, run: nextRun } : x)) }
  return { ev: audit(next, at, `Reopened submission.${voided}`, submissionId, reason.trim()), ok: true, message: 'Submission reopened. The participant can edit and resubmit it.' }
}

/* ---------- leaderboard, runs, settings, feedback ---------- */

export function setLeaderboardLock(ev: EventState, locked: boolean, reason: string, at: string): OpResult {
  if (ev.settings.leaderboardLocked === locked) return fail(ev, locked ? 'Already locked.' : 'Already unlocked.')
  if (!locked && reason.trim().length < 5) return fail(ev, 'Give a reason for unlocking (at least 5 characters).')
  const next = { ...ev, settings: { ...ev.settings, leaderboardLocked: locked, leaderboardLockedAt: locked ? at : undefined } }
  return {
    ev: audit(next, at, locked ? 'Leaderboard locked (results FINAL)' : 'Leaderboard unlocked (results PROVISIONAL)', ev.eventId, reason.trim()),
    ok: true,
    message: locked ? 'Leaderboard locked. Published results are now FINAL.' : 'Leaderboard unlocked. Results are PROVISIONAL again.',
  }
}

/** Cancels an unfinished run (no locked submission) and archives it unchanged, so it stays on record. */
export function cancelRun(ev: EventState, gameId: string, reason: string, at: string): OpResult {
  const p = ev.participants.find((x) => x.gameId === gameId)
  const run = p?.run
  if (!p || !run) return fail(ev, 'This participant has no active run.')
  if (Object.values(run.solutions).some((s) => s?.submission)) return fail(ev, 'This run has a locked submission. Start a replay instead of cancelling.')
  if (reason.trim().length < 5) return fail(ev, 'Give a reason for cancelling (at least 5 characters).')
  const cancelled = { ...run, cancelled: { at, by: actorOf(ev), reason: reason.trim() } }
  const next = { ...ev, participants: ev.participants.map((x) => (x.gameId === gameId ? { ...x, run: null, pastRuns: [...x.pastRuns, cancelled] } : x)) }
  return { ev: audit(next, at, 'Run cancelled', run.runId, reason.trim()), ok: true, message: `Run ${run.runId} cancelled and archived.` }
}

export function updateSettings(ev: EventState, patch: Partial<Omit<EventSettings, 'leaderboardLocked' | 'leaderboardLockedAt'>>, at: string): OpResult {
  if (patch.eventName !== undefined && !patch.eventName.trim()) return fail(ev, 'Event name cannot be empty.')
  const next = { ...ev, settings: { ...ev.settings, ...patch } }
  const changed = Object.keys(patch).filter((k) => k !== 'operator')
  return { ev: changed.length ? audit(next, at, `Settings changed: ${changed.join(', ')}`, ev.eventId) : next, ok: true, message: 'Settings saved.' }
}

export interface FeedbackInput {
  overall: number
  auctionClarity: number
  missionDifficulty: number
  comment: string
}

export const FEEDBACK_COMMENT_MAX = 1000

export function feedbackErrors(f: FeedbackInput): Partial<Record<keyof FeedbackInput, string>> {
  const e: Partial<Record<keyof FeedbackInput, string>> = {}
  for (const k of ['overall', 'auctionClarity', 'missionDifficulty'] as const) {
    if (!Number.isInteger(f[k]) || f[k] < 1 || f[k] > 5) e[k] = 'Choose a rating from 1 to 5.'
  }
  if (f.comment.length > FEEDBACK_COMMENT_MAX) e.comment = `Keep it under ${FEEDBACK_COMMENT_MAX} characters.`
  return e
}

export function saveFeedback(ev: EventState, gameId: string, runId: string, input: FeedbackInput, at: string, by = gameId): OpResult {
  const p = ev.participants.find((x) => x.gameId === gameId)
  if (!p || ![...p.pastRuns, p.run].some((r) => r?.runId === runId)) return fail(ev, 'Run not found for this participant.')
  if (ev.feedback.some((f) => f.runId === runId && f.gameId === by)) return fail(ev, 'Feedback for this run has already been saved.')
  const errs = feedbackErrors(input)
  if (Object.keys(errs).length) return fail(ev, Object.values(errs)[0]!)
  const fb: Feedback = { feedbackId: makeId('FBK'), gameId: by, runId, overall: input.overall, auctionClarity: input.auctionClarity, missionDifficulty: input.missionDifficulty, comment: input.comment.trim(), submittedAt: at }
  return { ev: { ...ev, feedback: [...ev.feedback, fb] }, ok: true, message: 'Feedback saved.' }
}

/* ---------- dashboard ---------- */

export function dashboardTotals(ev: EventState) {
  const subs = collectSubmissions(ev)
  const locked = subs.filter((r): r is SubmissionRecord & { submission: NonNullable<SubmissionRecord['submission']> } => !!r.submission)
  const runs = ev.participants.flatMap((p) => [...p.pastRuns, ...(p.run ? [p.run] : [])])
  const scores = Object.values(ev.scores)
  return {
    units: ev.participants.length,
    individual: ev.participants.filter((p) => p.player.mode === 'individual').length,
    team: ev.participants.filter((p) => p.player.mode === 'team').length,
    activeRuns: ev.participants.filter((p) => p.run && !Object.values(p.run.solutions).some((s) => s?.submission)).length,
    completedAuctions: runs.filter((r) => r.session?.status === 'complete').length,
    unsynced: runs.filter((r) => r.session?.status === 'complete').length,
    submitted: locked.length,
    awaiting: locked.filter((r) => !r.score || r.score.status === 'awaiting' || r.score.status === 'in_scoring').length,
    scored: scores.filter((s) => s.status === 'scored').length,
    verified: scores.filter((s) => s.status === 'verified').length,
    published: scores.filter((s) => s.status === 'published').length,
  }
}
