import { SIDE_IDS } from './types.ts'
import type { EventState, Participant, Run, ScoreRecord, Session, SideId, SolutionState, Submission } from './types.ts'

export interface SubmissionRecord {
  participant: Participant
  run: Run
  session: Session
  sideId: SideId
  solution: SolutionState
  submission: Submission | null
  score: ScoreRecord | undefined
  /** True when this run is the participant's current (not archived) run. */
  active: boolean
}

export const runsOf = (p: Participant): Run[] => (p.run ? [...p.pastRuns, p.run] : [...p.pastRuns])

/** Every solution (draft or locked) across every participant and run, oldest run first. */
export function collectSubmissions(ev: EventState): SubmissionRecord[] {
  const out: SubmissionRecord[] = []
  for (const participant of ev.participants) {
    for (const run of runsOf(participant)) {
      if (!run.session) continue
      for (const sideId of SIDE_IDS) {
        const solution = run.solutions[sideId]
        if (!solution) continue
        out.push({
          participant,
          run,
          session: run.session,
          sideId,
          solution,
          submission: solution.submission,
          score: solution.submission ? ev.scores[solution.submission.submissionId] : undefined,
          active: run === participant.run,
        })
      }
    }
  }
  return out
}

export const findSubmission = (ev: EventState, submissionId: string) =>
  collectSubmissions(ev).find((r) => r.submission?.submissionId === submissionId)

export function findRun(ev: EventState, runId: string): { participant: Participant; run: Run } | undefined {
  for (const participant of ev.participants) {
    const run = runsOf(participant).find((r) => r.runId === runId)
    if (run) return { participant, run }
  }
}

export type RunStatus = 'setup' | 'auction' | 'mission' | 'submitted' | 'cancelled'

export function runStatus(run: Run): RunStatus {
  if (run.cancelled) return 'cancelled'
  if (Object.values(run.solutions).some((s) => s?.submission)) return 'submitted'
  if (!run.session || run.session.status === 'ready') return 'setup'
  if (run.session.status === 'live') return 'auction'
  return 'mission'
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  setup: 'Match setup',
  auction: 'Auction live',
  mission: 'Auction complete',
  submitted: 'Solution submitted',
  cancelled: 'Cancelled',
}
