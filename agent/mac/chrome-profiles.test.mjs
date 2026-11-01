import assert from 'node:assert/strict'
import test from 'node:test'

import { listChromeProfiles, resolveChromeProfile } from './chrome-profiles.mjs'

const state = JSON.stringify({ profile: { info_cache: {
  Default: { name: 'Personal' },
  'Profile 1': { name: 'Work' },
  'Profile 2': { name: '../../unsafe' },
} } })

test('lists only valid Chrome profile directory and display-name pairs', () => {
  assert.deepEqual(listChromeProfiles(state), [
    { directory: 'Default', name: 'Personal' },
    { directory: 'Profile 1', name: 'Work' },
  ])
})

test('resolves Chrome profiles by directory or user-visible name', () => {
  const profiles = listChromeProfiles(state)
  assert.deepEqual(resolveChromeProfile('work', profiles), { directory: 'Profile 1', name: 'Work' })
  assert.deepEqual(resolveChromeProfile('default', profiles), { directory: 'Default', name: 'Personal' })
  assert.equal(resolveChromeProfile('../Default', profiles), null)
})
