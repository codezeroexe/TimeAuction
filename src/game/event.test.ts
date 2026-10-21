import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, createSession, passLot, placeBid, nextValidBid, setRunning, startAuction } from './auction.ts'
import { matchRuleset } from './draw.ts'
import {
  activeMatch, activeView, cancelRun, clearLobby, currentRoom, lobbyParticipants, lobbyWaiting, returnToLobby, hideFromLobby, correctScore, dashboardTotals, floorMatches, DEFAULT_DISPLAY, displayOf, emptyEvent, feedbackErrors, publishScore, queueSubmission,
  reopenSubmission, rooms, saveFeedback, saveScoreDraft, setActive, setLeaderboardLock, setShow, submitScores, verifyScore, waitingParticipants, withView,
} from './event.ts'
import { eligibleRows, rankRows } from './leaderboard.ts'
import { checkEvent, checkRun, verifyChain } from './integrity.ts'
import { emptyEntries, scoreTotal, toolTotal, RUBRIC_MAX } from './scoring.ts'
import { TWISTS } from '../data/scenario.ts'
import { loadEvent } from '../state/storage.ts'
import type { CriterionEntry, CriterionId, EventState, MatchType, Run, Session, ShowDisplay, ShowStage } from './types.ts'

const AT = '2026-10-12T10:00:00.000Z'

/** A finished normal-rules session where Side A wins lots 0–2 and Side B the rest. */
function finishedSession(ids: { game: string; run: string; ses: string }, matchType: MatchType = 'ivbot'): Session {
  const bot = matchType === 'ivbot' || matchType === 'tvbot'
  let s = createSession({
    sessionId: ids.ses, gameId: ids.game, runId: ids.run, matchType, rules: matchRuleset('normal', ids.run, 2), at: AT, stationId: 'STN-T',
    sides: [
      { kind: 'individual', name: 'Ada', members: ['Ada'], controller: 'human' },
      bot ? { kind: 'bot', name: 'ChronoBot', members: [], controller: 'bot' } : { kind: 'team', name: 'Orbit', members: ['G', 'K'], controller: 'human' },
    ],
  })
  s = setRunning(startAuction(s, AT), true)
  for (let i = 0; i < 5; i++) {
    const w = i < 3 ? 'A' : 'B'
    s = placeBid(s, w, nextValidBid(s), AT).session
    s = passLot(s, w === 'A' ? 'B' : 'A', AT).session
    s = setRunning(advance(s, AT), true)
  }
  return s
}

function runWithSubmission(n: number, opts: { ranked?: boolean; matchType?: MatchType } = {}): { gameId: string; run: Run } {
  const ids = { game: `GAME-${n}`, run: `RUN-${n}`, ses: `SES-${n}` }
  const session = finishedSession(ids, opts.matchType)
  const sub = {
    submissionId: `SUB-${n}`, gameId: ids.game, runId: ids.run, sessionId: ids.ses, sideId: 'A' as const, unitName: 'Ada',
    ranked: opts.ranked ?? true, purchasedTechIds: [...session.sides.A.portfolio], selectedTechIds: [...session.sides.A.portfolio],
    characteristics: ['sustainable' as const], twistId: 'water-crisis', missionId: 'mars-settlement', text: 'x', wordCount: 80,
    submittedAt: AT, status: 'locked' as const,
  }
  const run: Run = {
    runId: ids.run, gameId: ids.game, number: 1, ranked: opts.ranked ?? true, twistId: 'water-crisis', missionId: 'mars-settlement',
    timed: false, createdAt: AT, phase: 'solution', session,
    solutions: { A: { startedAt: AT, deadline: null, draft: { techIds: sub.selectedTechIds, characteristics: sub.characteristics, text: 'x' }, submission: sub } },
  }
  return { gameId: ids.game, run }
}

function eventWith(...runs: { gameId: string; run: Run; name?: string }[]): EventState {
  let ev = emptyEvent(AT)
  runs.forEach((r, i) =>
    (ev = withView(ev, {
      version: 2, gameId: r.gameId, run: r.run, pastRuns: [],
      player: { id: `PLR-${i}`, name: r.name ?? `P${i}`, mode: 'individual', team: null, coins: 1000, registeredAt: AT },
    })),
  )
  return ev
}

