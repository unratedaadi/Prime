const safeApps = new Set(['calculator', 'calendar', 'contacts', 'finder', 'mail', 'maps', 'messages', 'music', 'notes', 'photos', 'reminders', 'safari', 'spotify', 'settings', 'textedit', 'whatsapp'])

function result(rawTranscript, category, action, parameters, riskLevel, confidence = 0.98) {
  return { id: crypto.randomUUID(), rawTranscript, normalizedText: rawTranscript.trim().toLowerCase(), category, action, parameters, riskLevel, confidence }
}

export function parseIntent(rawTranscript = '') {
  const text = rawTranscript.trim()
  const normalized = text.toLowerCase()
  if (/\b(?:rm\b|terminal|shell|delete|erase|format)\b/.test(normalized)) return result(text, 'system', 'blocked', {}, 'blocked', 0.99)
  if (/\b(?:send|text|message|email|post|buy|purchase|pay)\b/.test(normalized)) return result(text, 'system', 'requires-confirmation', {}, 'confirm', 0.9)
  const app = normalized.match(/^open\s+(.+)$/)
  if (app && safeApps.has(app[1].replace('system ', ''))) return result(text, 'app', 'open', { app: app[1].replace('system ', '') }, 'safe')
  const google = normalized.match(/^search\s+(?:google\s+)?for\s+(.+)$/)
  if (google) return result(text, 'search', 'google-search', { query: google[1] }, 'safe')
  if (/^(?:help|what can you do)\??$/.test(normalized)) return result(text, 'system', 'help', {}, 'safe')
  if (/^status$/.test(normalized)) return result(text, 'system', 'status', {}, 'safe')
  return result(text, 'system', 'unknown', {}, 'blocked', 0)
}
