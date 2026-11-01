import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import test from 'node:test'

import viteConfig from '../../vite.config.js'
import { createDashboardBridge, createDashboardController, dashboardBridgePlugin } from './dashboard-bridge.mjs'

const PREFIX = '/api/local-agent'
const FAKE_KEY = 'fake-dashboard-agent-key-for-tests-only'
const DEVICE = { hostname: 'test-mac', platform: 'darwin', release: 'test-release', arch: 'arm64' }
const DISCONNECTED = { ok: true, connected: false, paused: false, device: null }
const CONNECTED = { ok: true, connected: true, paused: false, device: DEVICE }
const OPEN_NOTES = { type: 'app.open', payload: { app: 'notes' } }

const upstreamResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'x-upstream-secret': FAKE_KEY },
})

const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('controller connects locally and consumes each reviewed command exactly once', async () => {
  const calls = []
  let clock = 1_000
  const controller = createDashboardController({
    now: () => clock,
    loadKey: async () => FAKE_KEY,
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init })
      const command = JSON.parse(init.body)
      return upstreamResponse({ ok: true, data: command.type === 'system.status' ? DEVICE : { opened: command.payload.app } })
    },
  })

  assert.deepEqual(await controller.request(), DISCONNECTED)
  assert.deepEqual(await controller.request('/connect', {}), CONNECTED)
  const review = await controller.request('/review', { command: OPEN_NOTES })
  assert.equal(review.review.expiresAt, 61_000)
  assert.deepEqual(await controller.request('/execute', { reviewId: review.review.id }), { ok: true, data: { opened: 'notes' } })
  await assert.rejects(controller.request('/execute', { reviewId: review.review.id }), { message: 'invalid_review' })
  const expiring = await controller.request('/review', { command: OPEN_NOTES })
  clock = expiring.review.expiresAt
  await assert.rejects(controller.request('/execute', { reviewId: expiring.review.id }), { message: 'review_expired' })
  assert.equal(calls.length, 2)
})

test('controller executes an allowlisted command directly without creating a review', async () => {
  const calls = []
  const controller = createDashboardController({
    loadKey: async () => FAKE_KEY,
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init })
      const command = JSON.parse(init.body)
      return upstreamResponse({ ok: true, data: command.type === 'system.status' ? DEVICE : { opened: command.payload.app } })
    },
  })

  await controller.request('/connect', {})
  assert.deepEqual(await controller.request('/run', { command: OPEN_NOTES }), { ok: true, data: { opened: 'notes' } })
  assert.deepEqual(JSON.parse(calls[1].body), OPEN_NOTES)
})

test('voice listener status is available without loading the Mac agent key', async () => {
  let keyLoads = 0
  const controller = createDashboardController({
    loadKey: async () => { keyLoads += 1; return FAKE_KEY },
    loadVoiceStatus: async () => ({ available: true, message: 'Listening locally for “Hey Prime”' }),
  })

  assert.deepEqual(await controller.request('/voice-status'), {
    ok: true,
    voice: { available: true, message: 'Listening locally for “Hey Prime”' },
  })
  assert.equal(keyLoads, 0)
})

async function listen(t, handler) {
  const server = createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  return server
}