const full = (scores: number[]): Record<CriterionId, CriterionEntry> => {
  const e = emptyEntries()
  ;(Object.keys(e) as CriterionId[]).forEach((k, i) => (e[k] = { score: scores[i], note: '' }))
  return e
}

function publish(ev: EventState, id: string, scores: number[]) {
  ev = queueSubmission(ev, id, AT).ev
  ev = submitScores(ev, id, full(scores), AT).ev
  ev = verifyScore(ev, id, AT).ev
  return publishScore(ev, id, AT).ev
}

test('rubric totals 100 and the total is the sum of entered scores only', () => {
  assert.equal(RUBRIC_MAX, 100)
  assert.equal(scoreTotal(full([20, 20, 20, 15, 15, 10])), 100)
  const partial = emptyEntries()
  partial.relevance.score = 12
  assert.equal(scoreTotal(partial), 12)
})

test('scoring workflow: incomplete cannot be scored, out-of-range rejected, verify before publish', () => {
  let ev = eventWith(runWithSubmission(1))
  assert.equal(verifyScore(ev, 'SUB-1', AT).ok, false, 'not queued yet')
  ev = queueSubmission(ev, 'SUB-1', AT).ev
  assert.equal(queueSubmission(ev, 'SUB-1', AT).ok, false, 'no double queue')
  const half = emptyEntries()
  half.relevance.score = 15
  const draft = saveScoreDraft(ev, 'SUB-1', half, AT)
  assert.ok(draft.ok)
  ev = draft.ev
  assert.equal(ev.scores['SUB-1'].status, 'in_scoring')
  const incomplete = submitScores(ev, 'SUB-1', half, AT)
  assert.equal(incomplete.ok, false)
  assert.match(incomplete.message, /Missing/)
  assert.equal(submitScores(ev, 'SUB-1', full([21, 0, 0, 0, 0, 0]), AT).ok, false, 'over max')
  assert.equal(submitScores(ev, 'SUB-1', full([1.5, 0, 0, 0, 0, 0]), AT).ok, false, 'whole numbers')
  ev = submitScores(ev, 'SUB-1', full([18, 16, 17, 12, 11, 8]), AT).ev
  assert.equal(publishScore(ev, 'SUB-1', AT).ok, false, 'must verify first')
  assert.equal(eligibleRows(ev).length, 0, 'scored but unverified is excluded')
  ev = verifyScore(ev, 'SUB-1', AT).ev
  assert.equal(eligibleRows(ev).length, 0, 'verified but unpublished is excluded')
  ev = publishScore(ev, 'SUB-1', AT).ev
  const rows = eligibleRows(ev)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].rubric, 82)
  assert.equal(rows[0].total, 82 + toolTotal(ev.participants[0].run!.solutions.A!.submission!))
  assert.equal(rows[0].final, false, 'provisional until locked')
})

test('leaderboard excludes unranked replays and uses competition ranking for ties', () => {
  const runs = [runWithSubmission(1), runWithSubmission(2), runWithSubmission(3), runWithSubmission(4, { ranked: false })]
  for (const r of runs) r.run.solutions.A!.submission!.twistId = '' // no tool points: rubric decides
  let ev = eventWith(...runs)
  ev = publish(ev, 'SUB-1', [20, 20, 20, 10, 10, 10]) // 90
  ev = publish(ev, 'SUB-2', [20, 20, 20, 10, 10, 10]) // 90
  ev = publish(ev, 'SUB-3', [10, 10, 10, 10, 10, 10]) // 60
  ev = publish(ev, 'SUB-4', [20, 20, 20, 15, 15, 10]) // 100 but unranked replay
  const ranked = rankRows(eligibleRows(ev))
  assert.deepEqual(ranked.map((r) => [r.submissionId, r.rank]), [['SUB-1', 1], ['SUB-2', 1], ['SUB-3', 3]])
  ev = setLeaderboardLock(ev, true, '', AT).ev
  assert.ok(eligibleRows(ev).every((r) => r.final))
  assert.equal(publishScore(ev, 'SUB-4', AT).ok, false)
})

