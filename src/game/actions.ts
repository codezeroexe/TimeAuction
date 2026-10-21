import type { CriterionEntry, CriterionId, EventSettings, EventState, GameState, MatchType, RegistrationInput, Run, RulesetId, ShowState, SideId, SolutionDraft, Submission } from './types.ts'
import { STARTING_COINS } from './rules.ts'
import { matchRuleset } from './draw.ts'
import { advance, createSession, MAX_SIDES, MIN_SIDES, passLot, placeBid, setRunning, startAuction, tick, type UnitSpec } from './auction.ts'
import { decideBot } from './bot.ts'
import { checkSolution, countWords } from './solution.ts'
import { makeId } from './ids.ts'
import { DEFAULT_MISSION_ID, twistForRun } from '../data/scenario.ts'
import * as E from './event.ts'

/**
 * Every state change in TimeAuction is one of these actions, applied by `applyAction`.
 * The same reducer runs in the browser (single-device mode) and on the event server (authoritative mode).
 */

export interface MatchConfig {
  matchType: MatchType
  rulesetId: RulesetId
  timed: boolean
  /** Every other side, in seating order. The creating player is always Side A. */
  opponents: UnitSpec[]
  /** The run waits for `revealTwist` after the auction summary (server-paired matches). */
  holdTwist?: boolean
}

export type Action =
  | { type: 'register'; input: RegistrationInput }
  | { type: 'createMatch'; config: MatchConfig }
  | { type: 'discardMatch' }
  | { type: 'proceedToAuction' }
  | { type: 'bid'; side: SideId; amount: number }
  | { type: 'pass'; side: SideId }
  | { type: 'tick'; deltaMs: number }
  | { type: 'setClockRunning'; running: boolean }
  | { type: 'advanceLot' }
  | { type: 'continueToMission' }
  | { type: 'revealTwist' }
  | { type: 'acknowledgeTwist' }
  | { type: 'startSolution'; side: SideId }
  | { type: 'updateDraft'; side: SideId; draft: SolutionDraft }
  | { type: 'submitSolution'; side: SideId }
  /** After the deadline (plus a short grace for the last draft save): lock the draft as it is. Idempotent. */
  | { type: 'autoSubmit'; side: SideId }
  | { type: 'replay' }
  | { type: 'saveFeedback'; runId: string; input: E.FeedbackInput }
  | { type: 'queueSubmission'; submissionId: string }
  | { type: 'saveScoreDraft'; submissionId: string; entries: Record<CriterionId, CriterionEntry> }
  | { type: 'submitScores'; submissionId: string; entries: Record<CriterionId, CriterionEntry> }
  | { type: 'verifyScore'; submissionId: string }
  | { type: 'publishScore'; submissionId: string }
  | { type: 'correctScore'; submissionId: string; criterion: CriterionId; value: number; reason: string }
  | { type: 'reopenSubmission'; submissionId: string; reason: string }
  | { type: 'setLeaderboardLock'; locked: boolean; reason: string }
  | { type: 'cancelRun'; gameId: string; reason: string }
  | { type: 'updateSettings'; patch: Partial<Omit<EventSettings, 'leaderboardLocked' | 'leaderboardLockedAt'>> }
  | { type: 'setShow'; patch: Partial<ShowState> }
  | { type: 'clearLobby'; reason: string }
  | { type: 'returnToLobby'; gameId: string }
  | { type: 'hideFromLobby'; gameId: string }
  | { type: 'resetEvent' }

export type ActionType = Action['type']

/** Actions that only the event administrator may perform. */
export const ADMIN_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  'queueSubmission', 'saveScoreDraft', 'submitScores', 'verifyScore', 'publishScore', 'correctScore',
  'reopenSubmission', 'setLeaderboardLock', 'cancelRun', 'updateSettings', 'setShow', 'clearLobby', 'returnToLobby', 'hideFromLobby', 'resetEvent',
])

/** Actions that act on one participant's run (identified by `ctx.gameId`). */
export const RUN_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  'createMatch', 'discardMatch', 'proceedToAuction', 'bid', 'pass', 'tick', 'setClockRunning', 'advanceLot',
  'continueToMission', 'revealTwist', 'acknowledgeTwist', 'startSolution', 'updateDraft', 'submitSolution', 'autoSubmit', 'replay', 'saveFeedback',
])

export interface ActionContext {
  at: string
  nowMs: number
  /** The participant the action is for. */
  gameId: string | null
  /** The operator label of the device sending an administrator action. */
  operator?: string
  /** Event server: the registration whose station sent a run action. */
  actor?: string
}

