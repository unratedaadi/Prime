import assert from 'node:assert/strict'
import test from 'node:test'

import { initialVoiceControl, reduceVoiceControl } from './voiceControl.js'

test('push-to-talk moves from idle to listening and records partial speech', () => {
  const listening = reduceVoiceControl(initialVoiceControl, { type: 'start' })
  const partial = reduceVoiceControl(listening, { type: 'partial', transcript: 'open notes' })

  assert.equal(listening.status, 'Listening')
  assert.equal(partial.transcript, 'open notes')
  assert.equal(partial.status, 'Listening')
})

test('a recognized safe command shows its intended action before execution', () => {
  const next = reduceVoiceControl(initialVoiceControl, {
    type: 'recognized',
    transcript: 'open Notes',
    detectedCommand: 'Open Notes',
    intendedAction: 'Open Notes on this Mac',
  })

  assert.equal(next.status, 'Processing')
  assert.equal(next.transcript, 'open Notes')
  assert.equal(next.detectedCommand, 'Open Notes')
  assert.equal(next.intendedAction, 'Open Notes on this Mac')
})

test('cancel clears the current transcript and returns to idle', () => {
  const listening = reduceVoiceControl(initialVoiceControl, { type: 'partial', transcript: 'search google for weather' })
  const next = reduceVoiceControl(listening, { type: 'cancel' })

  assert.deepEqual(next, initialVoiceControl)
})

test('errors are visible until the next push-to-talk attempt', () => {
  const errored = reduceVoiceControl(initialVoiceControl, { type: 'error', message: 'Speech recognition is unavailable in this dashboard.' })
  const restarted = reduceVoiceControl(errored, { type: 'start' })

  assert.equal(errored.status, 'Error')
  assert.equal(errored.error, 'Speech recognition is unavailable in this dashboard.')
  assert.equal(restarted.status, 'Listening')
  assert.equal(restarted.error, '')
})