async function withBridge(t, options = {}) {
  const calls = []
  let keyLoads = 0
  let middleware
  const server = await listen(t, (request, response) => middleware(request, response, () => {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('outside bridge')
  }))
  const port = server.address().port
  const host = `127.0.0.1:${port}`
  const context = {
    server,
    port,
    host,
    calls,
    get keyLoads() { return keyLoads },
    respond: async (url, init) => {
      if (url.endsWith('/v1/audit')) return upstreamResponse({ ok: true, entries: [] })
      const command = JSON.parse(init.body)
      return upstreamResponse({ ok: true, data: command.type === 'system.status' ? DEVICE : { opened: command.payload.app } })
    },
  }
  middleware = options.middlewareFactory ? options.middlewareFactory(port) : createDashboardBridge({
    port,
    agentPort: options.agentPort ?? 27182,
    now: options.now ?? Date.now,
    loadKey: async () => {
      keyLoads += 1
      return options.loadKey ? options.loadKey() : FAKE_KEY
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init })
      return options.fetchImpl ? options.fetchImpl(url, init) : context.respond(url, init)
    },
  })

  context.request = (method, path = '', { body = {}, rawBody, chunks, headers = {}, rawHeaders, absolutePath } = {}) => new Promise((resolve, reject) => {
    const outgoingHeaders = {
      host,
      'x-astra-dashboard': '1',
      ...(method === 'POST' ? { origin: `http://${host}`, 'content-type': 'application/json' } : {}),
      ...headers,
    }
    for (const name of Object.keys(outgoingHeaders)) {
      if (outgoingHeaders[name] === undefined) delete outgoingHeaders[name]
    }
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      method,
      path: absolutePath ?? `${PREFIX}${path}`,
      headers: rawHeaders ?? outgoingHeaders,
    }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { text += chunk })
      response.on('error', reject)
      response.on('end', () => {
        let parsed
        try { parsed = JSON.parse(text) } catch { parsed = null }
        resolve({ status: response.statusCode, headers: response.headers, body: parsed, text })
      })
    })
    request.on('error', reject)
    if (chunks) {
      for (const chunk of chunks) request.write(chunk)
      request.end()
    } else {
      request.end(rawBody ?? (method === 'POST' ? JSON.stringify(body) : undefined))
    }
  })
  context.get = (path = '', headers = {}) => context.request('GET', path, { headers })
  context.post = (path, body = {}, headers = {}) => context.request('POST', path, { body, headers })
  context.review = async (command = OPEN_NOTES) => {
    const response = await context.post('/review', { command })
    assert.equal(response.status, 200)
    return response.body.review
  }
  return context
}

function assertError(response, code, status) {
  assert.deepEqual(response.body, { ok: false, code })
  if (status !== undefined) assert.equal(response.status, status)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(Object.keys(response.headers).some((name) => name.startsWith('access-control-')), false)
  assert.equal(response.text.includes(FAKE_KEY), false)
}

test('starts disconnected; reading state never loads a key or contacts the agent', async (t) => {
  const bridge = await withBridge(t)
  assert.deepEqual((await bridge.get()).body, DISCONNECTED)
  assert.deepEqual((await bridge.get()).body, DISCONNECTED)
  assert.equal(bridge.keyLoads, 0)
  assert.equal(bridge.calls.length, 0)
  for (const path of ['/index.html', '/api/local-agent-other']) {
    const response = await bridge.request('GET', '', { absolutePath: path })
    assert.equal(response.text, 'outside bridge')
  }
})

test('rejects hostile hosts, origins, fetch metadata, content types, and missing custom headers before reading keys', async (t) => {
  const bridge = await withBridge(t)
  const invalidHeaders = [
    { host: 'attacker.example' },
    { host: '127.0.0.1' },
    { host: `127.0.0.1:${bridge.port + 1}` },
    { host: `127.0.0.2:${bridge.port}` },
    { host: `localhost:${bridge.port}.attacker.example` },
    { host: `LOCALHOST:${bridge.port}` },
    { host: `[::1]:${bridge.port}` },
    { 'x-astra-dashboard': undefined },
    { 'x-astra-dashboard': 'true' },
    { 'x-astra-dashboard': '1, 1' },
    { origin: undefined },
    { origin: 'null' },
    { origin: 'http://attacker.example' },
    { origin: `https://${bridge.host}` },
    { origin: `http://${bridge.host}/` },
    { origin: `http://localhost:${bridge.port}` },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'cross-site, same-origin' },
    { 'content-type': undefined },
    { 'content-type': 'text/plain' },
    { 'content-type': 'application/jsonp' },
  ]
  for (const headers of invalidHeaders) assertError(await bridge.post('/connect', {}, headers), 'bridge_forbidden', 403)
  for (const headers of [
    { 'x-astra-dashboard': undefined },
    { origin: 'http://attacker.example' },
    { 'sec-fetch-site': 'cross-site' },
  ]) assertError(await bridge.get('', headers), 'bridge_forbidden', 403)
  assert.equal(bridge.keyLoads, 0)
  assert.equal(bridge.calls.length, 0)
})

