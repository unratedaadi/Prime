import assert from 'node:assert/strict'
import test from 'node:test'

import { createPendingConfirmation, isConfirmationActive } from './confirmationService.js'

test('sensitive requests expire after 30 seconds', () => {
  const pending = createPendingConfirmation({ action: 'send-message' }, 1_000)
  assert.equal(isConfirmationActive(pending, 30_999), true)
  assert.equal(isConfirmationActive(pending, 31_001), false)
})