export interface ActionOutcome {
  ev: EventState
  ok: boolean
  message: string
  /** Set by `register`: the new participant's Game ID. */
  gameId?: string
}

const ok = (ev: EventState, message = ''): ActionOutcome => ({ ev, ok: true, message })
const no = (ev: EventState, message: string): ActionOutcome => ({ ev, ok: false, message })

/** Draft saves still land this long after the solution deadline, so the last edit is in the automatic submission. */
export const DRAFT_GRACE_MS = 3000

/** The locked record of a solution draft. */
function lockDraft(run: Run, s: NonNullable<Run['session']>, side: SideId, draft: SolutionDraft, wordCount: number, at: string): Submission {
  const unit = s.sides[side]
  return {
    submissionId: makeId('SUB'),
    gameId: run.gameId,
    runId: run.runId,
    sessionId: s.sessionId,
    sideId: side,
    unitName: unit.name,
    ranked: run.ranked && unit.ranked,
    purchasedTechIds: [...unit.portfolio],
    selectedTechIds: [...draft.techIds],
    characteristics: [...draft.characteristics],
    twistId: run.twistId,
    missionId: run.missionId,
    text: draft.text.trim(),
    wordCount,
    submittedAt: at,
    status: 'locked',
  }
}

export function applyAction(ev: EventState, action: Action, ctx: ActionContext): ActionOutcome {
  if (ADMIN_ACTIONS.has(action.type)) {
    if (ctx.operator === undefined) return adminAction(ev, action, ctx)
    // A device's own operator label is used for the audit trail, without changing the shared settings.
    const r = adminAction({ ...ev, settings: { ...ev.settings, operator: ctx.operator } }, action, ctx)
    return { ...r, ev: r.ev === ev ? ev : { ...r.ev, settings: { ...r.ev.settings, operator: ev.settings.operator } } }
  }
  if (action.type === 'register') return register(ev, action.input, ctx)
  if (!ctx.gameId || !ev.participants.some((p) => p.gameId === ctx.gameId)) return no(ev, 'Participant not found. Register or resume with your Game ID.')
  // Run actions work on the participant's view; the event's own active participant is left as it was.
  const scoped = { ...ev, activeGameId: ctx.gameId }
  const r = runAction(scoped, action, ctx)
  return { ...r, ev: r.ev === scoped ? ev : { ...r.ev, activeGameId: ev.activeGameId } }
}

function register(ev: EventState, input: RegistrationInput, ctx: ActionContext): ActionOutcome {
  const name = input.name.trim()
  const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase()
  const shown = input.mode === 'team' ? input.teamName : input.name
  if (ev.participants.some((p) => norm(p.player.team?.name ?? p.player.name) === norm(shown)))
    return no(ev, `“${shown.trim()}” is already registered. Choose a different ${input.mode === 'team' ? 'team ' : ''}name.`)
  const gameId = makeId('GAME')
  const view: GameState = {
    ...E.EMPTY_VIEW,
    gameId,
    player: {
      id: makeId('PLR'),
      name,
      mode: input.mode,
      team: input.mode === 'team' ? { name: input.teamName.trim(), members: [name, ...input.teammates.map((m) => m.trim())] } : null,
      coins: STARTING_COINS,
      registeredAt: ctx.at,
    },
  }
  const next = E.withView(ev, view)
  return { ev: { ...next, activeGameId: ev.activeGameId }, ok: true, message: 'Registered.', gameId }
}

