import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

import { createAssistant } from './assistant.mjs'
import { createAuditLog } from './audit.mjs'
import { toolDefinitions, validateCommand } from './policy.mjs'
import { executeTool as defaultExecuteTool } from './tools.mjs'

const LOOPBACK_HOST = '127.0.0.1'
const MAX_BODY_BYTES = 16 * 1024

const sendJson = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

const isAuthorized = (request, key) => request.headers.authorization === `Bearer ${key}`

const readJson = (request) => new Promise((resolve, reject) => {
  let raw = ''
  let bytes = 0
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    bytes += Buffer.byteLength(chunk)
    if (bytes > MAX_BODY_BYTES) {
      reject(new Error('body_too_large'))
      request.destroy()
      return
    }
    raw += chunk
  })
  request.on('end', () => {
    try {
      resolve(JSON.parse(raw))
    } catch {
      reject(new Error('invalid_json'))
    }
  })
  request.on('error', reject)
})

export function createAgentServer({ key, host = LOOPBACK_HOST, auditLog = createAuditLog(), executeTool = defaultExecuteTool, assistant: providedAssistant } = {}) {
  if (host !== LOOPBACK_HOST) throw new Error('Agent host must be loopback-only (127.0.0.1).')
  if (typeof key !== 'string' || key.length < 16) throw new Error('A 16-character-or-longer ASTRA_AGENT_KEY is required.')

  const assistant = providedAssistant ?? createAssistant({ execute: executeTool })
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true, service: 'astra-mac-agent', host: LOOPBACK_HOST })
      return
    }

    if (!isAuthorized(request, key)) {
      auditLog.record({ outcome: 'rejected', reason: 'unauthorized' })
      sendJson(response, 401, { ok: false, code: 'unauthorized' })
      return
    }

    if (request.method === 'GET' && request.url === '/v1/tools') {
      sendJson(response, 200, { ok: true, tools: toolDefinitions })
      return
    }

    if (request.method === 'GET' && request.url === '/v1/audit') {
      sendJson(response, 200, { ok: true, entries: auditLog.list() })
      return
    }

    if (request.method === 'POST' && request.url === '/v1/assistant') {
      try {
        const body = await readJson(request)
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) {
          sendJson(response, 400, {ok:false,code:'invalid_request'})
          return
        }
        const session = request.headers['x-prime-client'] === 'dashboard' ? 'dashboard' : 'native'
        const data = await assistant.handle(body.text, session)
        auditLog.record({outcome: data.kind === 'error' ? 'rejected' : 'accepted', reason: `assistant_${data.kind}`})
        sendJson(response, 200, {ok:true,data})
      } catch { sendJson(response, 400, {ok:false,code:'invalid_request'}) }
      return
    }

    if (request.method === 'POST' && pathname === '/v1/commands') {
      let incoming
      try {
        incoming = await readJson(request)
      } catch (error) {
        auditLog.record({ outcome: 'rejected', reason: error.message })
        sendJson(response, 400, { ok: false, code: error.message })
        return
      }

      const checked = validateCommand(incoming)
      if (!checked.ok) {
        auditLog.record({ outcome: 'rejected', command: incoming, reason: checked.code })
        sendJson(response, 400, checked)
        return
      }

      try {
        const result = await executeTool(checked.value)
        auditLog.record({ outcome: result.ok ? 'accepted' : 'rejected', command: checked.value, reason: result.code })
        sendJson(response, result.ok ? 200 : 400, result)
      } catch {
        auditLog.record({ outcome: 'rejected', command: checked.value, reason: 'execution_failed' })
        sendJson(response, 500, { ok: false, code: 'execution_failed' })
      }
      return
    }

    sendJson(response, 404, { ok: false, code: 'not_found' })
  })
  server.on('close', () => assistant.dispose?.())
  return server
}

export function startAgent({ key = process.env.ASTRA_AGENT_KEY, port = Number(process.env.ASTRA_AGENT_PORT ?? 27182) } = {}) {
  const server = createAgentServer({ key })
  server.listen(port, LOOPBACK_HOST, () => {
    process.stdout.write(`Astra Mac agent listening on http://${LOOPBACK_HOST}:${port}\n`)
  })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startAgent()
