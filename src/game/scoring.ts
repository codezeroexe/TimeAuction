import { TWISTS, valuesForRun } from '../data/scenario.ts'
import type { CriterionEntry, CriterionId, ScoreRecord, ScoreStatus, SolutionState } from './types.ts'

export const RUBRIC: { id: CriterionId; label: string; max: number; guide: string }[] = [
  { id: 'relevance', label: 'Mission Relevance', max: 20, guide: 'Does the system actually enable a human settlement on Mars?' },
  { id: 'combination', label: 'Technology Combination', max: 20, guide: 'Do the selected technologies reinforce each other rather than sit side by side?' },
  { id: 'twist', label: 'Timeline Twist Compliance', max: 20, guide: "Does the design work under this run's timeline twist?" },
  { id: 'sustainability', label: 'Sustainability', max: 15, guide: 'Can it run for years on local or recycled resources?' },
  { id: 'scalability', label: 'Scalability', max: 15, guide: 'Can it grow from a first crew to a larger settlement?' },
  { id: 'explanation', label: 'Explanation', max: 10, guide: 'Is the reasoning clear, specific and complete?' },
]

export const RUBRIC_MAX = RUBRIC.reduce((s, c) => s + c.max, 0)

export const emptyEntries = (): Record<CriterionId, CriterionEntry> =>
  Object.fromEntries(RUBRIC.map((c) => [c.id, { score: null, note: '' }])) as Record<CriterionId, CriterionEntry>

export const NOTE_MAX = 280

/** Whole points only, 0..max. Returns an error message or null. */
export function entryError(id: CriterionId, score: number | null): string | null {
  const c = RUBRIC.find((r) => r.id === id)!
  if (score === null) return null
  if (!Number.isFinite(score) || !Number.isInteger(score)) return `${c.label}: enter a whole number.`
  if (score < 0 || score > c.max) return `${c.label}: must be between 0 and ${c.max}.`
  return null
}

export function entriesErrors(entries: Record<CriterionId, CriterionEntry>): string[] {
  return RUBRIC.flatMap((c) => {
    const e = entryError(c.id, entries[c.id].score)
    const n = entries[c.id].note.length > NOTE_MAX ? `${c.label}: note is longer than ${NOTE_MAX} characters.` : null
    return [e, n].filter((x): x is string => !!x)
  })
}

export const missingCriteria = (entries: Record<CriterionId, CriterionEntry>) => RUBRIC.filter((c) => entries[c.id].score === null)

/** Sum of the entered scores only. Never fills in a missing criterion. */
export const scoreTotal = (entries: Record<CriterionId, CriterionEntry>) =>
  RUBRIC.reduce((s, c) => s + (entries[c.id].score ?? 0), 0)

/** Round half away from zero (Math.round(-2.5) is -2). Never returns -0. */
export const roundPoints = (delta: number) => Math.sign(delta) * Math.round(Math.abs(delta) / 10) || 0

type ToolSub = { twistId: string; runId: string; selectedTechIds: string[] }

/** Each selected technology scores round(twist delta / 10): -5..+5. A sealed or unknown twist scores nothing. */
export function toolPoints(sub: ToolSub): { techId: string; delta: number; points: number }[] {
  const twist = TWISTS[sub.twistId]
  const values = twist ? valuesForRun(twist, sub.runId) : {}
  return sub.selectedTechIds.map((techId) => {
    const delta = values[techId]?.delta ?? 0
    return { techId, delta, points: roundPoints(delta) }
  })
}

/** "+3", "−2", "0". */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

export const toolTotal = (sub: ToolSub) => toolPoints(sub).reduce((s, t) => s + t.points, 0)

/** Judges' rubric total (0-100) plus tool points. Not out of 100. */
export const finalScore = (entries: Record<CriterionId, CriterionEntry>, sub: ToolSub) => scoreTotal(entries) + toolTotal(sub)

export type SubmissionStatus = 'draft' | 'submitted' | ScoreStatus

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  awaiting: 'AWAITING SCORING',
  in_scoring: 'IN SCORING',
  scored: 'SCORED',
  verified: 'VERIFIED',
  published: 'PUBLISHED',
}

export const STATUS_ORDER: SubmissionStatus[] = ['draft', 'submitted', 'awaiting', 'in_scoring', 'scored', 'verified', 'published']

export function submissionStatus(sol: SolutionState | undefined, score: ScoreRecord | undefined): SubmissionStatus {
  if (!sol?.submission) return 'draft'
  return score ? score.status : 'submitted'
}