test('leaderboard ranks by final score (rubric plus tool points)', () => {
  const a = runWithSubmission(1)
  const b = runWithSubmission(2)
  // twistId is not integrity-checked: choose twists so tool points flip a 2-point rubric lead
  const sa = a.run.solutions.A!.submission!
  const sb = b.run.solutions.A!.submission!
  const twists = Object.keys(TWISTS)
  let found = false
  for (const ta of twists) for (const tb of twists) {
    if (found) break
    sa.twistId = ta
    sb.twistId = tb
    found = toolTotal(sb) - toolTotal(sa) > 2
  }
  assert.ok(found)
  let ev = eventWith(a, b)
  const toolsA = toolTotal(a.run.solutions.A!.submission!)
  const toolsB = toolTotal(b.run.solutions.A!.submission!)
  assert.ok(toolsB > toolsA)
  ev = publish(ev, 'SUB-1', [20, 20, 20, 10, 10, 10]) // rubric 90
  ev = publish(ev, 'SUB-2', [20, 20, 20, 10, 10, 8]) // rubric 88
  const ranked = rankRows(eligibleRows(ev))
  const gap = toolsB - toolsA
  assert.deepEqual(ranked.map((r) => r.total), [90 + toolsA, 88 + toolsB].sort((x, y) => y - x))
  assert.equal(ranked[0].submissionId, 'SUB-2', 'tool points flip the rubric order')
})

test('ChronoBot never appears even if its unit is marked as having a published submission', () => {
  const r = runWithSubmission(1)
  r.run.solutions.B = { ...r.run.solutions.A!, submission: { ...r.run.solutions.A!.submission!, submissionId: 'SUB-BOT', sideId: 'B', unitName: 'ChronoBot' } }
  let ev = eventWith(r)
  ev = { ...ev, scores: { 'SUB-BOT': { ...queueSubmission(ev, 'SUB-1', AT).ev.scores['SUB-1'], submissionId: 'SUB-BOT', sideId: 'B', status: 'published', entries: full([20, 20, 20, 15, 15, 10]) } } }
  assert.equal(eligibleRows(ev).length, 0)
})

test('corrections need a reason, keep the previous value and require re-verification', () => {
  let ev = publish(eventWith(runWithSubmission(1)), 'SUB-1', [10, 10, 10, 10, 10, 10])
  assert.equal(correctScore(ev, 'SUB-1', 'relevance', 15, '', AT).ok, false)
  assert.equal(correctScore(ev, 'SUB-1', 'relevance', 25, 'typo in entry', AT).ok, false)
  ev = correctScore(ev, 'SUB-1', 'relevance', 15, 'typo in entry', AT).ev
  const rec = ev.scores['SUB-1']
  assert.equal(rec.status, 'scored')
  assert.deepEqual(rec.corrections.map((c) => [c.previous, c.corrected]), [[10, 15]])
  assert.equal(eligibleRows(ev).length, 0, 'drops off until re-verified and re-published')
  assert.ok(ev.audit.some((a) => a.reason === 'typo in entry'))
})

test('reopen unlocks the submission, voids the score and records the reason', () => {
  let ev = queueSubmission(eventWith(runWithSubmission(1)), 'SUB-1', AT).ev
  assert.equal(reopenSubmission(ev, 'SUB-1', 'no', AT).ok, false)
  ev = reopenSubmission(ev, 'SUB-1', 'participant reported a wrong technology', AT).ev
  const sol = ev.participants[0].run!.solutions.A!
  assert.equal(sol.submission, null)
  assert.equal(sol.reopened?.length, 1)
  assert.equal(ev.scores['SUB-1'], undefined)
})

test('integrity: detects tampered wallets, broken checksum chains and bad references', () => {
  const good = runWithSubmission(1)
  assert.deepEqual(checkEvent(eventWith(good)).filter((i) => i.severity === 'error'), [])
  assert.ok(verifyChain(good.run.session!).ok)

  const wallet = structuredClone(good)
  wallet.run.session!.sides.A.wallet.balance += 100
  assert.ok(checkEvent(eventWith(wallet)).some((i) => /reconcile/.test(i.message)))

  const edited = structuredClone(good)
  edited.run.session!.events[5].amount = 999
  assert.equal(verifyChain(edited.run.session!).brokenAt, 6)

  const ref = structuredClone(good)
  ref.run.solutions.A!.submission!.sessionId = 'SES-OTHER'
  const p = eventWith(ref).participants[0]
  assert.ok(checkRun(p, ref.run).some((i) => /Session ID/.test(i.message)))
  assert.equal(queueSubmission(eventWith(ref), 'SUB-1', AT).ok, false, 'integrity failure blocks scoring')

  let pub = publish(eventWith(structuredClone(good)), 'SUB-1', [10, 10, 10, 10, 10, 10])
  assert.equal(eligibleRows(pub).length, 1)
  pub = structuredClone(pub)
  pub.participants[0].run!.session!.sides.A.wallet.balance += 5
  assert.equal(eligibleRows(pub).length, 0, 'published result withheld once its run fails integrity')

  const dup = structuredClone(good)
  const buy = dup.run.session!.events.find((e) => e.type === 'purchase')!
  dup.run.session!.events.push({ ...buy, seq: dup.run.session!.events.length + 1 })
  assert.ok(checkEvent(eventWith(dup)).some((i) => /purchased 2 times/.test(i.message)))
})

