import { STATUS_ORDER, submissionStatus } from '../game/scoring.ts'
import type { EventState, Run } from '../game/types.ts'

export type StageState = 'done' | 'current' | 'todo' | 'waiting'

/** Mission progress for the lobby. `waiting`: a remote player not yet paired, so match setup has not begun. */
export function stages(run: Run | null, ev: EventState, hasFeedback: boolean, waiting = false): { name: string; state: StageState }[] {
  const order = ['setup', 'auction', 'summary', 'twist', 'mission', 'solution'] as const
  const at = run?.session && run.session.status !== 'ready' ? order.indexOf(run.phase) : 0
  const st = (from: number, to: number): StageState => (at > to ? 'done' : at >= from ? 'current' : 'todo')
  // Scoring stages follow the furthest-along human submission in this run.
  const sols = run ? Object.values(run.solutions).filter((s) => !!s) : []
  const best = sols.reduce((m, s) => Math.max(m, STATUS_ORDER.indexOf(submissionStatus(s, s.submission ? ev.scores[s.submission.submissionId] : undefined))), -1)
  const step = (from: number, done: number): StageState => (best >= done ? 'done' : best >= from ? 'current' : 'todo')
  return [
    { name: 'Registration', state: 'done' },
    { name: 'Match setup', state: waiting ? 'waiting' : st(0, 0) },
    { name: 'Technology auction & summary', state: st(1, 2) },
    { name: 'Timeline Twist & Future Mission', state: st(3, 4) },
    { name: 'Engineer a solution', state: best >= 1 ? 'done' : st(5, 5) },
    { name: 'Scoring', state: step(1, 4) },
    { name: 'Verification', state: step(4, 5) },
    { name: 'Leaderboard', state: step(5, 6) },
    { name: 'Feedback', state: hasFeedback ? 'done' : best >= 1 ? 'current' : 'todo' },
  ]
}
