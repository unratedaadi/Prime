import assert from 'node:assert/strict'
import test from 'node:test'
import { describeCommand, describeResult, parseLocalCommand, requestAgent } from './localAgent.js'

test('only exact safe commands parse, never shell suffixes or arbitrary apps', () => {
  assert.deepEqual(parseLocalCommand('  STATUS '), { type: 'system.status', payload: {} })
  assert.deepEqual(parseLocalCommand('open NOTES'), { type: 'app.open', payload: { app: 'notes' } })
  assert.deepEqual(parseLocalCommand('open WhatsApp'), { type: 'app.open', payload: { app: 'whatsapp' } })
  assert.deepEqual(parseLocalCommand('open Safari'), { type: 'app.open', payload: { app: 'safari' } })
  assert.deepEqual(parseLocalCommand('close Safari'), { type: 'app.close', payload: { app: 'safari' } })
  assert.deepEqual(parseLocalCommand('search Google for today weather in Mumbai'), { type: 'web.search', payload: { query: 'today weather in Mumbai' } })
  assert.deepEqual(parseLocalCommand('search YouTube for focus music'), { type: 'web.search', payload: { query: 'focus music', provider: 'youtube' } })
  for (const command of ['open Terminal', 'open Notes; rm file', 'status && whoami', 'delete everything', '', 'open Notes then Finder']) assert.equal(parseLocalCommand(command), null)
})

test('notification payload is bounded and retained as data', () => {
  assert.equal(parseLocalCommand('notify '), null)
  assert.equal(parseLocalCommand(`notify ${'a'.repeat(141)}`), null)
  assert.equal(parseLocalCommand(`notify ${'a'.repeat(140)}`).payload.body.length, 140)
  assert.deepEqual(parseLocalCommand('notify <script>hello</script>'), { type: 'notification.send', payload: { title: 'PRIME', body: '<script>hello</script>' } })
})

test('review and result descriptions distinguish notification acceptance from visibility', () => {
  assert.equal(describeCommand(parseLocalCommand('open Notes')), 'Open Notes')
  assert.match(describeResult(parseLocalCommand('notify Hi'), { delivered: true }), /Visibility depends/)
})

test('browser requests use a fixed same-origin endpoint with no agent credentials', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ ok: true, connected: false }) } })
  await requestAgent()
  await requestAgent('/connect', {})
  assert.equal(calls[0].url, '/api/local-agent')
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[1].options.headers['X-Astra-Dashboard'], '1')
  assert.equal(calls[1].options.headers.Authorization, undefined)
  assert.equal(calls[1].options.method, 'POST')
})

test('desktop requests use the narrow preload bridge instead of fetch', async (t) => {
  const originalWindow = globalThis.window
  const calls = []
  globalThis.window = { primeDesktop: { requestAgent: async (path, body) => {
    calls.push({ path, body })
    return { ok: true, connected: false, paused: false, device: null }
  } } }
  t.after(() => { globalThis.window = originalWindow })
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('fetch must not be called') })

  assert.deepEqual(await requestAgent('/connect', {}), { ok: true, connected: false, paused: false, device: null })
  assert.deepEqual(calls, [{ path: '/connect', body: {} }])
})

test('offline, server errors and static hosting get useful messages and no retries', async (t) => {
  let calls = 0
  const mocked = t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('offline') })
  await assert.rejects(requestAgent('/execute', { reviewId: 'example' }), /check its result before retrying/)
  assert.equal(calls, 1)
  mocked.mock.mockImplementation(async () => ({ ok: false, json: async () => ({ ok: false, code: 'dashboard_paused' }) }))
  await assert.rejects(requestAgent('/review', {}), /paused/)
  mocked.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new Error('html') } }))
  await assert.rejects(requestAgent(), /static hosting cannot control/)
})

test('assistant input accepts wake prefixes without changing requested content', async () => {
  const { normalizeAssistantInput } = await import('./localAgent.js')
  assert.equal(normalizeAssistantInput(' Hey Prime, open Google Chrome '), 'open Google Chrome')
  assert.equal(normalizeAssistantInput('प्राइम, नोट्स खोलो'), 'नोट्स खोलो')
  assert.equal(normalizeAssistantInput('primeval forest'), 'primeval forest')
  assert.equal(normalizeAssistantInput('what does prime mean?'), 'what does prime mean?')
})

test('assistant request uses local bridge and validates the reply before displaying it', async (t) => {
  const { requestAssistant } = await import('./localAgent.js')
  let envelope
  const mocked = t.mock.method(globalThis, 'fetch', async (url, options) => {
    envelope = { url, body: JSON.parse(options.body) }
    return { ok: true, json: async () => ({ ok: true, data: { kind: 'answer', message: 'Hello from this Mac.' } }) }
  })
  assert.deepEqual(await requestAssistant('Hey Prime, hello'), { kind: 'answer', message: 'Hello from this Mac.' })
  assert.deepEqual(envelope, { url: '/api/local-agent/assistant', body: { text: 'hello' } })
  mocked.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ ok: true, data: { message: { private: 'bad' } } }) }))
  await assert.rejects(requestAssistant('hello'), /valid reply/)
  await assert.rejects(requestAssistant('a'.repeat(2001)), /2,000/)
})