test('storage: migrates v2, reports corrupt data instead of replacing it', () => {
  const v2 = { version: 2, gameId: 'GAME-X', player: { id: 'P', name: 'Ada', mode: 'individual', team: null, coins: 1000, registeredAt: AT }, run: null, pastRuns: [] }
  const m = loadEvent(() => JSON.stringify(v2), AT)
  assert.equal(m.kind, 'ok')
  if (m.kind === 'ok') {
    assert.equal(m.migratedFrom, 2)
    assert.equal(activeView(m.state).gameId, 'GAME-X')
  }
  assert.equal(loadEvent(() => '{not json', AT).kind, 'corrupt')
  assert.equal(loadEvent(() => JSON.stringify({ version: 3, participants: 'x' }), AT).kind, 'corrupt')
  assert.equal(loadEvent(() => null, AT).kind, 'ok')
})

test('replay archive: cancelling or replaying keeps the old run intact; dashboard counts real records', () => {
  let ev = publish(eventWith(runWithSubmission(1), runWithSubmission(2, { matchType: 'ivt' })), 'SUB-1', [10, 10, 10, 10, 10, 10])
  assert.equal(cancelRun(ev, 'GAME-1', 'testing cancel', AT).ok, false, 'locked submission cannot be cancelled')
  const before = JSON.stringify(ev.participants[0].run)
  const view = activeView({ ...ev, activeGameId: 'GAME-1' })
  ev = withView(ev, { ...view, run: null, pastRuns: [...view.pastRuns, view.run!] })
  assert.equal(JSON.stringify(ev.participants[0].pastRuns[0]), before)
  assert.equal(eligibleRows(ev).length, 1, 'archived ranked run still on the leaderboard')
  const t = dashboardTotals(ev)
  assert.deepEqual([t.units, t.completedAuctions, t.submitted, t.published, t.awaiting], [2, 2, 2, 1, 1])
})

test('feedback: ratings 1–5 required, one per run', () => {
  let ev = eventWith(runWithSubmission(1))
  assert.ok(feedbackErrors({ overall: 0, auctionClarity: 3, missionDifficulty: 3, comment: '' }).overall)
  const ok = saveFeedback(ev, 'GAME-1', 'RUN-1', { overall: 5, auctionClarity: 4, missionDifficulty: 3, comment: ' great ' }, AT)
  assert.ok(ok.ok)
  ev = ok.ev
  assert.equal(ev.feedback[0].comment, 'great')
  assert.equal(saveFeedback(ev, 'GAME-1', 'RUN-1', { overall: 5, auctionClarity: 4, missionDifficulty: 3, comment: '' }, AT).ok, false)
})

test('matchmaking queue: unpaired players wait; a side B or a live run does not; cancelling puts a player back', () => {
  let ev = emptyEvent(AT)
  for (const g of ['GAME-1', 'GAME-2', 'GAME-3']) ev = withView(ev, { version: 2, gameId: g, run: null, pastRuns: [], player: { id: `PLR-${g}`, name: g, mode: 'individual', team: null, coins: 1000, registeredAt: AT } })
  const ids = () => waitingParticipants(ev).map((p) => p.gameId)
  assert.deepEqual(ids(), ['GAME-1', 'GAME-2', 'GAME-3'])
  // GAME-1 plays Side A of a match whose Side B is GAME-2's registration.
  const { run } = runWithSubmission(1)
  const session = { ...run.session!, sides: { ...run.session!.sides, B: { ...run.session!.sides.B, gameId: 'GAME-2' } } }
  const paired: Run = { ...run, solutions: {}, session }
  ev = withView(ev, { ...activeView(setActive(ev, 'GAME-1')), run: paired })
  assert.deepEqual(ids(), ['GAME-3'])
  // Cancelling the match archives it and frees both players.
  const view = activeView(setActive(ev, 'GAME-1'))
  ev = withView(ev, { ...view, run: null, pastRuns: [...view.pastRuns, { ...paired, cancelled: { at: AT, by: 'Judge', reason: 'testing cancel' } }] })
  assert.deepEqual(ids(), ['GAME-1', 'GAME-2', 'GAME-3'])
})

