import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const validDirectory = (value) => value === 'Default' || /^Profile [1-9]\d*$/.test(value)
const validName = (value) => typeof value === 'string' && /^[\p{L}\p{N} ._()+-]{1,80}$/u.test(value.trim())

export function listChromeProfiles(raw) {
  try {
    const info = JSON.parse(raw)?.profile?.info_cache
    if (!info || typeof info !== 'object' || Array.isArray(info)) return []
    return Object.entries(info)
      .flatMap(([directory, value]) => validDirectory(directory) && validName(value?.name) ? [{ directory, name: value.name.trim() }] : [])
      .sort((left, right) => left.name.localeCompare(right.name))
  } catch { return [] }
}

export function resolveChromeProfile(value, profiles) {
  if (typeof value !== 'string' || !validName(value)) return null
  const target = value.trim().toLocaleLowerCase()
  const matches = profiles.filter((profile) => profile.directory.toLocaleLowerCase() === target || profile.name.toLocaleLowerCase() === target)
  return matches.length === 1 ? matches[0] : null
}

export async function loadChromeProfiles({ read = readFile, statePath = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Local State') } = {}) {
  try { return listChromeProfiles(await read(statePath, 'utf8')) } catch { return [] }
}
