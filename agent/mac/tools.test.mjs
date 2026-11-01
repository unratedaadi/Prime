import assert from 'node:assert/strict'
import test from 'node:test'

import { executeTool } from './tools.mjs'

test('system status uses local runtime metadata without executing a process', async () => {
  let executions = 0
  const result = await executeTool(
    { type: 'system.status', payload: {} },
    { osModule: { hostname: () => 'Test-Mac', platform: () => 'darwin', release: () => '24.4.0', arch: () => 'arm64' }, execFile: async () => { executions += 1 } },
  )

  assert.deepEqual(result, { ok: true, data: { hostname: 'Test-Mac', platform: 'darwin', release: '24.4.0', arch: 'arm64' } })
  assert.equal(executions, 0)
})

test('window commands delegate only to the fixed window-manager adapter', async () => {
  const moved = await executeTool({ type: 'window.move', payload: { app: 'Google Chrome', target: 'external' } }, { moveWindow: async (payload) => ({ ok: true, data: payload }) })
  const displays = await executeTool({ type: 'display.list', payload: {} }, { getDisplays: async () => ({ ok: true, data: { displays: [{ id: '1', kind: 'internal' }] } }) })
  assert.deepEqual(moved, { ok: true, data: { app: 'Google Chrome', target: 'external' } })
  assert.deepEqual(displays, { ok: true, data: { displays: [{ id: '1', kind: 'internal' }] } })
})

test('opening an approved app maps to its fixed macOS app name', async () => {
  const calls = []
  const result = await executeTool({ type: 'app.open', payload: { app: 'calendar' } }, { execFile: async (...args) => calls.push(args) })

  assert.deepEqual(calls, [['/usr/bin/open', ['-a', 'Calendar']]])
  assert.deepEqual(result, { ok: true, data: { opened: 'calendar' } })
})

test('opening WhatsApp uses the fixed Mac application name', async () => {
  const calls = []
  const result = await executeTool({ type: 'app.open', payload: { app: 'whatsapp' } }, { execFile: async (...args) => calls.push(args) })

  assert.deepEqual(calls, [['/usr/bin/open', ['-a', 'WhatsApp']]])
  assert.deepEqual(result, { ok: true, data: { opened: 'whatsapp' } })
})

test('quitting an installed app uses its catalogued display name only', async () => {
  const calls = []
  const result = await executeTool({ type: 'app.close', payload: { app: 'Google Chrome' } }, { listInstalledApps: async () => [{ name: 'Google Chrome', path: '/Applications/Google Chrome.app' }], execFile: async (...args) => calls.push(args) })
  assert.deepEqual(result, { ok: true, data: { closed: 'Google Chrome' } })
  assert.deepEqual(calls, [['/usr/bin/osascript', ['-e', 'tell application "Google Chrome" to quit']]])
})

test('opening Spotify and Settings uses fixed macOS application names', async () => {
  const calls = []
  await executeTool({ type: 'app.open', payload: { app: 'spotify' } }, { execFile: async (...args) => calls.push(args) })
  await executeTool({ type: 'app.open', payload: { app: 'settings' } }, { execFile: async (...args) => calls.push(args) })
  assert.deepEqual(calls, [['/usr/bin/open', ['-a', 'Spotify']], ['/usr/bin/open', ['-a', 'System Settings']]])
})

test('opening Safari and Messages uses fixed macOS application names', async () => {
  const calls = []
  await executeTool({ type: 'app.open', payload: { app: 'safari' } }, { execFile: async (...args) => calls.push(args) })
  await executeTool({ type: 'app.open', payload: { app: 'messages' } }, { execFile: async (...args) => calls.push(args) })
  assert.deepEqual(calls, [['/usr/bin/open', ['-a', 'Safari']], ['/usr/bin/open', ['-a', 'Messages']]])
})

test('a web search opens a percent-encoded Google search URL', async () => {
  const calls = []
  const result = await executeTool({ type: 'web.search', payload: { query: 'weather in Mumbai & Pune' } }, { execFile: async (...args) => calls.push(args) })

  assert.deepEqual(calls, [['/usr/bin/open', ['https://www.google.com/search?q=weather+in+Mumbai+%26+Pune']]])
  assert.deepEqual(result, { ok: true, data: { searched: 'weather in Mumbai & Pune', provider: 'google' } })
})

test('a disallowed app ID never invokes the OS executor', async () => {
  let executions = 0
  const result = await executeTool({ type: 'app.open', payload: { app: 'terminal' } }, { execFile: async () => { executions += 1 } })

  assert.deepEqual(result, { ok: false, code: 'unknown_app' })
  assert.equal(executions, 0)
})

