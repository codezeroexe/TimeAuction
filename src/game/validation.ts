import type { RegistrationInput } from './types.ts'
import { ID_MAX, NAME_MAX, SOLUTION_TEXT_MAX, TEAM_MAX, TEAM_MIN } from './rules.ts'
import { feedbackErrors } from './event.ts'
import { TECHNOLOGIES } from '../data/technologies.ts'
import { CHARACTERISTICS } from '../data/scenario.ts'

export type RegistrationErrors = Partial<{
  name: string
  teamName: string
  teammates: string
  teammate: Record<number, string>
}>

function checkName(value: string, label: string): string | undefined {
  const v = value.trim()
  if (!v) return `${label} is required.`
  if (v.length > NAME_MAX) return `${label} must be ${NAME_MAX} characters or fewer.`
  return undefined
}

export function validateRegistration(input: RegistrationInput): RegistrationErrors {
  const errors: RegistrationErrors = {}
  const nameErr = checkName(input.name, 'Player name')
  if (nameErr) errors.name = nameErr
  if (input.mode === 'individual') return errors

  const teamErr = checkName(input.teamName, 'Team name')
  if (teamErr) errors.teamName = teamErr

  const total = input.teammates.length + 1
  if (total < TEAM_MIN || total > TEAM_MAX) {
    errors.teammates = `A team needs ${TEAM_MIN}–${TEAM_MAX} members in total, including you.`
  }

  const seen = new Set([input.name.trim().toLowerCase()])
  const perMember: Record<number, string> = {}
  input.teammates.forEach((m, i) => {
    const err = checkName(m, `Member ${i + 2} name`)
    if (err) return void (perMember[i] = err)
    const key = m.trim().toLowerCase()
    if (seen.has(key)) perMember[i] = 'Each member needs a distinct name.'
    seen.add(key)
  })
  if (Object.keys(perMember).length) errors.teammate = perMember
  return errors
}

export const hasErrors = (e: RegistrationErrors) => Object.keys(e).length > 0

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strings = (v: unknown, max: number, len: number) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= len)
const firstMessage = (e: object) => Object.values(e).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v as object)))[0] as string | undefined

/** Shape and size check for player input the server stores; null = fine. Pure, so the browser could share it. */
export function inputError(action: { type: string } & Record<string, unknown>): string | null {
  if (action.type === 'register') {
    const i = action.input
    if (!isObj(i) || typeof i.name !== 'string' || (i.mode !== 'individual' && i.mode !== 'team') || typeof i.teamName !== 'string' || !strings(i.teammates, TEAM_MAX, NAME_MAX * 4))
      return 'Registration details are malformed.'
    return firstMessage(validateRegistration(i as unknown as RegistrationInput)) ?? null
  }
  if (action.type === 'bid' || action.type === 'pass' || action.type === 'startSolution' || action.type === 'updateDraft' || action.type === 'submitSolution') {
    if (typeof action.side !== 'string' || action.side.length > 4) return 'That side is malformed.'
    if (action.type === 'bid' && (!Number.isSafeInteger(action.amount) || (action.amount as number) < 0)) return 'That bid is malformed.'
  }
  if (action.type === 'updateDraft') {
    const d = action.draft
    const known = new Set<string>(CHARACTERISTICS.map((c) => c.id))
    if (!isObj(d) || !strings(d.techIds, TECHNOLOGIES.length, 40) || !Array.isArray(d.characteristics) || d.characteristics.length > CHARACTERISTICS.length || !d.characteristics.every((c) => typeof c === 'string' && known.has(c)) || typeof d.text !== 'string' || d.text.length > SOLUTION_TEXT_MAX)
      return 'That draft is malformed or too long.'
  }
  if (action.type === 'saveFeedback') {
    const i = action.input
    if (typeof action.runId !== 'string' || action.runId.length > ID_MAX || !isObj(i) || typeof i.comment !== 'string') return 'Feedback is malformed.'
    return firstMessage(feedbackErrors(i as never)) ?? null
  }
  return null
}
