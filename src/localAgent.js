const errorMessages = {
  bridge_forbidden: 'Open this dashboard on localhost or 127.0.0.1. Remote access is not enabled.',
  agent_key_missing: 'The Mac agent is not set up. Start it with npm run agent:mac in the PRIME project folder, then connect again.',
  agent_unauthorized: 'The local agent key was rejected. Check that the dashboard and agent use the same ASTRA_STATE_DIR.',
  agent_unavailable: 'The Mac agent could not be reached. Start it with npm run agent:mac, then connect again.',
  dashboard_disconnected: 'Connect the local Mac agent first.',
  dashboard_paused: 'Dashboard commands are paused. Resume before reviewing a command.',
  invalid_review: 'This review is no longer valid. Review the command again.',
  review_expired: 'The 60-second review expired. Review the command again.',
  unknown_command: 'That command is not supported. Try status, open Safari, search Google for a topic, or notify followed by a short message.',
  unknown_app: 'That Mac app is not in PRIME’s approved app list.',
  invalid_notification: 'Use a notification message of 1 to 140 characters.',
  invalid_search: 'Use a Google search between 1 and 200 characters.',
  local_model_unavailable: 'Local conversation is unavailable. Start Ollama with a downloaded model on this Mac. App control and explicit web searches still work.',
  invalid_request: 'Use a request between 1 and 2,000 characters.',
  execution_failed: 'The agent could not finish this action. Check the agent log before trying again.',
}

export async function requestAgent(path = '', body) {
  const desktopRequest = globalThis.window?.primeDesktop?.requestAgent
  if (typeof desktopRequest === 'function') {
    let result
    try {
      result = await desktopRequest(path, body)
    } catch {
      throw new Error('The PRIME desktop bridge did not respond. If you confirmed an action, check its result before retrying.')
    }
    if (!result?.ok) {
      const error = new Error(errorMessages[result?.code] ?? 'The request was rejected. No automatic retry will be made.')
      error.code = result?.code
      throw error
    }
    return result
  }

  let response
  try {
    response = await fetch(`/api/local-agent${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Astra-Dashboard': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(path === '/assistant' ? 65000 : 15000),
    })
  } catch {
    throw new Error('The local dashboard server did not respond. If you confirmed an action, check its result before retrying.')
  }
  let result
  try { result = await response.json() } catch { throw new Error('The local dashboard bridge is unavailable. Run npm run dev or npm run preview; static hosting cannot control your Mac.') }
  if (!response.ok || !result.ok) {
    const error = new Error(errorMessages[result.code] ?? 'The request was rejected. No automatic retry will be made.')
    error.code = result.code
    throw error
  }
  return result
}

export function parseLocalCommand(text) {
  const normalized = text.trim()
  if (/^(?:status|system status|mac status)$/i.test(normalized)) return { type: 'system.status', payload: {} }
  const app = normalized.match(/^open\s+(calculator|calendar|contacts|finder|mail|maps|messages|music|notes|photos|reminders|safari|spotify|settings|system settings|textedit|whatsapp)$/i)
  if (app) return { type: 'app.open', payload: { app: app[1].toLowerCase() === 'system settings' ? 'settings' : app[1].toLowerCase() } }
  const closeApp = normalized.match(/^close\s+(calculator|calendar|contacts|finder|mail|maps|messages|music|notes|photos|reminders|safari|spotify|settings|system settings|textedit|whatsapp)$/i)
  if (closeApp) return { type: 'app.close', payload: { app: closeApp[1].toLowerCase() === 'system settings' ? 'settings' : closeApp[1].toLowerCase() } }
  const youtube = normalized.match(/^search\s+youtube\s+for\s+(.+)$/i)
  if (youtube && youtube[1].trim().length <= 200) return { type: 'web.search', payload: { query: youtube[1].trim(), provider: 'youtube' } }
  const search = normalized.match(/^search\s+(?:google\s+)?for\s+(.+)$/i)
  if (search && search[1].trim().length <= 200) return { type: 'web.search', payload: { query: search[1].trim() } }
  const notification = normalized.match(/^notify\s+([\s\S]+)$/i)
  if (notification && notification[1].trim().length <= 140) return { type: 'notification.send', payload: { title: 'PRIME', body: notification[1].trim() } }
  return null
}

export function describeCommand(command) {
  if (command.type === 'app.open') return `Open ${command.payload.app[0].toUpperCase()}${command.payload.app.slice(1)}`
  if (command.type === 'app.close') return `Close ${command.payload.app[0].toUpperCase()}${command.payload.app.slice(1)}`
  if (command.type === 'notification.send') return 'Display a notification'
  if (command.type === 'web.search') return `Search ${command.payload.provider === 'youtube' ? 'YouTube' : 'Google'} for “${command.payload.query}”`
  return 'Read system status'
}

export function describeResult(command, data) {
  if (command.type === 'app.open') return `The agent reports that ${data.opened} opened on this Mac.`
  if (command.type === 'app.close') return `The agent reports that ${data.closed} quit on this Mac.`
  if (command.type === 'notification.send') return 'macOS accepted the notification request. Visibility depends on your notification settings.'
  if (command.type === 'web.search') return `Opened a ${data.provider === 'youtube' ? 'YouTube' : 'Google'} search for “${data.searched}” in your default browser.`
  return `${data.hostname} · ${data.platform} ${data.release} · ${data.arch}`
}


export function normalizeAssistantInput(text = '') {
  return text.trim().replace(/^(?:hey\s+prime|prime|हे\s+प्राइम|प्राइम)(?=\s|[,:!?.]|$)[\s,:!?.]*/i, '').trim()
}

export async function requestAssistant(text) {
  const normalized = normalizeAssistantInput(text)
  if (!normalized || normalized.length > 2000) throw new Error('Use a request between 1 and 2,000 characters.')
  const { data } = await requestAgent('/assistant', { text: normalized })
  if (!data || typeof data.message !== 'string' || !data.message.trim() || data.message.length > 12000 || typeof data.kind !== 'string') {
    throw new Error('PRIME did not receive a valid reply. Check the local agent before retrying an action.')
  }
  return data
}
