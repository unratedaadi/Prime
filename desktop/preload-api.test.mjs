import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

import { createPrimeDesktopApi } from './preload-api.mjs'

const sandboxedPreloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url))

test('desktop preload exposes only fixed dashboard request paths', async () => {
  const calls = []
  const api = createPrimeDesktopApi(async (channel, envelope) => {
    calls.push({ channel, envelope })
    return { ok: true }
  })

  assert.deepEqual(await api.requestAgent('/connect', {}), { ok: true })
  assert.deepEqual(await api.requestAgent('/voice-status'), { ok: true })
  assert.deepEqual(await api.requestAgent('/run', { command: { type: 'app.open', payload: { app: 'notes' } } }), { ok: true })
  assert.deepEqual(calls, [
    { channel: 'prime:agent-request', envelope: { path: '/connect', body: {} } },
    { channel: 'prime:agent-request', envelope: { path: '/voice-status' } },
    { channel: 'prime:agent-request', envelope: { path: '/run', body: { command: { type: 'app.open', payload: { app: 'notes' } } } } },
  ])
  await assert.rejects(api.requestAgent('/v1/commands', {}), { message: 'invalid_request' })
  await assert.rejects(api.requestAgent('/connect', []), { message: 'invalid_request' })
  await assert.rejects(api.requestAgent('/connect', { key: 'never-from-renderer' }), { message: 'invalid_request' })
})

test('sandboxed production preload exposes the same fixed request bridge without imports', async () => {
  const source = await readFile(sandboxedPreloadPath, 'utf8')
  const exposed = {}
  const invocations = []
  vm.runInNewContext(source, {
    require(name) {
      assert.equal(name, 'electron')
      return {
        contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value } },
        ipcRenderer: { invoke: (...args) => { invocations.push(args); return Promise.resolve({ ok: true }) } },
      }
    },
  })

  assert.deepEqual(Object.keys(exposed), ['primeDesktop'])
  await exposed.primeDesktop.requestAgent('/connect', {})
  await exposed.primeDesktop.requestAgent('/voice-status')
  await exposed.primeDesktop.requestAgent('/run', { command: { type: 'app.open', payload: { app: 'notes' } } })
  assert.equal(invocations.length, 3)
  assert.equal(invocations[0][0], 'prime:agent-request')
  assert.equal(invocations[0][1].path, '/connect')
  assert.equal(Object.keys(invocations[0][1].body).length, 0)
  assert.equal(invocations[1][0], 'prime:agent-request')
  assert.equal(invocations[1][1].path, '/voice-status')
  assert.equal(invocations[2][0], 'prime:agent-request')
  assert.deepEqual(JSON.parse(JSON.stringify(invocations[2][1])), { path: '/run', body: { command: { type: 'app.open', payload: { app: 'notes' } } } })
  await assert.rejects(exposed.primeDesktop.requestAgent('/anything', {}), /invalid_request/)
  assert.equal(invocations.length, 3)
})

test('assistant IPC accepts bounded text only in both preload implementations', async () => {
  const api = createPrimeDesktopApi(async () => ({ ok: true }))
  const exposed = {}
  vm.runInNewContext(await readFile(sandboxedPreloadPath, 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value } }, ipcRenderer: { invoke: async () => ({ ok: true }) } }),
  })
  for (const bridge of [api, exposed.primeDesktop]) {
    assert.equal((await bridge.requestAgent('/assistant', { text: 'Open Google Chrome' })).ok, true)
    for (const body of [{ text: '' }, { text: ' ' }, { text: 'x'.repeat(2001) }, { text: 1 }, { text: 'hello', key: 'secret' }, { command: 'hello' }]) {
      await assert.rejects(bridge.requestAgent('/assistant', body), /invalid_request/)
    }
  }
})
