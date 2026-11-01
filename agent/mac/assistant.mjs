import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { validateCommand } from './policy.mjs'
import { executeTool } from './tools.mjs'
import { chatLocally } from './local-model.mjs'
import { runBuiltinWorkspace } from './workspaces.mjs'

export function normalizeRequest(text) {
  return text.trim().replace(/^(?:(?:hey|हे)\s+)?(?:prime|प्राइम)(?=[\s,:.!-]|$)[\s,:.!-]*/iu, '').replace(/^please\s+/i, '').replace(/[.!?]+$/, '').trim()
}

export function parseAssistantCommand(raw) {
  const text = normalizeRequest(raw)
  let match
  if (/^(?:status|(?:system|mac) status|status batao)$/i.test(text)) return {type:'system.status',payload:{}}
  if (/^(?:time|date|what time is it|what is (?:the )?time|what(?:'s| is) (?:the )?(?:time|date)(?: is it)?|today'?s date)$/i.test(text)) return {type:'system.time',payload:{}}
  if (/^(?:(?:what(?:'s| is) (?:my |the )?)?battery(?: level| status| percentage)?|how much battery(?: is left)?)$/i.test(text)) return {type:'system.battery',payload:{}}
  if (/^(?:what(?:'s| is) (?:using )?(?:my |the )?memory|memory(?: usage| status)?|what is using my memory)$/i.test(text)) return {type:'system.memory',payload:{}}
  if (/^(?:how much )?(?:storage|disk space)(?: is left| remaining| usage)?$/i.test(text)) return {type:'system.storage',payload:{}}
  if (/^(?:list|show)(?: me)? (?:my |installed |all )?apps$/i.test(text)) return {type:'app.list',payload:{}}
  if ((match=text.match(/^(?:open|start) my (work|coding) setup$/i))) return {type:'workspace.open',payload:{name:match[1].toLowerCase()}}
  if (/^(?:list|show)(?: me)? (?:my )?(?:displays|monitors|screens)$/i.test(text)) return {type:'display.list',payload:{}}
  if ((match=text.match(/^(?:move|put)\s+(.+?)\s+(?:to (?:the )?(?:external|big) (?:monitor|screen|display)|on (?:the )?(?:external|big) (?:monitor|screen|display))$/i))) return {type:'window.move',payload:{app:match[1].trim(),target:'external'}}
  if ((match=text.match(/^(?:move|put)\s+(.+?)\s+(?:to|on) (?:my )?(?:macbook|internal)(?:\s+(?:monitor|screen|display))?$/i))) return {type:'window.move',payload:{app:match[1].trim(),target:'internal'}}
  if ((match=text.match(/^(?:quit|close|exit)\s+(.+)$/i))) return {type:'app.close',payload:{app:match[1].trim()}}
  if (/^(?:list|show)(?: me)? (?:my )?chrome profiles$/i.test(text)) return {type:'chrome.profile.list',payload:{}}
  if ((match=text.match(/^(?:open|switch to|switch|use) (?:my )?(?:chrome )?profile\s+(.+)$/i))) return {type:'chrome.profile.open',payload:{profile:match[1].trim()}}
  if ((match=text.match(/^call\s+(.+?)\s+(?:on|via|using)\s+whatsapp$/i))) return {type:'whatsapp.call',payload:{contact:match[1].trim()}}
  if ((match=text.match(/^(?:open|launch|start|kholo|खोलो)\s+(.+)$/i))) return {type:'app.open',payload:{app:match[1].trim()}}
  if ((match=text.match(/^(.+?)\s+(?:kholo|खोलो)$/i))) return {type:'app.open',payload:{app:match[1].trim()}}
  if ((match=text.match(/^(?:search|look up|find)(?: (google|youtube|the web|the internet|online))?(?: for)?\s+(.+)$/i))) return {type:'web.search',payload:{provider:match[1]?.toLowerCase()==='youtube'?'youtube':'google',query:match[2]}}
  if ((match=text.match(/^google\s+(.+)$/i))) return {type:'web.search',payload:{provider:'google',query:match[1]}}
  if ((match=text.match(/^(?:what(?:'s| is) )?(?:the )?weather in\s+(.+)$/i))) return {type:'web.search',payload:{provider:'google',query:`weather in ${match[1]}`}}
  if ((match=text.match(/^(?:set |turn )?(?:the )?volume(?: to)? (\d{1,3})(?:\s*(?:percent|%))?$/i))) return {type:'system.volume',payload:{action:'set',level:Number(match[1])}}
  if (/^(?:mute|unmute)(?: (?:the )?(?:sound|volume))?$/i.test(text)) return {type:'system.volume',payload:{action:text.toLowerCase().startsWith('unmute')?'unmute':'mute'}}
  if (/^(?:get |what(?:'s| is) (?:the )?)volume$/i.test(text)) return {type:'system.volume',payload:{action:'get'}}
  if ((match=text.match(/^(play|resume|pause|next|previous)(?: (?:the )?(?:music|song|track))?(?: (?:on|in) (spotify|music))?$/i))) return {type:'media.control',payload:{app:match[2]?.toLowerCase()??'music',action:match[1].toLowerCase()==='resume'?'play':match[1].toLowerCase()}}
  return null
}

const reply = (message, kind='answer', extra={}) => ({message,kind,...extra})
const describe = (command) => `${command.type}: ${Object.entries(command.payload??{}).map(([key,value])=>`${key} ${value}`).join(', ')}`
function describeResult(command,data={}) {
  switch(command.type) {
    case 'app.open':return `Opened ${data.opened ?? command.payload.app}.`
    case 'app.close':return `Quit ${data.closed ?? command.payload.app}.`
    case 'app.list':return `Installed apps: ${(data.apps??[]).join(', ')}.`
    case 'chrome.profile.list':return data.profiles?.length ? `Chrome profiles: ${data.profiles.join(', ')}.` : 'No Chrome profiles were found on this Mac.'
    case 'chrome.profile.open':return `Opened Chrome profile ${data.profile ?? command.payload.profile}.`
    case 'whatsapp.call':return `Calling ${data.contact ?? command.payload.contact} on WhatsApp.`
    case 'system.time':return `It is ${data.time}, ${data.date}.`
    case 'system.battery':return data.percent===null?'This Mac does not report a battery.':`Battery is at ${data.percent} percent${data.charging?', charging':''}.`
    case 'system.memory':return `Memory is ${data.usedPercent} percent in use (${formatBytes(data.usedBytes)} of ${formatBytes(data.totalBytes)}).`
    case 'system.storage':return `System storage is ${data.usedPercent} percent in use (${formatBytes(data.freeBytes)} free of ${formatBytes(data.totalBytes)}).`
    case 'display.list':return data.displays?.length ? `Displays: ${data.displays.map((display)=>`${display.name} (${display.kind})`).join(', ')}.` : 'No displays were found.'
    case 'window.move':return `Moved ${data.app ?? command.payload.app} to the ${data.target ?? command.payload.target} display.`
    case 'system.volume':return `Volume is ${data.level} percent${data.muted?', muted':''}.`
    case 'media.control':return `${command.payload.app}: ${command.payload.action}.`
    case 'web.search':return `Opened ${command.payload.provider==='youtube'?'YouTube':'Google'} results for ${command.payload.query}.`
    case 'system.status':return `${data.hostname??'This Mac'} is available. ${data.platform??'macOS'} ${data.arch??''}.`
    default:return 'Completed.'
  }
}
const formatBytes = (value) => typeof value === 'number' ? `${(value / 1024 ** 3).toFixed(value >= 1024 ** 3 ? 1 : 0)} GB` : 'unknown size'
const help = 'I can have local conversations, remember facts you explicitly share, open or quit installed apps, search Google or YouTube, control Music or Spotify, adjust volume, check time and battery, list or open Chrome profiles, save local notes, and set timers. Try “remember that I prefer concise answers”, “what do you know about me?”, “open Google Chrome”, or “switch to Chrome profile Work”. I ask for confirmation before quitting an app or placing a WhatsApp call. I cannot silently read your screen, private files, accounts, messages, passwords, or delete files.'

const personalFactsFile = 'personal-facts.json'
async function readPersonalFacts(directory) {
  try {
    const facts = JSON.parse(await readFile(join(directory, personalFactsFile), 'utf8'))
    return Array.isArray(facts) ? facts.filter((fact) => typeof fact === 'string' && fact.length <= 500).slice(0, 50) : []
  } catch { return [] }
}

async function savePersonalFacts(directory, facts) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = join(directory, 'personal-facts.tmp')
  await writeFile(temporary, JSON.stringify(facts), { mode: 0o600 })
  await rename(temporary, join(directory, personalFactsFile))
}

export function createAssistant({ execute=executeTool, workspaceRunner=runBuiltinWorkspace, chat=chatLocally, now=Date.now, directory=join(homedir(),'.prime'), schedule=setTimeout }={}) {
  const sessions = new Map()
  const timers = new Map()
  let noteQueue = Promise.resolve()
  const run = async (command) => {
    const checked=validateCommand(command)
    if (!checked.ok) return reply('That action or its parameters are not supported. Say “help” for available commands.','unsupported')
    try {
      const result=await execute(checked.value)
      if (!result?.ok) return reply('I could not complete that action. Check that the app is installed and macOS has granted the required permission.','error')
      return reply(describeResult(checked.value,result.data),'action')
    } catch {return reply('macOS could not complete that action. Check the application and its permissions.','error')}
  }
  async function handle(raw, sessionId='native') {
    if (typeof raw!=='string' || !raw.trim() || raw.length>2000) return reply('Please give a command between 1 and 2000 characters.','error')
    const text=normalizeRequest(raw)
    const session=sessions.get(sessionId)??{history:[],pending:null,busy:false}
    sessions.set(sessionId,session)
    if(session.busy) return reply('I am still working on your previous request. Please wait.','busy')
    if (/^(?:cancel|no|nope|stop|never mind|nevermind)$/i.test(text)) {session.pending=null;return reply('Cancelled.','cancelled')}
    if (/^(?:yes|confirm|yes please|do it)$/i.test(text)) {
      const pending=session.pending;session.pending=null
      if(!pending)return reply('There is nothing to confirm.','confirmation')
      if(now()>=pending.expiresAt)return reply('That confirmation expired. Please repeat the command.','confirmation')
      session.busy=true
      try{return await run(pending.command)}finally{session.busy=false}
    }
    session.pending=null
    if (/^(?:forget (?:our |the )?conversation|clear conversation)$/i.test(text)) {session.history=[];return reply('Conversation memory cleared.','action')}
    if (/^(?:forget|delete|clear) (?:everything |all )?(?:you know|you remember|memory|memories|facts) about me$/i.test(text)) {
      try { await unlink(join(directory, personalFactsFile)); return reply('I deleted the personal facts you asked me to forget from this Mac.','action') }
      catch (error) { return error.code==='ENOENT' ? reply('I do not have any saved personal facts about you.','action') : reply('I could not remove those personal facts.','error') }
    }
    if (/^(?:who am i|what do you (?:know|remember) about me)\??$/i.test(text)) {
      const facts = await readPersonalFacts(directory)
      return reply(facts.length ? `Here is what you asked me to remember: ${facts.map((fact, index) => `${index + 1}. ${fact}`).join(' ')}` : 'You have not asked me to save any personal facts yet. Say “Prime, remember that …” to add one.','answer')
    }
    if (/^(?:help|what can you do|what commands|capabilities)$/i.test(text))return reply(help,'help')
    if(!text)return reply('I am listening. What would you like me to do?')
    let match
    if ((match=text.match(/^(?:set|start) (?:a )?timer(?: for)? (\d+) (seconds?|minutes?|hours?)$/i))) {
      const seconds=Number(match[1])*({s:1,m:60,h:3600}[match[2][0].toLowerCase()])
      if(seconds<1||seconds>86400)return reply('Choose a timer between 1 second and 24 hours.','error')
      const id=now()+Math.random();const endsAt=now()+seconds*1000
      const timer=schedule(()=>{timers.delete(id);void Promise.resolve(execute({type:'notification.send',payload:{title:'PRIME timer',body:`Your ${match[1]} ${match[2]} timer is complete.`}})).catch(()=>{})},seconds*1000)
      timer.unref?.();timers.set(id,{timer,endsAt})
      return reply(`Timer started for ${match[1]} ${match[2]}. It will notify you while the Mac agent is running.`,'action')
    }
    if (/^(?:cancel|stop) (?:all )?(?:the )?timers?$/i.test(text)) {for(const {timer} of timers.values())clearTimeout(timer);timers.clear();return reply('Timers cancelled.','action')}
    if (/^(?:show|list|check) (?:my |active )?timers$/i.test(text))return reply(timers.size?`Timers remaining: ${[...timers.values()].map(t=>`${Math.max(0,Math.ceil((t.endsAt-now())/1000))} seconds`).join(', ')}.`:'No active timers.')
    if ((match=text.match(/^remember(?: that)?\s+(.+)$/i))) {
      const fact=match[1].trim()
      if (fact.length > 500) return reply('Please keep a remembered fact under 500 characters.','error')
      session.busy=true
      try {
        const save = async () => {
          const facts = await readPersonalFacts(directory)
          const next = [fact, ...facts.filter((item) => item.toLocaleLowerCase() !== fact.toLocaleLowerCase())].slice(0, 50)
          await savePersonalFacts(directory, next)
        }
        noteQueue=noteQueue.then(save,save);await noteQueue
        return reply('I will remember that locally on this Mac. You can ask “what do you know about me?” or tell me to forget it.','action')
      } catch { return reply('I could not save that personal fact.','error') }
      finally { session.busy=false }
    }
    if((match=text.match(/^(?:create|save|take|make) (?:a )?note[:\s]+(.+)$/i))) {
      const content=match[1].trim()
      if(content.length>1000)return reply('Please keep each note under 1000 characters.','error')
      session.busy=true
      const save = async()=>{
        await mkdir(directory,{recursive:true,mode:0o700})
        let notes=[]
        try{notes=JSON.parse(await readFile(join(directory,'assistant-notes.json'),'utf8'));if(!Array.isArray(notes))throw new Error('Invalid notes')}
        catch(error){if(error.code!=='ENOENT')throw error}
        await writeFile(join(directory,'assistant-notes.tmp'),JSON.stringify([{at:new Date(now()).toISOString(),content},...notes].slice(0,100)),{mode:0o600})
        await rename(join(directory,'assistant-notes.tmp'),join(directory,'assistant-notes.json'))
      }
      try {noteQueue=noteQueue.then(save,save);await noteQueue;return reply('Saved your note locally on this Mac.','action')}
      catch{return reply('I could not save the note. Existing notes were left untouched.','error')}
      finally{session.busy=false}
    }
    if (/^(?:read|show|list) (?:my |local )?notes$/i.test(text)) {
      try {const notes=JSON.parse(await readFile(join(directory,'assistant-notes.json'),'utf8'));return reply(notes.length?notes.slice(0,5).map(n=>String(n.content).slice(0,1000)).join('\n'):'No local assistant notes yet.')}
      catch{return reply('No readable local assistant notes were found.')}
    }
    const command=parseAssistantCommand(text)
    if(command){
      if(command.type==='workspace.open') {
        session.busy=true
        try {
          const result=await workspaceRunner(command.payload.name, execute)
          return result.ok ? reply(`Opened your ${result.data.name} setup: ${result.data.opened.join(', ')}.`,'action') : reply(`Your ${command.payload.name} setup could not finish. Opened: ${result.data?.opened?.join(', ') || 'nothing'}.`,'error')
        } finally { session.busy=false }
      }
      if(['whatsapp.call','app.close'].includes(command.type)) {
        const checked=validateCommand(command)
        if(!checked.ok)return reply('Please say the contact name again.','unsupported')
        session.pending={command:checked.value,expiresAt:now()+30_000}
        const description = checked.value.type==='whatsapp.call' ? `Call ${checked.value.payload.contact} on WhatsApp?` : `Quit ${checked.value.payload.app}? Unsaved work may be lost.`
        return reply(`${description} Say “Prime, yes” within 30 seconds, or “Prime, cancel”.`,'confirmation',{needsConfirmation:true})
      }
      session.busy=true;try{return await run(command)}finally{session.busy=false}
    }
    if (/^(?:delete|remove|erase|send|email|message|buy|purchase|run (?:a )?(?:shell|terminal)|execute|read (?:my )?(?:files|emails|messages|passwords))/i.test(text))return reply('That capability is not connected. I can help you prepare it, but cannot execute it. Say “help” for available controls.','unsupported')
    session.busy=true
    try {
      const facts=await readPersonalFacts(directory)
      const profileContext=facts.length ? `Personal facts the user explicitly asked PRIME to remember (use only when relevant):\n${facts.slice(0,20).map((fact)=>`- ${fact}`).join('\n')}\n\nUser request: ${text}` : text
      const answer=await chat(profileContext,session.history)
      if(answer.command){
        const checked=validateCommand(answer.command)
        const allowed=['app.open','app.close','app.list','system.status','system.time','system.battery','system.memory','system.storage','system.volume','media.control','display.list','window.move','chrome.profile.list','chrome.profile.open','whatsapp.call']
        if(!checked.ok||!allowed.includes(checked.value.type))return reply('The local model suggested an unsupported action. Nothing ran. Please give a specific supported command.','unsupported')
        session.pending={command:checked.value,expiresAt:now()+30_000}
        return reply(`Confirm ${describe(checked.value)}? Say “Prime, yes” within 30 seconds, or “Prime, cancel”.`,'confirmation',{needsConfirmation:true})
      }
      const message=answer.reply?.trim()||'I could not form an answer. Please try rephrasing.'
      session.history=[...session.history,{role:'user',content:text},{role:'assistant',content:message}].slice(-8)
      return reply(message,'conversation')
    } catch{return reply('Local AI is unavailable or took too long. Start Ollama with a downloaded local model, then try again. App control and explicit web searches still work.','unavailable')}
    finally{session.busy=false}
  }
  return {handle,dispose(){for(const {timer} of timers.values())clearTimeout(timer);timers.clear();sessions.clear()}}
}