test('rejects preflight and ambiguous duplicate security headers without CORS', async (t) => {
  const bridge = await withBridge(t)
  assertError(await bridge.request('OPTIONS', '/connect', { headers: {
    origin: `http://${bridge.host}`,
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'x-astra-dashboard, content-type',
  } }), 'bridge_forbidden', 403)
  const headers = {
    Host: bridge.host,
    Origin: `http://${bridge.host}`,
    'X-Astra-Dashboard': '1',
    'Content-Type': 'application/json',
    'Sec-Fetch-Site': 'same-origin',
  }
  for (const name of Object.keys(headers)) {
    const rawHeaders = Object.entries(headers).flat().concat(name, headers[name])
    assertError(await bridge.request('POST', '/connect', { rawHeaders }), 'bridge_forbidden', 403)
  }
  assert.equal(bridge.keyLoads, 0)
})

test('accepts exact localhost origin and optional safe GET metadata', async (t) => {
  const bridge = await withBridge(t)
  for (const fetchSite of [undefined, 'same-origin', 'same-site', 'none']) {
    assert.deepEqual((await bridge.get('', { 'sec-fetch-site': fetchSite })).body, DISCONNECTED)
  }
  const response = await bridge.post('/connect', {}, {
    host: `localhost:${bridge.port}`,
    origin: `http://localhost:${bridge.port}`,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json; charset=utf-8',
  })
  assert.deepEqual(response.body, CONNECTED)
})

test('connect alone reads status with the local key, fixed destination, timeout, and no redirects or credential leakage', async (t) => {
  const bridge = await withBridge(t, { agentPort: 28182 })
  bridge.respond = async () => upstreamResponse({ ok: true, data: DEVICE, key: FAKE_KEY, url: `http://private/${FAKE_KEY}` })
  const response = await bridge.post('/connect', {}, { authorization: 'Bearer browser-supplied-value' })
  assert.deepEqual(response.body, CONNECTED)
  assert.equal(response.text.includes(FAKE_KEY), false)
  assert.equal(response.headers['x-upstream-secret'], undefined)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.headers['access-control-allow-origin'], undefined)
  assert.equal(bridge.keyLoads, 1)
  assert.equal(bridge.calls.length, 1)
  const call = bridge.calls[0]
  assert.equal(call.url, 'http://127.0.0.1:28182/v1/commands')
  assert.equal(call.method, 'POST')
  assert.deepEqual(call.headers, { authorization: `Bearer ${FAKE_KEY}`, 'content-type': 'application/json' })
  assert.deepEqual(JSON.parse(call.body), { type: 'system.status', payload: {} })
  assert.equal(call.redirect, 'error')
  assert.ok(call.signal instanceof AbortSignal)
  bridge.respond = async () => { throw new Error('offline') }
  assert.deepEqual((await bridge.get()).body, CONNECTED)
  assert.equal(bridge.calls.length, 1)
})

test('disconnected review, execution, and audit are blocked, while pause and disconnect remain local', async (t) => {
  const bridge = await withBridge(t)
  assertError(await bridge.post('/review', { command: OPEN_NOTES }), 'dashboard_disconnected', 409)
  assertError(await bridge.post('/execute', { reviewId: 'unconfirmed' }), 'dashboard_disconnected', 409)
  assertError(await bridge.get('/audit'), 'dashboard_disconnected', 409)
  assert.deepEqual((await bridge.post('/pause', { paused: true })).body, { ...DISCONNECTED, paused: true })
  assert.deepEqual((await bridge.post('/disconnect')).body, { ...DISCONNECTED, paused: true })
  assert.equal(bridge.calls.length, 0)
  assert.equal(bridge.keyLoads, 0)
})

