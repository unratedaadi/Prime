import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startAutoConnection } from './autoConnection.js'

test('connects on launch and recovers after a failed connection without retrying commands', async () => {
  const calls = []; const states = []; const errors = []; let tick; let fail = true
  const stop = startAutoConnection({ request: async (path) => { calls.push(path); if (!path) return { connected: false }; if (fail) { fail = false; throw new Error('Starting agent') } return { connected: true } }, onState: (state) => states.push(state), onError: (error) => errors.push(error), schedule: (callback) => { tick = callback; return 1 }, unschedule: () => {} })
  await new Promise(setImmediate)
  assert.deepEqual(calls, [undefined, '/connect'])
  assert.equal(errors[0], 'Starting agent')
  await tick()
  assert.equal(states.at(-1).connected, true)
  stop()
  await tick()
  assert.equal(calls.length, 4)
})

test('keeps a connected paused session intact and ignores completion after unmount', async () => {
  let resolve; const states = []; let cancelled = false
  const stop = startAutoConnection({ request: () => new Promise((done) => { resolve = done }), onState: (state) => states.push(state), onError: () => {}, schedule: () => 1, unschedule: () => { cancelled = true } })
  stop(); resolve({ connected: true, paused: true }); await new Promise(setImmediate)
  assert.deepEqual(states, []); assert.equal(cancelled, true)
})