function runAction(ev: EventState, action: Action, ctx: ActionContext): ActionOutcome {
  const { at, nowMs } = ctx
  const view = E.activeView(ev)
  const run = view.run
  const commit = (next: Run | null, message = '') => ok(E.withView(ev, { ...view, run: next }), message)
  const s = run?.session

  switch (action.type) {
    case 'createMatch': {
      const { matchType, rulesetId, timed, opponents, holdTwist } = action.config
      const { player, gameId, pastRuns } = view
      if (!player || !gameId) return no(ev, 'No participant.')
      if (s && s.status !== 'ready') return no(ev, 'A match is already in progress.')
      if (opponents.some((o) => o.controller === 'bot' || o.kind === 'bot')) return no(ev, 'ChronoBot matches are no longer offered. Every side must be a human player.')
      if (opponents.length < MIN_SIDES - 1 || opponents.length > MAX_SIDES - 1) return no(ev, `A match has ${MIN_SIDES} to ${MAX_SIDES} sides.`)
      const number = pastRuns.length + 1
      const runId = makeId('RUN')
      const base: Run = run ?? {
        runId,
        gameId,
        number,
        ranked: number === 1,
        twistId: twistForRun(runId),
        missionId: DEFAULT_MISSION_ID,
        timed,
        createdAt: at,
        phase: 'setup',
        session: null,
        solutions: {},
      }
      // Lots, clock and wildcard come from the run's own seed, so discarding and re-creating a match draws the same lots.
      const rules = matchRuleset(rulesetId, base.runId, opponents.length + 1)
      const session = createSession({
        sessionId: makeId('SES'),
        gameId,
        runId: base.runId,
        matchType,
        rules,
        at,
        stationId: ev.stationId,
        sides: [
          {
            kind: player.mode,
            name: player.team?.name ?? player.name,
            members: player.team?.members ?? [player.name],
            controller: 'human',
          },
          ...opponents,
        ],
      })
      return commit({ ...base, timed, session, ...(holdTwist ? { twistHeld: true } : {}) }, 'Match created.')
    }

    case 'discardMatch':
      return run && s?.status === 'ready' ? commit({ ...run, session: null }) : no(ev, 'Nothing to discard.')

    case 'proceedToAuction':
      if (!run || s?.status !== 'ready') return no(ev, 'The auction has already started.')
      {
        // Starting a match puts its room on the projector's Auction stage.
        const r = commit({ ...run, phase: 'auction', session: startAuction(s, at) })
        return { ...r, ev: { ...r.ev, show: { ...r.ev.show, stage: 'auction', focus: s.sessionId } } }
      }

    case 'bid':
    case 'pass': {
      if (!run || !s) return no(ev, 'No active session.')
      const r = action.type === 'bid' ? placeBid(s, action.side, action.amount, at) : passLot(s, action.side, at)
      // Rejected bids are still recorded in the session log, so the session is written either way.
      const next = r.session === s ? ev : E.withView(ev, { ...view, run: { ...run, session: r.session } })
      return { ev: next, ok: r.ok, message: r.message }
    }

    case 'tick': {
      if (!run || !s) return no(ev, 'No active session.')
      const next = tick(s, action.deltaMs, at, decideBot)
      return next === s ? no(ev, '') : commit({ ...run, session: next, phase: next.status === 'complete' ? 'summary' : run.phase })
    }

    case 'setClockRunning': {
      if (!run || !s) return no(ev, 'No active session.')
      const next = setRunning(s, action.running)
      return next === s ? no(ev, '') : commit({ ...run, session: next })
    }

    case 'advanceLot': {
      if (!run || !s) return no(ev, 'No active session.')
      const next = advance(s, at)
      if (next === s) return no(ev, 'The current technology has not been decided yet.')
      return commit({ ...run, session: next, phase: next.status === 'complete' ? 'summary' : run.phase })
    }

    case 'continueToMission':
      if (run?.phase !== 'summary') return no(ev, 'Not at the auction summary.')
      if (run.twistHeld && !run.twistRevealedAt) return no(ev, 'Watch the main screen: the host reveals the Timeline Twist for everyone.')
      return commit({ ...run, phase: 'twist' })

    case 'revealTwist': {
      if (!run || !s) return no(ev, 'No active session.')
      if (s.status !== 'complete') return no(ev, 'The auction has not finished yet.')
      if (run.twistRevealedAt) return ok(ev, 'The Timeline Twist is already revealed.')
      if (run.phase !== 'summary') return no(ev, 'Not at the auction summary.')
      return commit({ ...run, phase: 'twist', twistRevealedAt: at }, 'Timeline Twist revealed.')
    }

    case 'acknowledgeTwist':
      return run?.phase === 'twist' ? commit({ ...run, phase: 'mission' }) : no(ev, 'Not at the timeline twist.')

    case 'startSolution': {
      if (!run || (run.phase !== 'mission' && run.phase !== 'solution')) return no(ev, 'The mission has not been reached yet.')
      const side = action.side
      const rules = s?.rules
      const unit = s?.sides[side]
      // No clock for a unit that cannot submit: it only needs the recovery options.
      if (!rules || !unit || run.solutions[side] || unit.controller !== 'human' || unit.portfolio.length < rules.solutionTechCount)
        return run.phase === 'solution' ? ok(ev) : commit({ ...run, phase: 'solution' })
      return commit({
        ...run,
        phase: 'solution',
        solutions: {
          ...run.solutions,
          [side]: {
            startedAt: at,
            deadline: run.timed ? nowMs + rules.solutionSeconds * 1000 : null,
            draft: { techIds: [], characteristics: [], text: '' },
            submission: null,
          },
        },
      })
    }

    case 'updateDraft': {
      const sol = run?.solutions[action.side]
      if (!run || !sol || sol.submission) return no(ev, 'This solution is locked.')
      if (sol.deadline !== null && nowMs > sol.deadline + DRAFT_GRACE_MS) return no(ev, 'The solution time is over.')
      return commit({ ...run, solutions: { ...run.solutions, [action.side]: { ...sol, draft: { techIds: action.draft.techIds, characteristics: action.draft.characteristics, text: action.draft.text } } } }, 'Draft saved.')
    }

    case 'submitSolution': {
      const side = action.side
      const sol = run?.solutions[side]
      if (!run || !s || !sol) return no(ev, 'No solution in progress.')
      if (sol.submission) return no(ev, 'This solution is already submitted and locked.')
      const unit = s.sides[side]
      const check = checkSolution(sol.draft, unit.portfolio, s.rules.solutionTechCount)
      if (!check.valid) return no(ev, check.techs ?? check.characteristics ?? check.words ?? 'Invalid solution.')
      return commit({ ...run, solutions: { ...run.solutions, [side]: { ...sol, submission: lockDraft(run, s, side, sol.draft, check.wordCount, at) } } }, 'Solution submitted and locked.')
    }

    case 'autoSubmit': {
      const side = action.side
      const sol = run?.solutions[side]
      if (!run || !s || !sol) return no(ev, 'No solution in progress.')
      if (sol.submission) return ok(ev, 'Already submitted.')
      if (sol.deadline === null || nowMs <= sol.deadline + DRAFT_GRACE_MS) return no(ev, 'The solution time is not over yet.')
      // Keep only owned technologies, once each, so the record stays consistent; everything else is taken as written.
      const owned = s.sides[side].portfolio
      const draft = { ...sol.draft, techIds: [...new Set(sol.draft.techIds)].filter((t) => owned.includes(t)) }
      const submission = { ...lockDraft(run, s, side, draft, countWords(draft.text), at), auto: true as const }
      return commit({ ...run, solutions: { ...run.solutions, [side]: { ...sol, submission } } }, 'Time is up: solution submitted automatically.')
    }

    case 'replay':
      return ok(E.withView(ev, { ...view, run: null, pastRuns: run ? [...view.pastRuns, run] : view.pastRuns }), 'Replay started.')

    case 'saveFeedback': {
      const r = E.saveFeedback(ev, view.gameId!, action.runId, action.input, at, ctx.actor ?? view.gameId!)
      return { ev: r.ev, ok: r.ok, message: r.message }
    }

    default:
      return no(ev, `Unknown action.`)
  }
}