test('show: setShow validates the stage and focused room and is not audited; rooms lists live matches oldest first', () => {
  const seat = (ev: EventState, gameId: string, run: Run) => withView(ev, { version: 2, gameId, run, pastRuns: [], player: { id: `PLR-${gameId}`, name: gameId, mode: 'individual', team: null, coins: 1000, registeredAt: AT } })
  const late = { ...runWithSubmission(2).run, session: { ...runWithSubmission(2).run.session!, createdAt: '2026-10-12T11:00:00.000Z' } }
  const early = { ...runWithSubmission(1).run, session: { ...runWithSubmission(1).run.session!, createdAt: '2026-10-12T09:00:00.000Z' } }
  const cancelled = { ...runWithSubmission(3).run, cancelled: { at: AT, by: 'Judge', reason: 'testing cancel' } }
  let ev = seat(seat(seat(emptyEvent(AT), 'GAME-2', late), 'GAME-1', early), 'GAME-3', cancelled)
  assert.deepEqual(rooms(ev).map((r) => r.room), ['SES-1', 'SES-2'])
  assert.deepEqual(ev.show, { stage: 'welcome', focus: null })
  const audited = ev.audit.length
  const staged = setShow(ev, { stage: 'auction' })
  assert.equal(staged.ok, true)
  assert.equal(staged.ev.show.stage, 'auction')
  assert.equal(staged.ev.audit.length, audited)
  assert.equal(setShow(ev, { stage: 'rules' }).ok, true)
  assert.equal(setShow(ev, { stage: 'join' }).ok, true)
  assert.equal(setShow(ev, { stage: 'nope' as ShowStage }).ok, false)
  assert.equal(setShow(ev, { focus: 'SES-3' }).ok, false, 'cancelled rooms cannot be focused')
  const focused = setShow(staged.ev, { focus: 'SES-2' })
  assert.equal(focused.ok, true)
  assert.deepEqual(focused.ev.show, { stage: 'auction', focus: 'SES-2' })
  assert.deepEqual(setShow(focused.ev, { focus: null }).ev.show, { stage: 'auction', focus: null })
})

test('show: projector fit defaults, merges, clamps and refuses junk; unknown keys are dropped; not audited', () => {
  const ev = emptyEvent(AT)
  assert.equal(ev.show.display, undefined)
  assert.deepEqual(displayOf(ev.show), DEFAULT_DISPLAY)
  const a = setShow(ev, { display: { ...DEFAULT_DISPLAY, scale: 10, top: 25, left: 4.4 } })
  assert.equal(a.ok, true)
  assert.deepEqual(a.ev.show.display, { scale: 50, top: 20, right: 0, bottom: 0, left: 4, guides: false })
  assert.deepEqual(setShow(ev, { display: { ...DEFAULT_DISPLAY, scale: 999 } }).ev.show.display?.scale, 150)
  const b = setShow(a.ev, { display: { guides: true } as ShowDisplay })
  assert.deepEqual(b.ev.show.display, { ...a.ev.show.display!, guides: true })
  assert.equal(b.ev.show.stage, 'welcome')
  for (const display of [null, 7, [], { scale: Number.NaN }, { left: Infinity }, { bottom: '5' }, { top: null }, { guides: 1 }])
    assert.equal(setShow(a.ev, { display } as never).ok, false, JSON.stringify(display))
  assert.deepEqual(setShow(ev, { stage: 'rules', junk: 1 } as never).ev.show, { stage: 'rules', focus: null })
  assert.equal(b.ev.audit.length, ev.audit.length)
})

