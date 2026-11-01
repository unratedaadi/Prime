const builtins = Object.freeze({
  work: ['Visual Studio Code', 'Google Chrome', 'Notes'],
  coding: ['Visual Studio Code', 'Google Chrome', 'Notes'],
})

export async function runBuiltinWorkspace(name, execute) {
  const normalized = typeof name === 'string' ? name.trim().toLowerCase() : ''
  const apps = builtins[normalized]
  if (!apps || typeof execute !== 'function') return { ok: false, code: 'unknown_workspace' }
  const opened = []
  for (const app of apps) {
    const result = await execute({ type: 'app.open', payload: { app } })
    if (!result?.ok) return { ok: false, code: 'workspace_failed', data: { name: normalized, opened } }
    opened.push(app)
  }
  return { ok: true, data: { name: normalized, opened } }
}
