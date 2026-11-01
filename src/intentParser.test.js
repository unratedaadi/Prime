import assert from 'node:assert/strict'
import test from 'node:test'

import { parseIntent } from './intentParser.js'

test('parser assigns deterministic safe intents to supported commands', () => {
  const intent = parseIntent('Open Spotify')
  assert.equal(intent.category, 'app')
  assert.equal(intent.action, 'open')
  assert.equal(intent.riskLevel, 'safe')
  assert.equal(intent.parameters.app, 'spotify')
})

test('parser separates confirmation-only and blocked requests', () => {
  assert.equal(parseIntent('send a WhatsApp message to Aadi').riskLevel, 'confirm')
  assert.equal(parseIntent('delete all my files').riskLevel, 'blocked')
  assert.equal(parseIntent('run rm -rf /').riskLevel, 'blocked')
})

test('parser uses an explicit fallback rather than treating unknown text as executable', () => {
  const intent = parseIntent('compose a poem about rain')
  assert.equal(intent.action, 'unknown')
  assert.equal(intent.riskLevel, 'blocked')
})
