import { isSafeAppLabel } from './app-catalog.mjs'

const ALLOWED_APPS = new Set(['calendar', 'calculator', 'contacts', 'finder', 'mail', 'maps', 'messages', 'music', 'notes', 'photos', 'reminders', 'safari', 'spotify', 'settings', 'textedit', 'whatsapp'])
const MAX_NOTIFICATION_LENGTH = 140
const MAX_SEARCH_LENGTH = 200
const MAX_CONTACT_LENGTH = 80

const validNotification = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_NOTIFICATION_LENGTH
const validSearch = (value) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_SEARCH_LENGTH
const validLabel = (value, maximum = MAX_CONTACT_LENGTH) => typeof value === 'string' && /^[\p{L}\p{N} ._()+-]+$/u.test(value.trim()) && value.trim().length <= maximum

export function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return { ok: false, code: 'invalid_command' }

  if (command.type === 'system.status') return { ok: true, value: { type: 'system.status', payload: {} } }

  if (command.type === 'app.open') {
    const app = command.payload?.app
    if (!isSafeAppLabel(app)) return { ok: false, code: 'unknown_app' }
    return { ok: true, value: { type: 'app.open', payload: { app: app.trim() } } }
  }

  if (command.type === 'app.close') {
    const app = command.payload?.app
    if (!isSafeAppLabel(app)) return { ok: false, code: 'unknown_app' }
    return { ok: true, value: { type: 'app.close', payload: { app: app.trim() } } }
  }

  if (command.type === 'display.list') return { ok: true, value: { type: command.type, payload: {} } }

  if (command.type === 'window.move') {
    const { app, target } = command.payload ?? {}
    if (!isSafeAppLabel(app) || !['internal', 'external'].includes(target)) return { ok: false, code: 'invalid_window_move' }
    return { ok: true, value: { type: command.type, payload: { app: app.trim(), target } } }
  }

  if (['app.list', 'system.time', 'system.battery', 'system.memory', 'system.storage'].includes(command.type)) return { ok: true, value: { type: command.type, payload: {} } }

  if (command.type === 'chrome.profile.list') return { ok: true, value: { type: command.type, payload: {} } }

  if (command.type === 'chrome.profile.open') {
    const profile = command.payload?.profile
    if (!validLabel(profile)) return { ok: false, code: 'invalid_chrome_profile' }
    return { ok: true, value: { type: command.type, payload: { profile: profile.trim() } } }
  }

  if (command.type === 'whatsapp.call') {
    const contact = command.payload?.contact
    if (!validLabel(contact)) return { ok: false, code: 'invalid_whatsapp_contact' }
    return { ok: true, value: { type: command.type, payload: { contact: contact.trim() } } }
  }

  if (command.type === 'system.volume') {
    const { action, level } = command.payload ?? {}
    if (!['get', 'set', 'mute', 'unmute'].includes(action) || (action === 'set' && (!Number.isInteger(level) || level < 0 || level > 100))) return { ok: false, code: 'invalid_volume' }
    return { ok: true, value: { type: command.type, payload: { action, ...(action === 'set' ? { level } : {}) } } }
  }

  if (command.type === 'media.control') {
    const { app, action } = command.payload ?? {}
    if (!['music', 'spotify'].includes(app) || !['play', 'pause', 'next', 'previous'].includes(action)) return { ok: false, code: 'invalid_media' }
    return { ok: true, value: { type: command.type, payload: { app, action } } }
  }

  if (command.type === 'notification.send') {
    const { title, body } = command.payload ?? {}
    if (!validNotification(title) || !validNotification(body)) return { ok: false, code: 'invalid_notification' }
    return { ok: true, value: { type: 'notification.send', payload: { title, body } } }
  }

  if (command.type === 'web.search') {
    const query = command.payload?.query
    if (!validSearch(query)) return { ok: false, code: 'invalid_search' }
    const provider = command.payload?.provider === 'youtube' ? 'youtube' : 'google'
    return { ok: true, value: { type: 'web.search', payload: { query: query.trim(), provider } } }
  }

  return { ok: false, code: 'unknown_command' }
}

export const toolDefinitions = Object.freeze([
  { type: 'system.status', description: 'Return basic local device metadata.' },
  { type: 'notification.send', description: 'Display a short macOS notification.' },
  { type: 'app.open', apps: [...ALLOWED_APPS], description: 'Open a known app or an installed app by friendly name from local Applications folders.' },
  { type: 'app.list', description: 'List installed app names.' },
  { type: 'system.time', description: 'Read local date and time.' },
  { type: 'system.battery', description: 'Read Mac battery and power status.' },
  { type: 'system.memory', description: 'Read local memory usage.' },
  { type: 'system.storage', description: 'Read local system-disk usage.' },
  { type: 'display.list', description: 'List local displays.' },
  { type: 'window.move', description: 'Move a running app window to the internal or external display.' },
  { type: 'system.volume', description: 'Read volume, set a level from 0 to 100, mute, or unmute.' },
  { type: 'media.control', description: 'Play, pause, next, or previous in Music or Spotify.' },
  { type: 'chrome.profile.list', description: 'List local Google Chrome profiles.' },
  { type: 'chrome.profile.open', description: 'Open a named local Google Chrome profile.' },
  { type: 'whatsapp.call', description: 'Place a WhatsApp voice call to one uniquely matched local Contact after explicit confirmation.' },
  { type: 'app.close', description: 'Quit one installed macOS app by friendly name, after explicit confirmation.' },
  { type: 'web.search', description: 'Open an explicit Google search in the default browser.' },
])
