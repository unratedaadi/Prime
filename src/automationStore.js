import { parseLocalCommand } from './localAgent.js'
import { parseDashboardLocalCommand } from './localDashboardTools.js'

export function duplicateAutomation(items, id, makeId = () => crypto.randomUUID()) {
  const source = items.find((item) => item.id === id)
  return source ? [{ ...source, id: makeId(), name: `${source.name} copy`, enabled: false }, ...items] : items
}

export function toggleAutomation(items, id) {
  return items.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item)
}

export async function executeAutomation(automation, execute) {
  if (!automation.enabled) throw new Error('Routine is disabled.')
  if (!Array.isArray(automation.actions) || !automation.actions.length || automation.actions.length > 6) throw new Error('A routine needs 1 to 6 supported actions.')
  const steps = automation.actions.map((text) => {
    const command = typeof text === 'string' ? parseLocalCommand(text) ?? parseDashboardLocalCommand(text) : null
    if (!command || ['help.show', 'weather.search', 'app.close'].includes(command.type)) throw new Error(`Routine action not supported: ${text}. Use open app, search, notify, set a timer, or create a note.`)
    return { command, text }
  })
  let completed = 0
  for (const { command, text } of steps) {
    try { await execute(command, text) }
    catch (cause) { throw new Error(`Stopped after ${completed} of ${steps.length} actions. ${cause.message}`) }
    completed++
  }
  return completed
}

export function restoreAutomations(raw, fallback = []) {
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return fallback
    return value.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.trigger === 'string' && item.trigger.trim() && Array.isArray(item.actions) && item.actions.length > 0 && item.actions.length <= 6 && item.actions.every((text) => typeof text === 'string' && text.trim() && text.length <= 400)).slice(0, 100).map((item) => ({
      id: item.id.slice(0, 128), name: item.name.slice(0, 60), trigger: item.trigger.trim().slice(0, 80), enabled: item.enabled === true,
      actions: item.actions, confirmations: item.actions.filter((text) => /do not disturb|message|calendar|email|delete/i.test(text)),
    }))
  } catch { return fallback }
}
