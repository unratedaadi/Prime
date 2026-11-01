import assert from 'node:assert/strict'
import test from 'node:test'
import { duplicateAutomation, toggleAutomation } from './automationStore.js'

const sample = { id: 'focus', name: 'Start focus mode', trigger: 'start focus mode', enabled: true, actions: ['Open Spotify', 'Enable Do Not Disturb', 'Start 25-minute timer'] }

test('duplicates and disables local automations without changing the original', () => {
  const duplicate = duplicateAutomation([sample], 'focus', () => 'copy')
  assert.equal(duplicate[0].id, 'copy')
  assert.equal(duplicate[0].name, 'Start focus mode copy')
  assert.equal(toggleAutomation(duplicate, 'focus')[1].enabled, false)
})