test('review only normalizes the command; execution uses the reviewed value exactly once', async (t) => {
  const bridge = await withBridge(t, { now: () => 1_000 })
  await bridge.post('/connect')
  const review = await bridge.review({ ...OPEN_NOTES, untrusted: 'ignored', payload: { app: 'notes', script: 'ignored' } })
  assert.match(review.id, /^[a-f0-9-]{36}$/)
  assert.deepEqual(review.command, OPEN_NOTES)
  assert.equal(review.expiresAt, 61_000)
  assert.equal(bridge.calls.length, 1)
  assertError(await bridge.post('/execute', { reviewId: 'wrong-review' }), 'invalid_review', 409)
  assertError(await bridge.post('/execute', { reviewId: review.id, command: { type: 'system.status' } }), 'invalid_request', 400)
  assert.equal(bridge.calls.length, 1)
  assert.deepEqual((await bridge.post('/execute', { reviewId: review.id })).body, { ok: true, data: { opened: 'notes' } })
  assert.deepEqual(JSON.parse(bridge.calls[1].body), OPEN_NOTES)
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
  assert.equal(bridge.calls.length, 2)
})

test('a new review replaces the previous pending confirmation', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const first = await bridge.review()
  const second = await bridge.review({ type: 'system.status', payload: { ignored: true } })
  assert.notEqual(first.id, second.id)
  assert.deepEqual(second.command, { type: 'system.status', payload: {} })
  assertError(await bridge.post('/execute', { reviewId: first.id }), 'invalid_review', 409)
  assert.equal((await bridge.post('/execute', { reviewId: second.id })).body.ok, true)
  assert.equal(bridge.calls.length, 2)
})

test('consumes a review before awaiting execution, preventing concurrent duplicates', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const review = await bridge.review()
  const started = deferred()
  const finish = deferred()
  t.after(() => finish.resolve(upstreamResponse({ ok: true, data: {} })))
  bridge.respond = async () => {
    started.resolve()
    return finish.promise
  }
  const execution = bridge.post('/execute', { reviewId: review.id })
  await started.promise
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
  assert.equal(bridge.calls.length, 2)
  finish.resolve(upstreamResponse({ ok: true, data: { opened: 'notes' } }))
  assert.equal((await execution).body.ok, true)
})

test('reviews expire at sixty seconds and cannot be reused after expiry', async (t) => {
  let clock = 10
  const bridge = await withBridge(t, { now: () => clock })
  await bridge.post('/connect')
  const expired = await bridge.review()
  clock = expired.expiresAt
  assertError(await bridge.post('/execute', { reviewId: expired.id }), 'review_expired', 410)
  assertError(await bridge.post('/execute', { reviewId: expired.id }), 'invalid_review', 409)
  assert.equal(bridge.calls.length, 1)
  const current = await bridge.review()
  clock = current.expiresAt - 1
  assert.equal((await bridge.post('/execute', { reviewId: current.id })).body.ok, true)
})

test('pause invalidates reviews and blocks execution, but neither reconnection nor disconnect unpauses', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const review = await bridge.review()
  assert.deepEqual((await bridge.post('/pause', { paused: true })).body, { ...CONNECTED, paused: true })
  assertError(await bridge.post('/review', { command: OPEN_NOTES }), 'dashboard_paused', 409)
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'dashboard_paused', 409)
  assert.equal(bridge.calls.length, 1)
  assert.deepEqual((await bridge.get('/audit')).body, { ok: true, entries: [] })
  assert.deepEqual((await bridge.post('/connect')).body, { ...CONNECTED, paused: true })
  assert.deepEqual((await bridge.post('/disconnect')).body, { ...DISCONNECTED, paused: true })
  assert.deepEqual((await bridge.post('/connect')).body, { ...CONNECTED, paused: true })
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'dashboard_paused', 409)
  assert.deepEqual((await bridge.post('/pause', { paused: false })).body, CONNECTED)
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
  assert.equal(bridge.calls.every((call) => !call.body || JSON.parse(call.body).type === 'system.status'), true)
})

test('unpausing without reconnecting cannot restore a paused review', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const review = await bridge.review()
  await bridge.post('/pause', { paused: true })
  await bridge.post('/pause', { paused: false })
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
  assert.equal(bridge.calls.length, 1)
})

