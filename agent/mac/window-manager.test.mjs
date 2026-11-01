import assert from 'node:assert/strict'
import test from 'node:test'

import { getDisplays, moveWindow } from './window-manager.mjs'

test('display enumeration invokes only the fixed native helper command', async () => {
  const calls = []
  const result = await getDisplays({ executable: '/tmp/prime-window-manager', execFile: async (...args) => { calls.push(args); return { stdout: '{"ok":true,"data":{"displays":[{"id":"1","kind":"internal"}]}}' } } })
  assert.deepEqual(result, { ok: true, data: { displays: [{ id: '1', kind: 'internal' }] } })
  assert.deepEqual(calls, [['/tmp/prime-window-manager', ['displays'], { timeout: 8_000, maxBuffer: 64 * 1024 }]])
})

test('window move passes a validated app label and fixed display target to the helper', async () => {
  const calls = []
  const result = await moveWindow({ app: 'Google Chrome', target: 'external' }, { executable: '/tmp/prime-window-manager', execFile: async (...args) => { calls.push(args); return { stdout: '{"ok":true,"data":{"app":"Google Chrome","target":"external"}}' } } })
  assert.deepEqual(result, { ok: true, data: { app: 'Google Chrome', target: 'external' } })
  assert.deepEqual(calls, [['/tmp/prime-window-manager', ['move', 'Google Chrome', 'external'], { timeout: 8_000, maxBuffer: 64 * 1024 }]])
})

test('native helper errors are returned without exposing raw output', async () => {
  const result = await moveWindow({ app: 'Google Chrome', target: 'external' }, { executable: '/tmp/prime-window-manager', execFile: async () => ({ stdout: '{"ok":false,"code":"accessibility_permission_required"}' }) })
  assert.deepEqual(result, { ok: false, code: 'accessibility_permission_required' })
})
