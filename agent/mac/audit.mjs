const knownTypes = new Set(['system.status', 'notification.send', 'app.open', 'web.search'])
const redact = (command) => ({ type: knownTypes.has(command?.type) ? command.type : 'unknown' })

export function createAuditLog(limit = 100) {
  const entries = []
  return {
    record({ outcome, command, reason }) {
      const entry = { at: new Date().toISOString(), outcome, ...redact(command) }
      if (reason) entry.reason = reason
      entries.unshift(Object.freeze(entry))
      if (entries.length > limit) entries.length = limit
      return entry
    },
    list() {
      return [...entries]
    },
  }
}