test('notification content is passed as an escaped literal to osascript', async () => {
  const calls = []
  await executeTool({ type: 'notification.send', payload: { title: 'Ready', body: 'A "quoted" update' } }, { execFile: async (...args) => calls.push(args) })

  assert.equal(calls[0][0], '/usr/bin/osascript')
  assert.equal(calls[0][1][0], '-e')
  assert.equal(calls[0][1][1].includes('A \\"quoted\\" update'), true)
})

test('a discovered app opens only by its catalogued path', async () => {
  const calls = []
  const result = await executeTool({ type: 'app.open', payload: { app: 'google chrome' } }, { listInstalledApps: async () => [{ name: 'Google Chrome', path: '/Applications/Google Chrome.app' }], execFile: async (...args) => calls.push(args) })
  assert.equal(result.ok, true)
  assert.deepEqual(calls[0], ['/usr/bin/open', ['-a', '/Applications/Google Chrome.app']])
})
test('an undiscovered app never executes a process', async () => {
  assert.deepEqual(await executeTool({ type: 'app.open', payload: { app: 'Missing App' } }, { listInstalledApps: async () => [], execFile: async () => assert.fail('No process may run') }), { ok: false, code: 'unknown_app' })
})
test('volume changes generate only the bounded numeric command', async () => {
  const calls = []
  const result = await executeTool({ type: 'system.volume', payload: { action: 'set', level: 30 } }, { execFile: async (...args) => { calls.push(args); return { stdout: '30,false' } } })
  assert.equal(result.ok, true)
  assert.equal(result.data.level, 30)
  assert.equal(calls[0][0], '/usr/bin/osascript')
  assert.match(calls[0][1][1], /set volume output volume 30/)
})
test('media actions target a fixed application and fixed script', async () => {
  const calls = []
  const result = await executeTool({ type: 'media.control', payload: { app: 'spotify', action: 'next' } }, { execFile: async (...args) => calls.push(args) })
  assert.deepEqual(calls[0], ['/usr/bin/osascript', ['-e', 'tell application "Spotify" to next track']])
  assert.equal(result.data.action, 'next')
})
test('ambiguous app names and inherited object properties never execute', async () => {
  const options = { listInstalledApps: async () => [{ name: 'Duplicate', path: '/Applications/Duplicate.app' }, { name: 'Duplicate', path: '/System/Applications/Duplicate.app' }], execFile: async () => assert.fail('No process may run') }
  assert.equal((await executeTool({ type: 'app.open', payload: { app: 'Duplicate' } }, options)).code, 'ambiguous_app')
  assert.equal((await executeTool({ type: 'app.open', payload: { app: 'constructor' } }, options)).code, 'unknown_app')
})

test('Chrome profiles are listed locally and opened only by approved profile directory', async () => {
  const calls = []
  const profiles = [{ directory: 'Default', name: 'Personal' }, { directory: 'Profile 1', name: 'Work' }]
  const listed = await executeTool({ type: 'chrome.profile.list', payload: {} }, { loadChromeProfiles: async () => profiles })
  const opened = await executeTool({ type: 'chrome.profile.open', payload: { profile: 'Work' } }, { loadChromeProfiles: async () => profiles, execFile: async (...args) => calls.push(args) })
  assert.deepEqual(listed, { ok: true, data: { profiles: ['Personal (Default)', 'Work (Profile 1)'] } })
  assert.deepEqual(opened, { ok: true, data: { profile: 'Work' } })
  assert.deepEqual(calls, [['/usr/bin/open', ['-na', 'Google Chrome', '--args', '--profile-directory=Profile 1']]])
})

test('WhatsApp calling requires one safe local contact result and uses fixed UI automation', async () => {
  const calls = []
  const result = await executeTool(
    { type: 'whatsapp.call', payload: { contact: 'Test Contact' } },
    { queryContact: async () => 'Test Contact\t+1 202 555 0143', execFile: async (...args) => calls.push(args) },
  )
  assert.deepEqual(result, { ok: true, data: { contact: 'Test Contact' } })
  assert.deepEqual(calls[0], ['/usr/bin/open', ['whatsapp://send?phone=12025550143']])
  assert.equal(calls[1][0], '/usr/bin/osascript')
  assert.match(calls[1][1][1], /tell application "WhatsApp" to activate/)
})

test('WhatsApp never starts a chat for unknown, ambiguous, or unsafe contact numbers', async () => {
  for (const response of ['NOT_FOUND', 'AMBIGUOUS', 'NO_PHONE', 'Test Contact\tnot a phone']) {
    const result = await executeTool({ type: 'whatsapp.call', payload: { contact: 'Test Contact' } }, { queryContact: async () => response, execFile: async () => assert.fail('No process may run') })
    assert.equal(result.ok, false)
  }
})
