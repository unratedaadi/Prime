import assert from 'node:assert/strict'
import test from 'node:test'

import { runBuiltinWorkspace } from './workspaces.mjs'

test('work setup opens the editor, Chrome, and Notes in a fixed safe order', async () => {
  const commands = []
  const result = await runBuiltinWorkspace('work', async (command) => { commands.push(command); return { ok: true } })
  assert.deepEqual(commands, [
    { type: 'app.open', payload: { app: 'Visual Studio Code' } },
    { type: 'app.open', payload: { app: 'Google Chrome' } },
    { type: 'app.open', payload: { app: 'Notes' } },
  ])
  assert.deepEqual(result, { ok: true, data: { name: 'work', opened: ['Visual Studio Code', 'Google Chrome', 'Notes'] } })
})

test('workspace stops at the first failed app and does not continue', async () => {
  const commands = []
  const result = await runBuiltinWorkspace('work', async (command) => { commands.push(command); return commands.length === 2 ? { ok: false, code: 'unknown_app' } : { ok: true } })
  assert.deepEqual(commands.map((command) => command.payload.app), ['Visual Studio Code', 'Google Chrome'])
  assert.deepEqual(result, { ok: false, code: 'workspace_failed', data: { name: 'work', opened: ['Visual Studio Code'] } })
})
