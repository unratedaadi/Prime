import assert from 'node:assert/strict'
import test from 'node:test'

import { createAuditLog } from './audit.mjs'
import { validateCommand } from './policy.mjs'

test('accepts the fixed status and approved app-open commands', () => {
  assert.equal(validateCommand({ type: 'system.status' }).ok, true)
  assert.equal(validateCommand({ type: 'app.open', payload: { app: 'calendar' } }).ok, true)
  assert.equal(validateCommand({ type: 'app.open', payload: { app: 'whatsapp' } }).ok, true)
  assert.equal(validateCommand({ type: 'app.open', payload: { app: 'spotify' } }).ok, true)
  assert.equal(validateCommand({ type: 'app.open', payload: { app: 'settings' } }).ok, true)
  assert.equal(validateCommand({ type: 'app.open', payload: { app: 'safari' } }).ok, true)
  assert.equal(validateCommand({ type: 'app.open', payload: { app: 'messages' } }).ok, true)
  assert.equal(validateCommand({ type: 'web.search', payload: { query: 'today weather in Mumbai' } }).ok, true)
})

test('rejects unknown commands and app IDs', () => {
  assert.equal(validateCommand({ type: 'shell.run', payload: { command: 'whoami' } }).code, 'unknown_command')
  assert.equal(validateCommand({ type: 'app.open', payload: { app: 'terminal' } }).code, 'unknown_app')
})

test('rejects notification text longer than 140 characters', () => {
  const result = validateCommand({ type: 'notification.send', payload: { title: 'A', body: 'x'.repeat(141) } })
  assert.equal(result.code, 'invalid_notification')
})

test('rejects blank and oversized web searches', () => {
  assert.equal(validateCommand({ type: 'web.search', payload: { query: '' } }).code, 'invalid_search')
  assert.equal(validateCommand({ type: 'web.search', payload: { query: 'x'.repeat(201) } }).code, 'invalid_search')
})

test('audit events retain command metadata but redact keys and notification bodies', () => {
  const audit = createAuditLog()
  audit.record({ outcome: 'accepted', command: { type: 'notification.send', payload: { title: 'Ready', body: 'private text' } }, key: 'secret-agent-key' })
  const [entry] = audit.list()

  assert.equal(entry.type, 'notification.send')
  assert.equal(entry.outcome, 'accepted')
  assert.equal(JSON.stringify(entry).includes('private text'), false)
  assert.equal(JSON.stringify(entry).includes('secret-agent-key'), false)
})

test('audit events collapse unrecognized command types to unknown', () => {
  const audit = createAuditLog()
  audit.record({ outcome: 'rejected', command: { type: 'private-content-that-must-not-be-logged' } })

  assert.equal(audit.list()[0].type, 'unknown')
})

test('accepts installed-app friendly labels but rejects paths and executable fragments', () => {
  assert.deepEqual(validateCommand({ type: 'app.open', payload: { app: 'Google Chrome' } }).value, { type: 'app.open', payload: { app: 'Google Chrome' } })
  for (const app of ['/Applications/Notes.app', '../Notes', 'https://example.com', 'Notes; touch /tmp/x', 'Terminal']) {
    assert.equal(validateCommand({ type: 'app.open', payload: { app } }).ok, false)
  }
})
test('volume and media commands accept only bounded values and fixed actions', () => {
  assert.equal(validateCommand({ type: 'system.volume', payload: { action: 'set', level: 35 } }).ok, true)
  for (const level of [-1, 101, 1.5, '50', NaN]) assert.equal(validateCommand({ type: 'system.volume', payload: { action: 'set', level } }).ok, false)
  assert.equal(validateCommand({ type: 'media.control', payload: { app: 'spotify', action: 'pause' } }).ok, true)
  assert.equal(validateCommand({ type: 'media.control', payload: { app: 'spotify', action: 'do shell script' } }).ok, false)
})

test('accepts bounded WhatsApp contact calls and Chrome profile actions only', () => {
  assert.equal(validateCommand({ type: 'whatsapp.call', payload: { contact: 'Test Contact' } }).ok, true)
  assert.equal(validateCommand({ type: 'chrome.profile.list', payload: {} }).ok, true)
  assert.equal(validateCommand({ type: 'chrome.profile.open', payload: { profile: 'Work' } }).ok, true)
  for (const contact of ['', 'x'.repeat(81), '../Test Contact', 'Test Contact; do shell script']) assert.equal(validateCommand({ type: 'whatsapp.call', payload: { contact } }).ok, false)
  assert.equal(validateCommand({ type: 'chrome.profile.open', payload: { profile: '../Default' } }).ok, false)
})
