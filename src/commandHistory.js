export const COMMAND_HISTORY_KEY = 'prime.command-history.v1'
const limit = 200
const localDay = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function appendCommandHistory(history, record, makeId = () => crypto.randomUUID(), now = () => new Date().toISOString()) {
  const entry = {
    id: makeId(), at: now(), transcript: record.transcript ?? '', intent: record.intent ?? '', target: record.target ?? '',
    type: record.type ?? 'other', status: record.status ?? 'error', result: record.result ?? '', confirmation: record.confirmation ?? '',
  }
  return [entry, ...history].slice(0, limit)
}

export function filterCommandHistory(history, { query = '', status = 'all', type = 'all', date = 'all', now = new Date() } = {}) {
  const needle = query.trim().toLowerCase()
  const today = localDay(now)
  return history.filter((item) => {
    const haystack = `${item.transcript} ${item.intent} ${item.target} ${item.result}`.toLowerCase()
    const day = localDay(item.at)
    return (!needle || haystack.includes(needle)) && (status === 'all' || item.status === status) && (type === 'all' || item.type === type) && (date === 'all' || (date === 'today' ? day === today : day === date))
  })
}

export function restoreCommandHistory(raw) {
  try {
    const value = JSON.parse(raw ?? '[]')
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string' && typeof item.at === 'string').slice(0, limit) : []
  } catch { return [] }
}

export function pruneCommandHistory(history, days, now = new Date()) {
  if (!Number.isInteger(days) || days <= 0) return history
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000
  return history.filter((item) => Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) >= cutoff)
}
