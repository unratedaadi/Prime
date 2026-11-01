import assert from 'node:assert/strict'
import test from 'node:test'

import { createAuditLog } from './audit.mjs'
import { createAgentServer } from './server.mjs'

const withServer = async (options, callback) => {
  const server = createAgentServer({ key: 'test-agent-key-1234', host: '127.0.0.1', auditLog: createAuditLog(), ...options })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    return await callback(`http://127.0.0.1:${port}`, options.auditLog)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

const request = (url, path, options = {}) => fetch(`${url}${path}`, options)
const auth = { authorization: 'Bearer test-agent-key-1234', 'content-type': 'application/json' }

test('health is available without authentication', async () => {
  await withServer({}, async (url) => {
    const response = await request(url, '/health')
    assert.equal(response.status, 200)
    assert.equal((await response.json()).service, 'astra-mac-agent')
  })
})

test('missing keys are rejected and audited', async () => {
  const auditLog = createAuditLog()
  await withServer({ auditLog }, async (url) => {
    const response = await request(url, '/v1/commands', { method: 'POST', body: '{}' })
    assert.equal(response.status, 401)
    assert.equal(auditLog.list()[0].outcome, 'rejected')
    assert.equal(auditLog.list()[0].reason, 'unauthorized')
  })
})

test('an authenticated status command executes and is audited', async () => {
  const auditLog = createAuditLog()
  await withServer({ auditLog, executeTool: async () => ({ ok: true, data: { hostname: 'Test-Mac' } }) }, async (url) => {
    const response = await request(url, '/v1/commands', { method: 'POST', headers: auth, body: JSON.stringify({ type: 'system.status' }) })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data, { hostname: 'Test-Mac' })
    assert.equal(auditLog.list()[0].outcome, 'accepted')
  })
})

test('malformed and unknown commands are rejected without executor calls', async () => {
  let executions = 0
  const auditLog = createAuditLog()
  await withServer({ auditLog, executeTool: async () => { executions += 1 } }, async (url) => {
    const malformed = await request(url, '/v1/commands', { method: 'POST', headers: auth, body: '{' })
    const unknown = await request(url, '/v1/commands', { method: 'POST', headers: auth, body: JSON.stringify({ type: 'shell.run' }) })
    const audit = await request(url, '/v1/audit', { headers: auth })
    assert.equal(malformed.status, 400)
    assert.equal(unknown.status, 400)
    assert.equal(executions, 0)
    assert.equal((await audit.json()).entries.every((entry) => entry.type !== 'shell.run' || entry.outcome === 'rejected'), true)
  })
})

test('the server refuses to bind outside loopback', () => {
  assert.throws(() => createAgentServer({ key: 'test-agent-key-1234', host: '0.0.0.0' }), /loopback/)
})


test('assistant requires authentication, validates text and isolates dashboard confirmation context', async () => {
  const received=[]
  await withServer({assistant:{handle:async(text,session)=>{received.push({text,session});return {message:'Ready',kind:'answer'}}}},async(url)=>{
    assert.equal((await request(url,'/v1/assistant',{method:'POST',body:'{"text":"help"}'})).status,401)
    assert.equal((await request(url,'/v1/assistant',{method:'POST',headers:auth,body:'{"text":""}'})).status,400)
    const response=await request(url,'/v1/assistant',{method:'POST',headers:{...auth,'x-prime-client':'dashboard'},body:'{"text":"help"}'})
    assert.equal((await response.json()).data.message,'Ready')
    assert.deepEqual(received,[{text:'help',session:'dashboard'}])
  })
})
