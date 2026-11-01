import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { validateCommand } from './policy.mjs'

const PREFIX = '/api/local-agent'
const MAX_BODY_BYTES = 16 * 1024
const AGENT_TIMEOUT_MS = 5_000
const REVIEW_LIFETIME_MS = 60_000
const MAX_VOICE_STATUS_LENGTH = 240
const POLICY_ERRORS = new Set(['unknown_command', 'unknown_app', 'invalid_notification', 'invalid_search'])
const ERROR_STATUS = {
  bridge_forbidden: 403,
  invalid_json: 400,
  invalid_request: 400,
  body_too_large: 413,
  agent_key_missing: 503,
  agent_unauthorized: 401,
  agent_unavailable: 503,
  dashboard_disconnected: 409,
  dashboard_paused: 409,
  invalid_review: 409,
  review_expired: 410,
  execution_failed: 502,
  unknown_command: 400,
  unknown_app: 400,
  invalid_notification: 400,
  invalid_search: 400,
}

class BridgeError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// Read only: connecting never creates a key or changes local file permissions.
async function loadAgentKey() {
  const directory = process.env.ASTRA_STATE_DIR ?? join(homedir(), '.astra')
  const key = (await readFile(join(directory, 'agent-key'), 'utf8')).trim()
  if (!/^[a-f0-9]{64}$/.test(key)) throw new BridgeError('agent_key_missing')
  return key
}

async function readVoiceStatus() {
  try {
    const raw = await readFile(join(homedir(), '.prime', 'wake-listener-status.txt'), 'utf8')
    const message = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_VOICE_STATUS_LENGTH)
    return message
      ? { available: true, message }
      : { available: false, message: 'PRIME Voice Assistant has not reported a status yet.' }
  } catch {
    return { available: false, message: 'PRIME Voice Assistant is not reporting a status.' }
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasFields = (value, fields) => isObject(value)
  && Object.keys(value).length === fields.length
  && fields.every((field) => Object.hasOwn(value, field))

function sendJson(response, status, body) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    let settled = false
    const fail = (code) => {
      if (settled) return
      settled = true
      chunks.length = 0
      reject(new BridgeError(code))
    }

    request.on('data', (chunk) => {
      if (settled) return
      bytes += Buffer.byteLength(chunk)
      if (bytes > MAX_BODY_BYTES) {
        // Keep draining, but stop buffering; do not destroy the error response.
        fail('body_too_large')
        return
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new BridgeError('invalid_json'))
      }
    })
    request.on('aborted', () => fail('invalid_request'))
    request.on('error', () => fail('invalid_request'))
    if (Number(request.headers['content-length']) > MAX_BODY_BYTES) fail('body_too_large')
    if (request.aborted) fail('invalid_request')
  })
}

