import { sidesOf } from './auction.ts'
import { checkRun } from './integrity.ts'
import { collectSubmissions } from './records.ts'
import { finalScore, scoreTotal, toolTotal } from './scoring.ts'
import type { EventState, MatchType, Session } from './types.ts'

export type MatchCategory = 'individual' | 'team' | 'mixed'

/** Individual, team or mixed, from the human units. ChronoBot is left out. */
export function categoryOf(s: Pick<Session, 'sides'>): MatchCategory {
  const humans = sidesOf(s).map((id) => s.sides[id]).filter((u) => u.kind !== 'bot')
  if (humans.every((u) => u.kind === 'individual')) return 'individual'
  if (humans.every((u) => u.kind === 'team')) return 'team'
  return 'mixed'
}

export interface LeaderRow {
  rank: number
  submissionId: string
  gameId: string
  runId: string
  unitName: string
  gameMode: 'Individual' | 'Team'
  matchType: MatchType
  /** Number of sides in the match (2 for every match before multi-side play). */
  sideCount: number
  category: MatchCategory
  /** Final score: rubric (0-100) plus tool points. */
  total: number
  /** Rubric part and tool part of `total`. */
  rubric: number
  tools: number
  final: boolean
  publishedAt: string
}

/**
 * Eligible = published score on a locked submission, from a ranked (first) run, by a human unit.
 * ChronoBot never submits, but the unit check keeps it out even if data were edited.
 * Runs failing integrity checks are excluded.
 */
export function eligibleRows(ev: EventState): Omit<LeaderRow, 'rank'>[] {
  return collectSubmissions(ev)
    .filter((r) => r.submission && r.score?.status === 'published')
    .filter((r) => r.run.ranked && !r.run.cancelled && r.submission!.ranked)
    .filter((r) => r.session.sides[r.sideId].controller === 'human' && r.session.sides[r.sideId].kind !== 'bot')
    // A run whose saved records no longer reconcile is withheld until an administrator resolves it.
    .filter((r) => checkRun(r.participant, r.run).every((i) => i.severity !== 'error'))
    .map((r) => {
      const unit = r.session.sides[r.sideId]
      return {
        submissionId: r.submission!.submissionId,
        gameId: r.participant.gameId,
        runId: r.run.runId,
        unitName: unit.name,
        gameMode: unit.kind === 'team' ? ('Team' as const) : ('Individual' as const),
        matchType: r.session.matchType,
        sideCount: sidesOf(r.session).length,
        category: categoryOf(r.session),
        total: finalScore(r.score!.entries, r.submission!),
        rubric: scoreTotal(r.score!.entries),
        tools: toolTotal(r.submission!),
        final: ev.settings.leaderboardLocked,
        publishedAt: r.score!.publishedAt ?? '',
      }
    })
}

/** Standard competition ranking: equal totals share a rank and the next rank skips (1, 1, 3). */
export function rankRows<T extends { total: number; publishedAt: string; unitName: string }>(rows: T[], dir: 'desc' | 'asc' = 'desc'): (T & { rank: number })[] {
  const ranked = [...rows]
    .sort((a, b) => b.total - a.total || a.publishedAt.localeCompare(b.publishedAt) || a.unitName.localeCompare(b.unitName))
    .map((r, _, all) => ({ ...r, rank: 1 + all.filter((o) => o.total > r.total).length }))
  return dir === 'desc' ? ranked : ranked.reverse()
}
