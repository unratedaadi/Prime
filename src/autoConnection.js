// Retry connection setup only. Never replay a command or undo a paused session.
export function startAutoConnection({ request, onState, onError, schedule = setInterval, unschedule = clearInterval }) {
  let active = true
  let pending = false
  async function refresh() {
    if (!active || pending) return
    pending = true
    try {
      let next = await request()
      if (!active) return
      if (!next.connected) next = await request('/connect', {})
      if (active) { onState(next); onError('') }
    } catch (error) {
      if (active) { onState({ connected: false, paused: false, device: null }); onError(error.message) }
    } finally { pending = false }
  }
  void refresh()
  const interval = schedule(refresh, 5000)
  return () => { active = false; unschedule(interval) }
}
