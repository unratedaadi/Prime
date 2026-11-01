import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { startAgent } from './server.mjs'

const KEY_FILE = 'agent-key'

export function loadOrCreateAgentKey(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const keyPath = join(directory, KEY_FILE)
  if (existsSync(keyPath)) {
    const key = readFileSync(keyPath, 'utf8').trim()
    if (/^[a-f0-9]{64}$/.test(key)) {
      chmodSync(keyPath, 0o600)
      return key
    }
    throw new Error(`Invalid Astra agent key file: ${keyPath}`)
  }
  const key = randomBytes(32).toString('hex')
  writeFileSync(keyPath, `${key}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  chmodSync(keyPath, 0o600)
  return key
}

export function startBootstrappedAgent({ directory = process.env.ASTRA_STATE_DIR ?? join(homedir(), '.astra'), port = Number(process.env.ASTRA_AGENT_PORT ?? 27182) } = {}) {
  const key = loadOrCreateAgentKey(directory)
  return startAgent({ key, port })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startBootstrappedAgent()
