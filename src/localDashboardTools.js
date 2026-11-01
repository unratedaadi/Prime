export function parseDashboardLocalCommand(text = '') {
  const normalized = text.trim()
  const timer = normalized.match(/^set (?:a )?timer for (\d{1,2}) minutes?$/i)
  if (timer) {
    const minutes = Number(timer[1])
    if (minutes >= 1 && minutes <= 90) return { type: 'timer.start', payload: { minutes } }
  }
  const note = normalized.match(/^create (?:a )?note:\s*(.+)$/i)
  if (note && note[1].trim().length <= 300) return { type: 'note.create', payload: { content: note[1].trim() } }
  const weather = normalized.match(/^(?:what(?:'s| is) )?the weather in\s+(.+?)\??$/i)
  if (weather && weather[1].trim().length <= 100) return { type: 'weather.search', payload: { city: weather[1].trim() } }
  if (/^(?:help|what can you do)\??$/i.test(normalized)) return { type: 'help.show', payload: {} }
  return null
}