test('disconnect clears device and review while offline; a new middleware starts disconnected', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const review = await bridge.review()
  bridge.respond = async () => { throw new Error('agent offline') }
  assert.deepEqual((await bridge.post('/pause', { paused: true })).body, { ...CONNECTED, paused: true })
  assert.deepEqual((await bridge.post('/disconnect')).body, { ...DISCONNECTED, paused: true })
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'dashboard_disconnected', 409)
  assert.equal(bridge.calls.length, 1)
  const restarted = await withBridge(t)
  assert.deepEqual((await restarted.get()).body, DISCONNECTED)
  assert.equal(restarted.keyLoads, 0)
})

test('connect invalidates earlier reviews even when already connected', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const review = await bridge.review()
  await bridge.post('/connect')
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
  assert.equal(bridge.keyLoads, 2)
  assert.equal(bridge.calls.length, 2)
})

test('existing policy is enforced with no execution at review', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  for (const app of ['calendar', 'finder', 'notes', 'reminders']) {
    assert.deepEqual((await bridge.review({ type: 'app.open', payload: { app } })).command, { type: 'app.open', payload: { app } })
  }
  const notification = { type: 'notification.send', payload: { title: 'a'.repeat(140), body: 'b'.repeat(140) } }
  assert.deepEqual((await bridge.review(notification)).command, notification)
  const invalid = [
    [{ type: 'shell.run', payload: { command: 'open anything' } }, 'unknown_command'],
    [{ type: 'voice.pause' }, 'unknown_command'],
    [{}, 'unknown_command'],
    [{ type: 'app.open', payload: { app: 'terminal' } }, 'unknown_app'],
    [{ type: 'app.open', payload: { app: '/Applications/Calendar.app' } }, 'unknown_app'],
    [{ type: 'notification.send', payload: { title: '', body: 'body' } }, 'invalid_notification'],
    [{ type: 'notification.send', payload: { title: 'a'.repeat(141), body: 'body' } }, 'invalid_notification'],
    [{ type: 'notification.send', payload: { title: 'title', body: 'b'.repeat(141) } }, 'invalid_notification'],
    [{ type: 'notification.send', payload: { title: 'title', body: 1 } }, 'invalid_notification'],
    [{ type: 'notification.send' }, 'invalid_notification'],
  ]
  for (const [command, code] of invalid) assertError(await bridge.post('/review', { command }), code, 400)
  assert.equal(bridge.calls.length, 1)
})

test('rejects malformed JSON and incorrect request shapes without reading credentials', async (t) => {
  const bridge = await withBridge(t)
  for (const rawBody of ['', '{', '{"paused":', 'undefined']) {
    assertError(await bridge.request('POST', '/connect', { rawBody }), 'invalid_json', 400)
  }
  for (const body of [null, [], 'hello', 1, true, { url: 'http://attacker.example' }, { key: FAKE_KEY }]) {
    assertError(await bridge.post('/connect', body), 'invalid_request', 400)
  }
  for (const body of [{}, { paused: 'false' }, { paused: false, voice: false }]) {
    assertError(await bridge.post('/pause', body), 'invalid_request', 400)
  }
  assertError(await bridge.post('/disconnect', { agentPort: 80 }), 'invalid_request', 400)
  assertError(await bridge.request('PUT', '/connect'), 'invalid_request', 400)
  for (const path of ['/v1/commands', '/http://attacker.example', '/connect/extra']) {
    assertError(await bridge.post(path), 'invalid_request', 400)
  }
  assert.equal(bridge.keyLoads, 0)
  assert.equal(bridge.calls.length, 0)
  await bridge.post('/connect')
  for (const body of [{}, { command: null }, { command: [] }, { command: 'system.status' }]) {
    assertError(await bridge.post('/review', body), 'invalid_request', 400)
  }
  for (const body of [{}, { reviewId: 3 }, { reviewId: '' }, { reviewId: null }]) {
    assertError(await bridge.post('/execute', body), 'invalid_request', 400)
  }
})

