import assert from 'node:assert/strict'
import test from 'node:test'

import { appendCommandHistory, filterCommandHistory, pruneCommandHistory } from './commandHistory.js'

const entry = (overrides = {}) => ({
  id: 'one',
  at: '2026-10-27T12:00:00.000Z',
  transcript: 'open Notes',
  intent: 'Open Notes',
  target: 'Notes',
  type: 'app',
  status: 'success',
  result: 'Notes opened on this Mac.',
  confirmation: 'Opening, boss.',
  ...overrides,
})

test('appends a bounded local command record with a timestamp', () => {
  const next = appendCommandHistory([], { transcript: 'open Notes', intent: 'Open Notes', target: 'Notes', type: 'app', status: 'success', result: 'Notes opened.', confirmation: 'Opening, boss.' }, () => 'id-1', () => '2026-10-27T12:00:00.000Z')

  assert.deepEqual(next, [entry({ id: 'id-1', result: 'Notes opened.' })])
})

test('filters command history by query, status, type, and day', () => {
  const history = [entry(), entry({ id: 'two', at: '2026-10-26T12:00:00.000Z', transcript: 'search Google for weather', intent: 'Search Google', target: 'Google', type: 'search', status: 'error', result: 'Network unavailable.' })]

  assert.deepEqual(filterCommandHistory(history, { query: 'weather', status: 'all', type: 'all', date: 'all' }).map(({ id }) => id), ['two'])
  assert.deepEqual(filterCommandHistory(history, { query: '', status: 'success', type: 'app', date: '2026-10-27' }).map(({ id }) => id), ['one'])
  assert.equal(filterCommandHistory(history, { query: '', status: 'all', type: 'all', date: 'today', now: new Date('2026-10-27T12:00:00.000Z') }).length, 1)
})

test('prunes only records older than the selected local retention period', () => {
  const history = [entry(), entry({ id: 'old', at: '2026-09-01T12:00:00.000Z' })]
  assert.deepEqual(pruneCommandHistory(history, 30, new Date('2026-10-27T12:00:00.000Z')).map(({ id }) => id), ['one'])
  assert.equal(pruneCommandHistory(history, 0, new Date('2026-10-27T12:00:00.000Z')).length, 2)
})

test('today uses the user’s local day across a UTC midnight boundary', () => {
  const previous = process.env.TZ
  process.env.TZ = 'Asia/Kolkata'
  try {
    const now = new Date('2026-11-01T19:00:00Z')
    const history = [entry({ id: 'today', at: '2026-11-01T18:45:00Z' }), entry({ id: 'yesterday', at: '2026-11-01T17:00:00Z' })]
    assert.deepEqual(filterCommandHistory(history, { date: 'today', now }).map((item) => item.id), ['today'])
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
