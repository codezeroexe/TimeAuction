import { MAX_CHARACTERISTICS, SOLUTION_WORDS } from './rules.ts'
import { techNeed } from './auction.ts'
import type { Run, SideId, SolutionDraft } from './types.ts'

export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

export interface SolutionCheck {
  techs: string | null
  characteristics: string | null
  words: string | null
  wordCount: number
  valid: boolean
}

export function checkSolution(draft: SolutionDraft, owned: string[], required: number): SolutionCheck {
  const distinct = new Set(draft.techIds)
  const techs =
    draft.techIds.some((t) => !owned.includes(t))
      ? 'Only technologies your unit acquired can be used.'
      : distinct.size !== draft.techIds.length
        ? 'Each technology can be selected once.'
        : distinct.size < required
          ? `Select at least ${required} ${required === 1 ? 'technology' : 'technologies'}.`
          : null
  const n = draft.characteristics.length
  const characteristics =
    n === 0 ? 'Choose at least one characteristic.' : n > MAX_CHARACTERISTICS ? `Choose at most ${MAX_CHARACTERISTICS}.` : null
  const wordCount = countWords(draft.text)
  const words =
    wordCount < SOLUTION_WORDS.min ? `Write at least ${SOLUTION_WORDS.min} words (${SOLUTION_WORDS.min - wordCount} to go).` : null
  return { techs, characteristics, words, wordCount, valid: !techs && !characteristics && !words }
}

/**
 * A station's match is over once the auction has finished and every side it plays has submitted, run out of
 * solution time, or won too few technologies to submit. Player PCs then fall back to the idle screen.
 */
export function stationDone(run: Run | null, sides: SideId[], now: number): boolean {
  const s = run?.session
  if (!run || !s || s.status !== 'complete' || sides.length === 0) return false
  return sides.every((side) => {
    const sol = run.solutions[side]
    return !!sol?.submission || (sol?.deadline != null && now > sol.deadline) || techNeed(s, side).short
  })
}