test('bounds input to 16 KiB by bytes, including chunked input, without dropping the error response', async (t) => {
  const bridge = await withBridge(t)
  const oversized = ' '.repeat(16 * 1024 + 1)
  assertError(await bridge.request('POST', '/connect', {
    rawBody: oversized,
    headers: { 'content-length': String(Buffer.byteLength(oversized)) },
  }), 'body_too_large', 413)
  assertError(await bridge.request('POST', '/connect', { chunks: ['{"value":"', 'é'.repeat(9_000), '"}'] }), 'body_too_large', 413)
  assert.equal(bridge.keyLoads, 0)
  const boundary = '{}'.padEnd(16 * 1024, ' ')
  assert.deepEqual((await bridge.request('POST', '/connect', { rawBody: boundary })).body, CONNECTED)
  assert.equal(bridge.keyLoads, 1)
})

test('an interrupted JSON body does not produce an unhandled rejection or contact the agent', async (t) => {
  const bridge = await withBridge(t)
  const arrived = deferred()
  bridge.server.once('request', () => arrived.resolve())
  const request = httpRequest({ hostname: '127.0.0.1', port: bridge.port, method: 'POST', path: `${PREFIX}/connect`, headers: {
    host: bridge.host,
    origin: `http://${bridge.host}`,
    'x-astra-dashboard': '1',
    'content-type': 'application/json',
  } })
  request.on('error', () => {})
  request.write('{')
  await arrived.promise
  request.destroy()
  assert.deepEqual((await bridge.get()).body, DISCONNECTED)
  assert.equal(bridge.keyLoads, 0)
})

test('missing or unreadable key errors are sanitized and never reach the agent', async (t) => {
  for (const loadKey of [
    async () => { throw new Error(`/private/agent-key ${FAKE_KEY}`) },
    () => null,
    () => '',
    () => 'short',
    () => `${FAKE_KEY}\nInjected: header`,
  ]) {
    const bridge = await withBridge(t, { loadKey })
    assertError(await bridge.post('/connect'), 'agent_key_missing', 503)
    assert.deepEqual((await bridge.get()).body, DISCONNECTED)
    assert.equal(bridge.calls.length, 0)
  }
})

test('offline and unauthorized connect failures clear status, hide upstream details, and are not retried', async (t) => {
  const cases = [
    [async () => { throw new Error(`network error Bearer ${FAKE_KEY}`) }, 'agent_unavailable', 503],
    [async () => upstreamResponse({ ok: false, code: 'unauthorized', detail: FAKE_KEY }, 401), 'agent_unauthorized', 401],
    [async () => upstreamResponse({ ok: false, code: FAKE_KEY }, 403), 'agent_unauthorized', 401],
    [async () => new Response('{'), 'agent_unavailable', 503],
    [async () => upstreamResponse({ ok: true, data: null }), 'agent_unavailable', 503],
    [async () => upstreamResponse({ ok: false, code: FAKE_KEY }, 500), 'execution_failed', 502],
  ]
  for (const [fetchImpl, code, status] of cases) {
    const bridge = await withBridge(t, { fetchImpl })
    assertError(await bridge.post('/connect'), code, status)
    assert.deepEqual((await bridge.get()).body, DISCONNECTED)
    assert.equal(bridge.calls.length, 1)
    assert.equal(bridge.keyLoads, 1)
  }
})

test('failed reconnection removes previously connected metadata and pending review', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const review = await bridge.review()
  const respond = bridge.respond
  bridge.respond = async () => { throw new Error('offline') }
  assertError(await bridge.post('/connect'), 'agent_unavailable', 503)
  assert.deepEqual((await bridge.get()).body, DISCONNECTED)
  bridge.respond = respond
  await bridge.post('/connect')
  assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
})

