import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistant, parseAssistantCommand } from './assistant.mjs'

test('natural commands preserve search content and remove only leading wake words', () => {
  assert.deepEqual(parseAssistantCommand('Hey Prime, please open Google Chrome'), { type:'app.open', payload:{app:'Google Chrome'} })
  assert.deepEqual(parseAssistantCommand('Prime search YouTube for prime numbers'), {type:'web.search',payload:{provider:'youtube',query:'prime numbers'}})
  assert.equal(parseAssistantCommand('tell me why the sky is blue'), null)
})

test('recognizes natural time questions as direct local commands', () => {
  for (const request of ['what time is it', 'what is the time', 'time', 'today\'s date']) {
    assert.deepEqual(parseAssistantCommand(request), { type: 'system.time', payload: {} })
  }
})

test('recognizes local memory and storage questions as direct commands', () => {
  assert.deepEqual(parseAssistantCommand('what is using my memory'), { type: 'system.memory', payload: {} })
  assert.deepEqual(parseAssistantCommand('how much storage is left'), { type: 'system.storage', payload: {} })
})

test('recognizes fixed internal and external monitor placement requests', () => {
  assert.deepEqual(parseAssistantCommand('move Chrome to the external monitor'), { type: 'window.move', payload: { app: 'Chrome', target: 'external' } })
  assert.deepEqual(parseAssistantCommand('put Notes on my MacBook'), { type: 'window.move', payload: { app: 'Notes', target: 'internal' } })
})

test('opens the named work setup through the workspace runner', async () => {
  const assistant = createAssistant({ execute: async () => assert.fail('workspace owns its sequence'), workspaceRunner: async () => ({ ok: true, data: { name: 'work', opened: ['Visual Studio Code', 'Google Chrome', 'Notes'] } }), chat: () => assert.fail('no model needed') })
  assert.match((await assistant.handle('Prime open my work setup')).message, /work setup.*Visual Studio Code/i)
})

test('requires explicit confirmation before a WhatsApp call is executed', async () => {
  const calls = []
  const assistant = createAssistant({ execute: async (command) => { calls.push(command); return { ok: true, data: { contact: command.payload.contact } } }, chat: () => assert.fail('no model needed') })
  const requested = await assistant.handle('Prime call Test Contact on WhatsApp')
  assert.equal(requested.needsConfirmation, true)
  assert.equal(calls.length, 0)
  await assistant.handle('yes')
  assert.deepEqual(calls, [{ type: 'whatsapp.call', payload: { contact: 'Test Contact' } }])
})
test('personal facts are saved locally, recalled, used in conversation, and can be deleted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prime-assistant-'))
  const prompts = []
  const assistant = createAssistant({ directory, execute: async () => assert.fail('no tool needed'), chat: async (text) => { prompts.push(text); return { reply: 'Hello.' } } })
  try {
    assert.match((await assistant.handle('Prime remember that I prefer concise answers')).message, /remember/i)
    assert.match((await assistant.handle('what do you know about me')).message, /prefer concise answers/i)
    await assistant.handle('tell me about today')
    assert.match(prompts[0], /Personal facts.*prefer concise answers/s)
    assert.match((await assistant.handle('forget everything you know about me')).message, /deleted/i)
    assert.match((await assistant.handle('what do you know about me')).message, /not asked/i)
  } finally { assistant.dispose(); await rm(directory, { recursive: true, force: true }) }
})
test('requires explicit confirmation before quitting an app', async () => {
  const calls = []
  const assistant = createAssistant({ execute: async (command) => { calls.push(command); return { ok: true, data: { closed: command.payload.app } } }, chat: () => assert.fail('no model needed') })
  const requested = await assistant.handle('Prime quit Google Chrome')
  assert.equal(requested.needsConfirmation, true)
  assert.equal(calls.length, 0)
  await assistant.handle('Prime yes')
  assert.deepEqual(calls, [{ type: 'app.close', payload: { app: 'Google Chrome' } }])
})
test('deterministic commands do not call the model', async () => {
  const assistant = createAssistant({ execute: async (command) => ({ok:true,data:{opened:command.payload.app}}), chat: () => assert.fail('no model needed') })
  const result = await assistant.handle('Prime launch Safari')
  assert.match(result.message, /Safari/)
})
test('model proposals require explicit single-use confirmation and expire', async () => {
  let now = 0; let calls = 0
  const assistant = createAssistant({ now:()=>now, execute:async()=>{calls++;return {ok:true,data:{opened:'Notes'}}}, chat:async()=>({reply:'',command:{type:'app.open',payload:{app:'notes'}}}) })
  assert.equal((await assistant.handle('bring up my writing app')).needsConfirmation,true)
  assert.equal(calls,0)
  await assistant.handle('yes'); assert.equal(calls,1)
  await assistant.handle('yes'); assert.equal(calls,1)
  await assistant.handle('bring up my writing app');now=31_000
  assert.match((await assistant.handle('yes')).message,/expired/i);assert.equal(calls,1)
})
test('model cannot request unsupported execution or silently search the internet', async () => {
  for (const command of [{type:'shell.run',payload:{command:'whoami'}},{type:'web.search',payload:{query:'private text'}}]) {
    const assistant = createAssistant({execute:()=>assert.fail('must not execute'),chat:async()=>({reply:'done',command})})
    assert.equal((await assistant.handle('help me think')).needsConfirmation,undefined)
    assert.match((await assistant.handle('yes')).message,/nothing.*confirm/i)
  }
})
test('pending actions are cancelled by another request and do not cross sessions', async () => {
  const assistant = createAssistant({execute:()=>assert.fail('must not execute'),chat:async()=>({command:{type:'app.open',payload:{app:'notes'}}})})
  await assistant.handle('writing app','native')
  assert.match((await assistant.handle('yes','dashboard')).message,/nothing.*confirm/i)
  await assistant.handle('cancel','native')
  assert.match((await assistant.handle('yes','native')).message,/nothing.*confirm/i)
})
