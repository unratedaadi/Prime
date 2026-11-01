import assert from 'node:assert/strict'
import test from 'node:test'

import { isPushToTalkShortcut } from './voiceShortcut.js'

test('recognizes the configured dashboard push-to-talk shortcuts only', () => {
  assert.equal(isPushToTalkShortcut({ key: 'p', metaKey: true, shiftKey: true }, '⌘⇧P'), true)
  assert.equal(isPushToTalkShortcut({ key: 'p', metaKey: false, shiftKey: true }, '⌘⇧P'), false)
  assert.equal(isPushToTalkShortcut({ key: ' ', metaKey: false, shiftKey: false }, 'Space'), true)
  assert.equal(isPushToTalkShortcut({ key: 'x', metaKey: true, shiftKey: true }, '⌘⇧P'), false)
})
