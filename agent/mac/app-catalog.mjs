import { readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'

const ALLOWED_APP_IDS = new Set(['calendar', 'finder', 'notes', 'reminders'])

function normalizeLabel(value) {
  if (typeof value !== 'string') throw new TypeError('label is required')
  const label = value.trim()
  if (!/^[a-z][a-z0-9 ]{0,63}$/i.test(label)) throw new TypeError('label is invalid')
  return label
}

function validateAppId(value) {
  if (!ALLOWED_APP_IDS.has(value)) throw new TypeError('appId is not available for approval')
  return value
}

export function createApprovedAppCatalog() {
  let entries = []
  return {
    list() {
      return entries.map((entry) => ({ ...entry }))
    },
    approve({ label, appId }) {
      const approved = { label: normalizeLabel(label), appId: validateAppId(appId), status: 'approved' }
      entries = [...entries.filter((entry) => entry.label.toLowerCase() !== approved.label.toLowerCase()), approved]
      return { ...approved }
    },
    revoke(label) {
      const normalized = normalizeLabel(label).toLowerCase()
      const index = entries.findIndex((entry) => entry.label.toLowerCase() === normalized)
      if (index === -1) return null
      entries = entries.map((entry, current) => current === index ? { ...entry, status: 'revoked' } : entry)
      return { ...entries[index] }
    },
    resolve(label) {
      if (typeof label !== 'string') return null
      const normalized = label.trim().toLowerCase()
      const entry = entries.find((candidate) => candidate.label.toLowerCase() === normalized && candidate.status === 'approved')
      return entry ? { ...entry } : null
    },
  }
}


const blockedLaunchers = new Set(['terminal', 'iterm', 'iterm2', 'script editor', 'automator'])
export function isSafeAppLabel(value) {
  return typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N} ._()+-]{0,99}$/u.test(value.trim()) && !value.includes('..') && !blockedLaunchers.has(value.trim().toLowerCase())
}

// Only app bundles physically inside these roots may enter the catalog.
// No lookup by user-provided path, URL, bundle id, or shell argument is supported.
export async function listInstalledApps(dependencies = {}) {
  const readDir = dependencies.readdir ?? readdir
  const resolvePath = dependencies.realpath ?? realpath
  const roots = dependencies.roots ?? ['/Applications', '/System/Applications', join(homedir(), 'Applications')]
  const apps = []
  const visit = async (directory, root, depth) => {
    let entries
    try { entries = await readDir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (apps.length >= 1000) return
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const path = join(directory, entry.name)
      let resolved
      try { resolved = await resolvePath(path) } catch { continue }
      if (!resolved.startsWith(root + sep)) continue
      if (entry.name.endsWith('.app')) {
        const name = entry.name.slice(0, -4)
        if (isSafeAppLabel(name)) apps.push({ name, path: resolved })
      } else if (depth < 2) {
        await visit(resolved, root, depth + 1)
      }
    }
  }
  for (const directory of roots) {
    let root
    try { root = await resolvePath(directory) } catch { continue }
    await visit(root, root, 0)
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name))
}