function adminAction(ev: EventState, action: Action, { at }: ActionContext): ActionOutcome {
  switch (action.type) {
    case 'queueSubmission': return E.queueSubmission(ev, action.submissionId, at)
    case 'saveScoreDraft': return E.saveScoreDraft(ev, action.submissionId, action.entries, at)
    case 'submitScores': return E.submitScores(ev, action.submissionId, action.entries, at)
    case 'verifyScore': return E.verifyScore(ev, action.submissionId, at)
    case 'publishScore': return E.publishScore(ev, action.submissionId, at)
    case 'correctScore': return E.correctScore(ev, action.submissionId, action.criterion, action.value, action.reason, at)
    case 'reopenSubmission': return E.reopenSubmission(ev, action.submissionId, action.reason, at)
    case 'setLeaderboardLock': return E.setLeaderboardLock(ev, action.locked, action.reason, at)
    case 'cancelRun': return E.cancelRun(ev, action.gameId, action.reason, at)
    case 'updateSettings': return E.updateSettings(ev, action.patch, at)
    case 'setShow': return E.setShow(ev, action.patch)
    case 'clearLobby': return E.clearLobby(ev, action.reason, at)
    case 'returnToLobby': return E.returnToLobby(ev, action.gameId, at)
    case 'hideFromLobby': return E.hideFromLobby(ev, action.gameId, at)
    case 'resetEvent': {
      // The projector fit belongs to the venue's projector, not the event: keep it.
      const fresh = E.emptyEvent(at)
      return ok(ev.show.display ? { ...fresh, show: { ...fresh.show, display: ev.show.display } } : fresh, 'Event reset.')
    }
    default: return no(ev, 'Unknown action.')
  }
}
