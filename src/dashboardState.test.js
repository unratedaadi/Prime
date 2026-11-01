import assert from 'node:assert/strict'
import test from 'node:test'
import { initialDashboard, reduceDashboard, restoreDashboard, serializeDashboard } from './dashboardState.js'

test('starts as a Mac-only dashboard with local activity only', () => {
  assert.deepEqual(initialDashboard, { activity: [] })
})

test('records bounded local Mac activity', () => {
  let state = initialDashboard
  for (let index = 0; index < 110; index += 1) state = reduceDashboard(state, { type: 'record-activity', title: 'Opened Notes', detail: 'Local Mac action completed.' })
  assert.equal(state.activity.length, 100)
  assert.equal(new Set(state.activity.map((entry) => entry.id)).size, 100)
  assert.equal(initialDashboard.activity.length, 0)
})

test('ignores non-activity and malformed activity actions', () => {
  assert.equal(reduceDashboard(initialDashboard, { type: 'unsupported-action', name: 'Other target' }), initialDashboard)
  assert.equal(reduceDashboard(initialDashboard, { type: 'record-activity', title: 4, detail: 'nope' }), initialDashboard)
})

test('round-trips valid local activity only', () => {
  const state = reduceDashboard(initialDashboard, { type: 'record-activity', title: 'Status read', detail: 'This Mac is ready.' })
  assert.deepEqual(restoreDashboard(serializeDashboard(state)), state)
  assert.equal(restoreDashboard(null), initialDashboard)
})

test('rejects obsolete or corrupt dashboard storage', () => {
  assert.throws(() => restoreDashboard('{'))
  assert.throws(() => restoreDashboard(JSON.stringify({ version: 1, devices: [], activity: [] })))
  assert.throws(() => restoreDashboard(JSON.stringify({ version: 2, activity: [{ id: 'x', title: 'Bad', detail: '', at: 'not a date' }] })))
})
