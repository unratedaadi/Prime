import test from 'node:test'
import assert from 'node:assert/strict'
import {chatLocally} from './local-model.mjs'
const catalog={models:[{name:'local:small',size:100000001}]}
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data})
test('local model supports runtimes without structured-output grammar',async()=>{
  const calls=[]
  const fetchImpl=async(url,options)=>{
    calls.push({url,options})
    if(url.endsWith('/tags'))return response(catalog)
    if(JSON.parse(options.body).format)return response({},501)
    return response({message:{content:'{"reply":"Hello","command":null}'}})
  }
  assert.deepEqual(await chatLocally('hi',[],{fetchImpl}),{reply:'Hello',command:null})
  assert.equal(calls.length,3)
  assert.ok(calls.every(c=>c.url.startsWith('http://127.0.0.1:11434/')&&c.options.redirect==='error'))
})
test('cloud models are never selected',async()=>{
  let calls=0
  await assert.rejects(()=>chatLocally('hi',[],{fetchImpl:async()=>{calls++;return response({models:[{name:'private:cloud',size:200000000},{name:'remote',size:200000000,remote_host:'ollama.com'}]})}}),/No downloaded/)
  assert.equal(calls,1)
})
test('plain text output never becomes an executable command',async()=>{
  const result=await chatLocally('hi',[],{fetchImpl:async(url)=>response(url.endsWith('/tags')?catalog:{message:{content:'I can help you think.'}})})
  assert.equal(result.command,null)
  assert.equal(result.reply,'I can help you think.')
})