test('floorMatches lists held (ready) and live matches, not finished ones', () => {
  const done = runWithSubmission(1)
  const held = runWithSubmission(2)
  held.run = { ...held.run, phase: 'setup', solutions: {}, session: { ...held.run.session!, status: 'ready' } }
  const ev = eventWith(done, held)
  assert.deepEqual(floorMatches(ev).map((r) => r.room), ['SES-2'])
  assert.equal(activeMatch(ev)?.room, 'SES-2')
})

test('clearLobby keeps every record; the lobby then shows only fresh waiting players and the active match', () => {
  const LATER = '2026-10-12T12:00:00.000Z', NEWER = '2026-10-12T13:00:00.000Z'
  const mk = (ev: EventState, gameId: string, run: Run | null, at: string) =>
    withView(ev, { version: 2, gameId, run, pastRuns: [], player: { id: `PLR-${gameId}`, name: gameId, mode: 'individual', team: null, coins: 1000, registeredAt: at } })
  const session = createSession({
    sessionId: 'SES-L', gameId: 'GAME-OLD2', runId: 'RUN-L', matchType: 'ivi', rules: matchRuleset('normal', 'RUN-L', 2), at: AT, stationId: 'STN-T',
    sides: [
      { kind: 'individual', name: 'Old2', members: ['Old2'], controller: 'human', gameId: 'GAME-OLD2' },
      { kind: 'individual', name: 'Old3', members: ['Old3'], controller: 'human', gameId: 'GAME-OLD3' },
    ],
  })
  const run: Run = { runId: 'RUN-L', gameId: 'GAME-OLD2', number: 1, ranked: true, twistId: 'water-crisis', missionId: 'mars-settlement', timed: false, createdAt: AT, phase: 'auction', session, solutions: {} }
  let ev = emptyEvent(AT)
  ev = mk(ev, 'GAME-OLD', null, AT)
  ev = mk(ev, 'GAME-OLD2', run, AT)
  ev = mk(ev, 'GAME-OLD3', null, AT)
  assert.equal(floorMatches(ev).length, 1)
  assert.equal(lobbyWaiting(ev).length, 1, 'before a clear, old waiting players show')
  const r = clearLobby(ev, 'new round', LATER)
  assert.ok(r.ok)
  ev = mk(r.ev, 'GAME-NEW', null, NEWER)
  assert.equal(ev.participants.length, 4, 'nothing deleted')
  assert.equal(ev.participants.find((p) => p.gameId === 'GAME-OLD2')!.run, run)
  assert.equal(ev.audit.at(-1)!.action, 'clearLobby')
  assert.deepEqual(lobbyWaiting(ev).map((p) => p.gameId), ['GAME-NEW'])
  assert.deepEqual(lobbyParticipants(ev).map((p) => p.gameId).sort(), ['GAME-NEW', 'GAME-OLD2', 'GAME-OLD3'], 'active match players stay, stale waiting hidden')
  assert.equal(waitingParticipants(ev).length, 2, 'waitingParticipants keeps its meaning')
  const back = returnToLobby(ev, 'GAME-OLD', NEWER)
  assert.ok(back.ok)
  assert.deepEqual(lobbyWaiting(back.ev).map((p) => p.gameId).sort(), ['GAME-NEW', 'GAME-OLD'])
  assert.equal(returnToLobby(ev, 'nope', NEWER).ok, false)
  const LATEST = new Date(Date.parse(NEWER) + 60_000).toISOString()
  const hid = hideFromLobby(back.ev, 'GAME-NEW', LATEST)
  assert.ok(hid.ok)
  assert.deepEqual(lobbyWaiting(hid.ev).map((p) => p.gameId), ['GAME-OLD'], 'a hidden registration leaves the lobby')
  assert.equal(hid.ev.participants.length, 4, 'nothing deleted')
  assert.equal(hid.ev.audit.at(-1)!.action, 'hideFromLobby')
  const again = returnToLobby(hid.ev, 'GAME-NEW', new Date(Date.parse(LATEST) + 1000).toISOString())
  assert.deepEqual(lobbyWaiting(again.ev).map((p) => p.gameId).sort(), ['GAME-NEW', 'GAME-OLD'], 'Return to lobby shows them again')
  assert.equal(hideFromLobby(ev, 'nope', LATEST).ok, false)
  const rm = rooms(ev)
  assert.equal(currentRoom(ev, rm)!.room, 'SES-L')
})