test('execution failures are sanitized, never retried, and cannot replay a consumed review', async (t) => {
  for (const [respond, code, disconnected] of [
    [async () => upstreamResponse({ ok: false, code: FAKE_KEY, message: FAKE_KEY }, 500), 'execution_failed', false],
    [async () => upstreamResponse({ ok: false, code: 'unknown_app' }, 400), 'unknown_app', false],
    [async () => { throw new Error(`action may already have occurred ${FAKE_KEY}`) }, 'agent_unavailable', true],
    [async () => upstreamResponse({ ok: false, code: 'unauthorized' }, 401), 'agent_unauthorized', true],
  ]) {
    const bridge = await withBridge(t)
    await bridge.post('/connect')
    const review = await bridge.review()
    const success = bridge.respond
    bridge.respond = respond
    assertError(await bridge.post('/execute', { reviewId: review.id }), code)
    assert.equal(bridge.calls.length, 2)
    assert.deepEqual((await bridge.get()).body, disconnected ? DISCONNECTED : CONNECTED)
    if (disconnected) {
      bridge.respond = success
      await bridge.post('/connect')
    }
    assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
    assert.equal(bridge.calls.length, disconnected ? 3 : 2)
  }
})

test('audit authenticates only with the stored key and failures disconnect and invalidate pending reviews', async (t) => {
  for (const failure of [
    async () => upstreamResponse({ ok: false, code: 'unauthorized', detail: FAKE_KEY }, 401),
    async () => { throw new Error(`offline ${FAKE_KEY}`) },
  ]) {
    const bridge = await withBridge(t)
    assertError(await bridge.get('/audit'), 'dashboard_disconnected', 409)
    await bridge.post('/connect')
    const review = await bridge.review()
    const entries = [{ at: '2026-01-01T00:00:00.000Z', outcome: 'accepted', type: 'system.status' }]
    const success = bridge.respond
    bridge.respond = async () => upstreamResponse({ ok: true, entries, key: FAKE_KEY })
    const audit = await bridge.get('/audit', { authorization: 'Bearer untrusted-browser-key' })
    assert.deepEqual(audit.body, { ok: true, entries })
    assert.equal(audit.headers['x-upstream-secret'], undefined)
    assert.equal(audit.text.includes(FAKE_KEY), false)
    assert.equal(bridge.calls[1].url, 'http://127.0.0.1:27182/v1/audit')
    assert.equal(bridge.calls[1].method, 'GET')
    assert.deepEqual(bridge.calls[1].headers, { authorization: `Bearer ${FAKE_KEY}` })
    assert.equal(bridge.calls[1].body, undefined)
    bridge.respond = failure
    assert.equal((await bridge.get('/audit')).body.ok, false)
    assert.deepEqual((await bridge.get()).body, DISCONNECTED)
    assert.equal(bridge.calls.length, 3)
    bridge.respond = success
    await bridge.post('/connect')
    assertError(await bridge.post('/execute', { reviewId: review.id }), 'invalid_review', 409)
  }
})

test('credential echoes in upstream data are rejected, not returned to the browser', async (t) => {
  const bridge = await withBridge(t)
  bridge.respond = async () => upstreamResponse({ ok: true, data: { hostname: `Bearer ${FAKE_KEY}` } })
  assertError(await bridge.post('/connect'), 'agent_unavailable', 503)
  assert.deepEqual((await bridge.get()).body, DISCONNECTED)
  bridge.respond = async () => upstreamResponse({ ok: true, data: DEVICE })
  await bridge.post('/connect')
  bridge.respond = async () => upstreamResponse({ ok: true, entries: [{ reason: FAKE_KEY }] })
  assertError(await bridge.get('/audit'), 'agent_unavailable', 503)
  assert.deepEqual((await bridge.get()).body, DISCONNECTED)
})

test('a slow agent request times out without retrying', { timeout: 10_000 }, async (t) => {
  const bridge = await withBridge(t, { fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }) })
  assertError(await bridge.post('/connect'), 'agent_unavailable', 503)
  assert.equal(bridge.calls.length, 1)
  assert.equal(bridge.calls[0].signal.aborted, true)
  assert.deepEqual((await bridge.get()).body, DISCONNECTED)
})

