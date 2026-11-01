const BASE = 'http://127.0.0.1:11434'
const instructions = `You are PRIME, a concise personal Mac assistant. Answer naturally in the user's language. You run entirely locally. You have no live internet facts, screen, file or account access. Never claim you performed an action. Return JSON: {"reply":"short answer","command":null}. Only when the user requests a supported Mac action, you may instead propose {"reply":"","command":{"type":...,"payload":...}}. Supported commands: app.open {app: installed app friendly name}, app.close {app: installed app friendly name}, app.list {}, system.time {}, system.battery {}, system.status {}, system.volume {action:get|set|mute|unmute,level:0..100 if set}, media.control {app:music|spotify,action:play|pause|next|previous}, chrome.profile.list {}, chrome.profile.open {profile:name}, whatsapp.call {contact:name}. App quits and WhatsApp calls require explicit confirmation; WhatsApp also requires a uniquely matched local contact. Never propose searches, shell, code execution, file operations, account access or communications other than whatsapp.call. For unsupported tasks explain the limitation. Do not invent commands. A proposed action will be shown for confirmation; nothing has run yet.`

export async function chatLocally(text, history = [], { fetchImpl = fetch, model = process.env.PRIME_LOCAL_MODEL } = {}) {
  const tags = await fetchImpl(`${BASE}/api/tags`, {redirect:'error', signal:AbortSignal.timeout(3000)})
  if (!tags.ok) throw new Error('Local model service is unavailable.')
  const catalog = await tags.json()
  const localModels = (catalog.models ?? []).filter((item) => typeof item.name === 'string' && !item.name.includes('cloud') && !item.remote_host && !item.remote_model && item.size > 100_000_000)
  const selected = model ? localModels.find((item) => item.name === model) : localModels.sort((a,b)=>a.size-b.size)[0]
  if (!selected) throw new Error('No downloaded local model is available.')
  const request = {
    method:'POST',redirect:'error',signal:AbortSignal.timeout(50_000),headers:{'content-type':'application/json'},
    body:JSON.stringify({model:selected.name,stream:false,think:false,format:'json',keep_alive:'10m',options:{temperature:0.2,num_predict:400,num_ctx:4096},messages:[{role:'system',content:instructions},...history.slice(-8),{role:'user',content:text}]}),
  }
  let response = await fetchImpl(`${BASE}/api/chat`, request)
  if (response.status === 501) {
    const body = JSON.parse(request.body)
    delete body.format
    response = await fetchImpl(`${BASE}/api/chat`, {...request, body:JSON.stringify(body)})
  }
  if (!response.ok) throw new Error('Local model could not answer.')
  const result = await response.json()
  if (typeof result.message?.content !== 'string' || result.message.content.length > 16_000) throw new Error('Invalid local model response.')
  let answer
  try { answer = JSON.parse(result.message.content.replace(/^```(?:json)?\s*|\s*```$/g, '')) }
  catch { return {reply:result.message.content.slice(0,3000),command:null} }
  if (!answer || typeof answer !== 'object') return {reply:'Please rephrase your question.',command:null}
  return {reply: typeof answer.reply === 'string' ? answer.reply.slice(0,3000) : '',command:answer.command ?? null}
}
