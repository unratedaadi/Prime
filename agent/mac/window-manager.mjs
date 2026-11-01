import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFileCallback)
const source = dirname(fileURLToPath(import.meta.url))
const defaultExecutable = join(source, '../../release/PRIME Window Manager')

async function invoke(args, { executable = defaultExecutable, execFile = execFileAsync } = {}) {
  try {
    const { stdout } = await execFile(executable, args, { timeout: 8_000, maxBuffer: 64 * 1024 })
    const result = JSON.parse(stdout)
    if (result?.ok === true && result.data && typeof result.data === 'object') return { ok: true, data: result.data }
    if (result?.ok === false && ['accessibility_permission_required', 'external_display_unavailable', 'app_not_running', 'window_unavailable'].includes(result.code)) return { ok: false, code: result.code }
  } catch {}
  return { ok: false, code: 'window_manager_unavailable' }
}

export function getDisplays(dependencies = {}) { return invoke(['displays'], dependencies) }

export function moveWindow({ app, target } = {}, dependencies = {}) {
  if (typeof app !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} ._()+-]{0,99}$/u.test(app) || !['internal', 'external'].includes(target)) return Promise.resolve({ ok: false, code: 'invalid_window_move' })
  return invoke(['move', app.trim(), target], dependencies)
}