test('real fetch never follows a stub agent redirect or sends its key to the redirect target', async (t) => {
  let redirectedCalls = 0
  const target = await listen(t, (_request, response) => {
    redirectedCalls += 1
    response.end('{}')
  })
  let agentCalls = 0
  const agent = await listen(t, (request, response) => {
    agentCalls += 1
    assert.equal(request.url, '/v1/commands')
    assert.equal(request.headers.authorization, `Bearer ${FAKE_KEY}`)
    response.writeHead(307, { location: `http://127.0.0.1:${target.address().port}/stolen` })
    response.end()
  })
  const bridge = await withBridge(t, { agentPort: agent.address().port, fetchImpl: fetch })
  assertError(await bridge.post('/connect'), 'agent_unavailable', 503)
  assert.equal(agentCalls, 1)
  assert.equal(redirectedCalls, 0)
})

test('disconnect during key loading cancels connection before any upstream request', async (t) => {
  const started = deferred()
  const loaded = deferred()
  const bridge = await withBridge(t, { loadKey: async () => {
    started.resolve()
    return loaded.promise
  } })
  const connection = bridge.post('/connect')
  await started.promise
  assert.deepEqual((await bridge.post('/disconnect')).body, DISCONNECTED)
  loaded.resolve(FAKE_KEY)
  assertError(await connection, 'dashboard_disconnected', 409)
  assert.equal(bridge.calls.length, 0)
})

test('an in-flight status response cannot undo disconnect, or unpause the dashboard', async (t) => {
  const bridge = await withBridge(t)
  const started = deferred()
  const finish = deferred()
  bridge.respond = async () => {
    started.resolve()
    return finish.promise
  }
  const connection = bridge.post('/connect')
  await started.promise
  await bridge.post('/pause', { paused: true })
  await bridge.post('/disconnect')
  finish.resolve(upstreamResponse({ ok: true, data: DEVICE }))
  assertError(await connection, 'dashboard_disconnected', 409)
  assert.deepEqual((await bridge.get()).body, { ...DISCONNECTED, paused: true })
})

test('a stale failed audit cannot disconnect a newer successful connection', async (t) => {
  const bridge = await withBridge(t)
  await bridge.post('/connect')
  const started = deferred()
  const finish = deferred()
  bridge.respond = async (url) => {
    if (url.endsWith('/v1/audit')) {
      started.resolve()
      return finish.promise
    }
    return upstreamResponse({ ok: true, data: DEVICE })
  }
  const audit = bridge.get('/audit')
  await started.promise
  await bridge.post('/connect')
  const review = await bridge.review()
  finish.resolve(upstreamResponse({ ok: false, code: 'unauthorized' }, 401))
  assertError(await audit, 'agent_unauthorized', 401)
  assert.deepEqual((await bridge.get()).body, CONNECTED)
  assert.equal((await bridge.post('/execute', { reviewId: review.id })).body.ok, true)
})

test('Vite binds fixed loopback ports and both plugin hooks use their resolved port', async (t) => {
  assert.deepEqual(viteConfig.server, { host: '127.0.0.1', port: 5173, strictPort: true })
  assert.deepEqual(viteConfig.preview, { host: '127.0.0.1', port: 4173, strictPort: true })
  assert.ok(viteConfig.plugins.some((plugin) => plugin.name === 'astra-dashboard-bridge'))
  for (const [hook, section] of [['configureServer', 'server'], ['configurePreviewServer', 'preview']]) {
    const bridge = await withBridge(t, { middlewareFactory: (port) => {
      let middleware
      dashboardBridgePlugin()[hook]({
        config: { [section]: { port } },
        middlewares: { use: (handler) => { middleware = handler } },
      })
      assert.equal(typeof middleware, 'function')
      return middleware
    } })
    assert.deepEqual((await bridge.get()).body, DISCONNECTED)
    assertError(await bridge.get('', { host: '127.0.0.1:1' }), 'bridge_forbidden', 403)
  }
  for (const port of [0, -1, 65536, '5173']) assert.throws(() => createDashboardBridge({ port }), /fixed TCP port/)
  assert.throws(() => createDashboardBridge({ agentPort: '27182/remote' }), /fixed TCP port/)
})
