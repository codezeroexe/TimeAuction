import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayVars, pickView, STAGE_FX, STAGE_LABELS, stepStage } from './show.ts'
import { DEFAULT_DISPLAY } from '../../game/event.ts'
import { SHOW_STAGES, type ShowStage } from '../../game/types.ts'

const rooms = [{ room: 'SES-1' }, { room: 'SES-2' }, { room: 'SES-3' }]

test('a named room wins, even when it is not a candidate', () => {
  assert.deepEqual(pickView(rooms, 'SES-3', [rooms[0]]), { kind: 'focus', room: rooms[2] })
})

test('without a named room: one candidate is shown big, several form a grid, none shows nothing', () => {
  assert.deepEqual(pickView(rooms, null, [rooms[1]]), { kind: 'focus', room: rooms[1] })
  assert.deepEqual(pickView(rooms, 'SES-9', [rooms[0], rooms[2]]), { kind: 'grid', rooms: [rooms[0], rooms[2]] })
  assert.deepEqual(pickView(rooms, null, []), { kind: 'none' })
})

test('stages run welcome, rules, join, teams, matchups, auction, twist, results', () => {
  assert.deepEqual(SHOW_STAGES, ['welcome', 'rules', 'join', 'teams', 'matchups', 'auction', 'twist', 'results'])
  const walk: ShowStage[] = [SHOW_STAGES[0]]
  for (let i = 1; i < SHOW_STAGES.length; i++) walk.push(stepStage(walk[i - 1], 1))
  assert.deepEqual(walk, [...SHOW_STAGES])
})

test('stage steps forward and back and stops at both ends', () => {
  assert.equal(stepStage('welcome', -1), 'welcome')
  assert.equal(stepStage('welcome', 1), 'rules')
  assert.equal(stepStage('rules', 1), 'join')
  assert.equal(stepStage('join', 1), 'teams')
  assert.equal(stepStage('join', -1), 'rules')
  assert.equal(stepStage('auction', 1), 'twist')
  assert.equal(stepStage('results', 1), 'results')
  assert.equal(stepStage('teams', -1), 'join')
  assert.equal(stepStage('twist', -1), 'auction')
})

test('every stage has a label and a transition', () => {
  assert.equal(STAGE_LABELS.rules, 'Rules')
  assert.equal(STAGE_LABELS.join, 'How to join')
  for (const s of SHOW_STAGES) {
    assert.ok(STAGE_LABELS[s], `label for ${s}`)
    assert.ok(STAGE_FX[s], `transition for ${s}`)
  }
  const fx = SHOW_STAGES.map((s) => STAGE_FX[s])
  assert.equal(new Set(fx).size, fx.length, 'no two stages share a transition')
})

test('displayVars: default fit is the base zoom and no insets; zoom is a percent of the base', () => {
  assert.deepEqual(displayVars(DEFAULT_DISPLAY), { '--present-zoom': '1.25', '--safe-t': '0vh', '--safe-r': '0vw', '--safe-b': '0vh', '--safe-l': '0vw' })
  assert.equal(displayVars({ ...DEFAULT_DISPLAY, scale: 80 })['--present-zoom'], '1')
})
