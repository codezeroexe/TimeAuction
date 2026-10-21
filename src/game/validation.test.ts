import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasErrors, validateRegistration } from './validation.ts'

const base = { name: 'Ada', mode: 'individual' as const, teamName: '', teammates: [] }

test('individual with a name is valid', () => {
  assert.equal(hasErrors(validateRegistration(base)), false)
})

test('blank and overlong names are rejected', () => {
  assert.ok(validateRegistration({ ...base, name: '   ' }).name)
  assert.ok(validateRegistration({ ...base, name: 'x'.repeat(33) }).name)
})

test('team requires name and 2–5 total members', () => {
  const team = { ...base, mode: 'team' as const, teamName: 'Orbit', teammates: ['Grace'] }
  assert.equal(hasErrors(validateRegistration(team)), false)
  assert.ok(validateRegistration({ ...team, teamName: '' }).teamName)
  assert.ok(validateRegistration({ ...team, teammates: [] }).teammates)
  assert.ok(validateRegistration({ ...team, teammates: ['b', 'c', 'd', 'e', 'f'] }).teammates)
  assert.equal(hasErrors(validateRegistration({ ...team, teammates: ['b', 'c', 'd', 'e'] })), false)
})

test('duplicate member names are rejected case-insensitively', () => {
  const team = { ...base, mode: 'team' as const, teamName: 'Orbit', teammates: ['ada', 'Grace', ' grace '] }
  assert.deepEqual(Object.keys(validateRegistration(team).teammate ?? {}), ['0', '2'])
})
