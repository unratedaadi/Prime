import test from 'node:test'
import assert from 'node:assert/strict'
import * as routines from './automationStore.js'
import * as privacy from './localPrivacy.js'

test('routine preflight blocks unsupported steps before any action runs', async () => {
  const calls = []
  await assert.rejects(() => routines.executeAutomation({ enabled: true, actions: ['Open Notes', 'Enable Do Not Disturb'] }, async (step) => calls.push(step)), /not supported/i)
  assert.deepEqual(calls, [])
})
test('routines execute each supported action in order and stop on failure', async () => {
  const calls = []
  await assert.rejects(() => routines.executeAutomation({ enabled: true, actions: ['Open Notes', 'Set a timer for 25 minutes', 'Open Safari'] }, async (step) => {
    calls.push(step.type)
    if (step.type === 'timer.start') throw new Error('Timer failed')
  }), /Timer failed/)
  assert.deepEqual(calls, ['app.open', 'timer.start'])
})
test('disabled routines execute nothing', async () => {
  await assert.rejects(() => routines.executeAutomation({ enabled: false, actions: ['Open Notes'] }, () => assert.fail('must not execute')), /disabled/i)
})
test('deletion removes all PRIME dashboard data and preserves unrelated storage', () => {
  const data = new Map(privacy.PRIME_LOCAL_KEYS.map((key) => [key, 'private']))
  data.set('unrelated', 'keep')
  privacy.clearPrimeLocalData({ removeItem: (key) => data.delete(key) })
  assert.deepEqual([...data], [['unrelated', 'keep']])
})
test('saved routines discard malformed data and recompute confirmation metadata', () => {
  const restored = routines.restoreAutomations(JSON.stringify([null, { id: 'x', name: 'Focus', trigger: 'focus', enabled: true, actions: ['Open Notes'], confirmations: 'bad' }, { id: 'bad', actions: [null] }]), [])
  assert.equal(restored.length, 1)
  assert.deepEqual(restored[0].confirmations, [])
})
test('multiple local steps execute and report the actual completed count', async () => {
  const calls = []
  const count = await routines.executeAutomation({ enabled: true, actions: ['Create a note: first', 'Create a note: second'] }, async (step) => calls.push(step.payload.content))
  assert.equal(count, 2)
  assert.deepEqual(calls, ['first', 'second'])
})
test('privacy deletion includes notes, activity, consent, settings, history and onboarding', () => {
  assert.deepEqual([...privacy.PRIME_LOCAL_KEYS].sort(), [
    'prime.mac-dashboard.v2', 'prime.command-history.v1', 'prime.automations.v1',
    'prime.settings.v1', 'prime.integration-consent.v1', 'prime.onboarding.v1', 'prime.local-notes.v1',
  ].sort())
})
