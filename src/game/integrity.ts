import { getTech } from '../data/technologies.ts'
import { MAX_SIDES, MIN_SIDES, openingBid, sidesOf } from './auction.ts'
import { eventHash, GENESIS } from './checksum.ts'
import { collectSubmissions, runsOf } from './records.ts'
import { summarise } from './summary.ts'
import type { EventState, Participant, Run, Session } from './types.ts'

/**
 * Prototype-level integrity checks over locally saved data. They detect accidental corruption and
 * inconsistent records; they are not tamper-proof and nothing here is cryptographically signed.
 */

export interface Issue {
  severity: 'error' | 'warning'
  ref: string
  message: string
}

export function verifyChain(session: Session): { ok: boolean; legacy: boolean; brokenAt?: number } {
  const events = session.events
  if (events.length > 0 && events.every((e) => !e.hash)) return { ok: true, legacy: true }
  let prev = GENESIS
  for (const e of events) {
    const { hash, ...rest } = e
    if (hash !== eventHash(rest, prev)) return { ok: false, legacy: false, brokenAt: e.seq }
    prev = hash
  }
  return { ok: true, legacy: false }
}

export function checkSession(s: Session): Issue[] {
  const issues: Issue[] = []
  const err = (message: string) => issues.push({ severity: 'error', ref: s.sessionId, message })

  s.events.forEach((e, i) => {
    if (e.seq !== i + 1) err(`Event ${i + 1} is out of order (seq ${e.seq}).`)
    if (e.sessionId !== s.sessionId) err(`Event ${e.seq} belongs to another session (${e.sessionId}).`)
  })
  const chain = verifyChain(s)
  if (!chain.ok) err(`Event checksum chain breaks at event ${chain.brokenAt}: the log was modified after it was written.`)
  if (chain.legacy) issues.push({ severity: 'warning', ref: s.sessionId, message: 'Saved before checksums were added; the event chain cannot be verified.' })

  if (s.lots.length !== s.rules.lotCount) err(`${s.lots.length} technologies auctioned; the ruleset says ${s.rules.lotCount}.`)
  const sides = sidesOf(s)
  if (Object.keys(s.sides).length !== sides.length) err('Session has a side ID outside A–L.')
  if (sides.length < MIN_SIDES || sides.length > MAX_SIDES) err(`${sides.length} sides; a match needs ${MIN_SIDES} to ${MAX_SIDES}.`)
  const bots = sides.filter((id) => s.sides[id].controller === 'bot').length
  if (bots > 1) err('Two computer opponents in one session.')
  if (bots === 1 && sides.length !== 2) err('A computer opponent is seated in a match of more than two sides.')
  const gameIds = sides.flatMap((id) => (s.sides[id].gameId ? [s.sides[id].gameId!] : []))
  if (new Set(gameIds).size !== gameIds.length) err('Two sides share a Game ID.')

  for (const lot of s.lots) {
    // Informational: a lot sold at its starting bid after most sides passed. Timing is not checked.
    if (lot.status === 'sold' && lot.bid === openingBid(s.rules, lot.techId) && lot.passed.length * 2 > sides.length)
      issues.push({ severity: 'warning', ref: s.sessionId, message: `${getTech(lot.techId).name} sold at its starting bid after most sides passed.` })
    const finals = s.events.filter((e) => (e.type === 'sold' || e.type === 'unsold') && e.techId === lot.techId)
    const buys = s.events.filter((e) => e.type === 'purchase' && e.techId === lot.techId)
    if (finals.length > 1) err(`${lot.techId} was finalised ${finals.length} times.`)
    if (buys.length > 1) err(`${lot.techId} was purchased ${buys.length} times.`)
    if (lot.status === 'sold' && buys.length !== 1) err(`${lot.techId} is SOLD but has ${buys.length} purchase events.`)
    if (lot.status !== 'sold' && buys.length > 0) err(`${lot.techId} is not SOLD but has a purchase event.`)
    const buy = buys[0]
    if (buy && (buy.sideId !== lot.leader || buy.amount !== lot.bid)) err(`${lot.techId} purchase does not match the winning bid.`)
  }

  const sum = summarise(s)
  for (const id of sides) {
    const u = s.sides[id]
    if (u.wallet.balance < 0) err(`${u.name} has a negative balance.`)
    if (new Set(u.portfolio).size !== u.portfolio.length) err(`${u.name} owns a technology twice.`)
    if (!sum[id].reconciled) err(`${u.name}: wallet ${u.wallet.balance} CC does not reconcile with purchases (${sum[id].initial} − ${sum[id].spent}).`)
  }
  return issues
}

export function checkRun(p: Participant, run: Run): Issue[] {
  const issues: Issue[] = []
  const err = (message: string) => issues.push({ severity: 'error', ref: run.runId, message })
  if (run.gameId !== p.gameId) err(`Run belongs to Game ID ${run.gameId}, stored under ${p.gameId}.`)
  const s = run.session
  if (!s) return issues
  if (s.runId !== run.runId) err(`Session ${s.sessionId} references run ${s.runId}.`)
  if (s.gameId !== p.gameId) err(`Session ${s.sessionId} references Game ID ${s.gameId}.`)
  issues.push(...checkSession(s))

  for (const id of sidesOf(s)) {
    const sub = run.solutions[id]?.submission
    if (!sub) continue
    const ref = (field: string, a: string, b: string) => a !== b && err(`Submission ${sub.submissionId}: ${field} ${a} ≠ ${b}.`)
    ref('Game ID', sub.gameId, p.gameId)
    ref('Run ID', sub.runId, run.runId)
    ref('Session ID', sub.sessionId, s.sessionId)
    const owned = s.sides[id].portfolio
    if (sub.selectedTechIds.some((t) => !sub.purchasedTechIds.includes(t) || !owned.includes(t))) err(`Submission ${sub.submissionId} uses a technology the unit does not own.`)
    if (new Set(sub.selectedTechIds).size !== sub.selectedTechIds.length || (!sub.auto && sub.selectedTechIds.length < s.rules.solutionTechCount))
      err(`Submission ${sub.submissionId} does not select at least ${s.rules.solutionTechCount} distinct technologies.`)
  }
  return issues
}

export function checkEvent(ev: EventState): Issue[] {
  const issues: Issue[] = []
  const dupes = (label: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) issues.push({ severity: 'error', ref: id, message: `Duplicate ${label} ${id}.` })
      seen.add(id)
    }
  }
  const runs = ev.participants.flatMap((p) => runsOf(p).map((run) => ({ p, run })))
  dupes('Game ID', ev.participants.map((p) => p.gameId))
  dupes('Run ID', runs.map((r) => r.run.runId))
  dupes('Session ID', runs.flatMap((r) => (r.run.session ? [r.run.session.sessionId] : [])))
  const subs = collectSubmissions(ev).flatMap((r) => (r.submission ? [r.submission.submissionId] : []))
  dupes('Submission ID', subs)

  for (const { p, run } of runs) issues.push(...checkRun(p, run))
  if (ev.activeGameId && !ev.participants.some((p) => p.gameId === ev.activeGameId))
    issues.push({ severity: 'error', ref: ev.activeGameId, message: 'Active participant does not exist.' })
  for (const score of Object.values(ev.scores)) {
    if (!subs.includes(score.submissionId)) issues.push({ severity: 'error', ref: score.submissionId, message: 'Score record references a submission that does not exist.' })
  }
  return issues
}