function checkRequest(request, port) {
  const host = request.headers.host
  const origin = request.headers.origin
  const fetchSite = request.headers['sec-fetch-site']
  const guardedHeaders = new Set(['host', 'origin', 'x-astra-dashboard', 'sec-fetch-site', 'content-type'])
  const seen = new Set()
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index].toLowerCase()
    if (guardedHeaders.has(name) && seen.has(name)) throw new BridgeError('bridge_forbidden')
    seen.add(name)
  }

  if (request.method === 'OPTIONS'
    || (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
    || request.headers['x-astra-dashboard'] !== '1'
    || (origin !== undefined && origin !== `http://${host}`)
    || (fetchSite !== undefined && !['same-origin', 'same-site', 'none'].includes(fetchSite))) {
    throw new BridgeError('bridge_forbidden')
  }
  if (request.method === 'POST'
    && (origin !== `http://${host}`
      || request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')) {
    throw new BridgeError('bridge_forbidden')
  }
}

export function createDashboardController({ agentPort = 27182, loadKey = loadAgentKey, loadVoiceStatus = readVoiceStatus, fetchImpl = fetch, now = Date.now } = {}) {
  if (!Number.isInteger(agentPort) || agentPort < 1 || agentPort > 65535) throw new TypeError('A fixed TCP port is required.')
  let key = null
  let device = null
  let paused = false
  let pendingReview = null
  let generation = 0

  const state = () => ({ ok: true, connected: key !== null, paused, device })
  const disconnect = () => {
    generation += 1
    key = null
    device = null
    pendingReview = null
  }
  const requireConnection = (unpaused = false) => {
    if (key === null) throw new BridgeError('dashboard_disconnected')
    if (unpaused && paused) throw new BridgeError('dashboard_paused')
  }

  async function callAgent(credential, path, command) {
    let response
    let result
    try {
      response = await fetchImpl(`http://127.0.0.1:${agentPort}${path}`, {
        method: command === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${credential}`,
          ...(path === '/v1/assistant' ? { 'x-prime-client': 'dashboard' } : {}),
          ...(command === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(command === undefined ? {} : { body: JSON.stringify(command) }),
        redirect: 'error',
        signal: AbortSignal.timeout(path === '/v1/assistant' ? 60_000 : AGENT_TIMEOUT_MS),
      })
      if (response.status === 401 || response.status === 403) throw new BridgeError('agent_unauthorized')
      if (response.status >= 300 && response.status < 400) throw new BridgeError('agent_unavailable')
      result = await response.json()
    } catch (error) {
      throw error instanceof BridgeError ? error : new BridgeError('agent_unavailable')
    }

    if (result?.ok === false && result.code === 'unauthorized') throw new BridgeError('agent_unauthorized')
    if (!response.ok || result?.ok !== true) {
      const code = POLICY_ERRORS.has(result?.code) ? result.code
        : path === '/v1/audit' ? 'agent_unavailable' : 'execution_failed'
      throw new BridgeError(code)
    }
    let body
    if (path === '/v1/audit') {
      if (!Array.isArray(result.entries)) throw new BridgeError('agent_unavailable')
      body = { ok: true, entries: result.entries }
    } else {
      if (!isObject(result.data)) throw new BridgeError('agent_unavailable')
      body = { ok: true, data: result.data }
    }
    // Fail closed if an upstream ever echoes the credential into public data.
    if (JSON.stringify(body).includes(JSON.stringify(credential).slice(1, -1))) throw new BridgeError('agent_unavailable')
    return body
  }

  async function callConnectedAgent(path, command) {
    const currentGeneration = generation
    try {
      return await callAgent(key, path, command)
    } catch (error) {
      // A late failure from an old session must not disconnect a newer one.
      if (generation === currentGeneration && ['agent_unauthorized', 'agent_unavailable'].includes(error.code)) disconnect()
      throw error
    }
  }

  async function request(pathname = '', body) {
    if (pathname === '') return state()
    if (pathname === '/voice-status' && body === undefined) return { ok: true, voice: await loadVoiceStatus() }
    if (pathname === '/audit' && body === undefined) {
      requireConnection()
      return callConnectedAgent('/v1/audit')
    }

    if (pathname === '/connect') {
      if (!hasFields(body, [])) throw new BridgeError('invalid_request')
      disconnect()
      const currentGeneration = generation
      let credential
      try {
        credential = await loadKey()
        if (typeof credential !== 'string' || credential.length < 16 || !/^[\x21-\x7e]+$/.test(credential)) {
          throw new BridgeError('agent_key_missing')
        }
      } catch {
        throw new BridgeError('agent_key_missing')
      }
      if (generation !== currentGeneration) throw new BridgeError('dashboard_disconnected')
      const result = await callAgent(credential, '/v1/commands', { type: 'system.status', payload: {} })
      // Disconnect (or a newer connect) wins over an in-flight connection attempt.
      if (generation !== currentGeneration) throw new BridgeError('dashboard_disconnected')
      key = credential
      device = result.data
      return state()
    }
    if (pathname === '/disconnect') {
      if (!hasFields(body, [])) throw new BridgeError('invalid_request')
      disconnect()
      return state()
    }
    if (pathname === '/pause') {
      if (!hasFields(body, ['paused']) || typeof body.paused !== 'boolean') throw new BridgeError('invalid_request')
      // This gate affects only this dashboard, never native voice or local tool execution.
      paused = body.paused
      if (paused) pendingReview = null
      return state()
    }
    if (pathname === '/review') {
      requireConnection(true)
      if (!hasFields(body, ['command']) || !isObject(body.command)) throw new BridgeError('invalid_request')
      pendingReview = null
      const checked = validateCommand(body.command)
      if (!checked.ok) throw new BridgeError(POLICY_ERRORS.has(checked.code) ? checked.code : 'invalid_request')
      pendingReview = { id: randomUUID(), command: checked.value, expiresAt: now() + REVIEW_LIFETIME_MS }
      return { ok: true, review: pendingReview }
    }
    if (pathname === '/assistant') {
      requireConnection(true)
      if (!hasFields(body, ['text']) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) throw new BridgeError('invalid_request')
      return callConnectedAgent('/v1/assistant', {text:body.text.trim()})
    }
    if (pathname === '/run') {
      requireConnection(true)
      if (!hasFields(body, ['command']) || !isObject(body.command)) throw new BridgeError('invalid_request')
      const checked = validateCommand(body.command)
      if (!checked.ok) throw new BridgeError(POLICY_ERRORS.has(checked.code) ? checked.code : 'invalid_request')
      return callConnectedAgent('/v1/commands', checked.value)
    }
    if (pathname === '/execute') {
      requireConnection(true)
      if (!hasFields(body, ['reviewId']) || typeof body.reviewId !== 'string' || !body.reviewId) throw new BridgeError('invalid_request')
      if (!pendingReview || pendingReview.id !== body.reviewId) throw new BridgeError('invalid_review')
      const review = pendingReview
      // Consume before any await: even concurrent or failed executions cannot replay.
      pendingReview = null
      if (now() >= review.expiresAt) throw new BridgeError('review_expired')
      return callConnectedAgent('/v1/commands', review.command)
    }
    throw new BridgeError('invalid_request')
  }

  return { request }
}

export function createDashboardBridge({ port = 5173, agentPort = 27182, loadKey = loadAgentKey, fetchImpl = fetch, now = Date.now } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('A fixed TCP port is required.')
  const controller = createDashboardController({ agentPort, loadKey, fetchImpl, now })

  async function handleRequest(request, response, pathname) {
    checkRequest(request, port)
    const path = pathname.slice(PREFIX.length)
    if (request.method === 'GET' && (path === '' || path === '/audit' || path === '/voice-status')) {
      sendJson(response, 200, await controller.request(path))
      return
    }
    if (request.method !== 'POST') throw new BridgeError('invalid_request')
    const body = await readJson(request)
    sendJson(response, 200, await controller.request(path, body))
  }

  return (request, response, next) => {
    const pathname = (request.url ?? '').split('?')[0]
    if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) {
      next()
      return
    }
    // Connect does not await middleware promises; catch locally without leaking upstream errors.
    void handleRequest(request, response, pathname).catch((error) => {
      const code = error instanceof BridgeError ? error.code : 'execution_failed'
      sendJson(response, ERROR_STATUS[code] ?? 502, { ok: false, code })
    })
  }
}

export function dashboardBridgePlugin() {
  return {
    name: 'astra-dashboard-bridge',
    configureServer(server) {
      server.middlewares.use(createDashboardBridge({ port: server.config.server.port ?? 5173 }))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createDashboardBridge({ port: server.config.preview.port ?? 4173 }))
    },
  }
}
