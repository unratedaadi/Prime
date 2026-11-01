import assert from 'node:assert/strict'
import test from 'node:test'

import { parseDashboardLocalCommand } from './localDashboardTools.js'

test('parses bounded local timers and notes without turning unknown text into an action', () => {
  assert.deepEqual(parseDashboardLocalCommand('set a timer for 25 minutes'), { type: 'timer.start', payload: { minutes: 25 } })
  assert.deepEqual(parseDashboardLocalCommand('Create a note: pick up milk'), { type: 'note.create', payload: { content: 'pick up milk' } })
  assert.equal(parseDashboardLocalCommand('set a timer for 999 minutes'), null)
  assert.equal(parseDashboardLocalCommand('delete all notes'), null)
})

test('maps weather and help to safe local intent metadata', () => {
  assert.deepEqual(parseDashboardLocalCommand('what is the weather in Delhi?'), { type: 'weather.search', payload: { city: 'Delhi' } })
  assert.deepEqual(parseDashboardLocalCommand('what can you do?'), { type: 'help.show', payload: {} })
})
