import assert from 'node:assert/strict'
import test from 'node:test'

import { applySettingsPatch, defaultPrimeSettings, shouldStoreTranscript } from './primeSettings.js'

test('settings retain a local-first, privacy-preserving default', () => {
  assert.equal(defaultPrimeSettings.wakePhrase, 'Hey Prime')
  assert.equal(defaultPrimeSettings.transcriptStorage, 'local')
  assert.equal(defaultPrimeSettings.cloudDisclosure, false)
  assert.equal(defaultPrimeSettings.appearance, 'dark')
  assert.equal(shouldStoreTranscript(defaultPrimeSettings), true)
})

test('settings patch only accepts known safe preference values', () => {
  const next = applySettingsPatch(defaultPrimeSettings, {
    wakePhrase: 'Prime', language: 'hinglish', speechProvider: 'mock-local', ttsRate: 1.1,
    ttsVolume: 0.7, autoDeleteDays: 30, appearance: 'light', pushToTalkShortcut: 'Space',
  })
  assert.equal(next.wakePhrase, 'Prime')
  assert.equal(next.language, 'hinglish')
  assert.equal(next.autoDeleteDays, 30)
  assert.equal(next.appearance, 'light')
  assert.equal(next.ttsRate, 1.1)
  assert.equal(applySettingsPatch(next, { speechProvider: 'cloud-unknown', autoDeleteDays: -2 }).speechProvider, 'mock-local')
})
