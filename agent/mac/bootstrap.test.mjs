import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { loadOrCreateAgentKey } from './bootstrap.mjs'

test('creates and reuses an owner-only Mac agent key', () => {
  const directory = mkdtempSync(join(tmpdir(), 'astra-bootstrap-'))
  try {
    const first = loadOrCreateAgentKey(directory)
    const second = loadOrCreateAgentKey(directory)
    const keyPath = join(directory, 'agent-key')

    assert.match(first, /^[a-f0-9]{64}$/)
    assert.equal(second, first)
    assert.equal(readFileSync(keyPath, 'utf8').trim(), first)
    assert.equal(statSync(keyPath).mode & 0o777, 0o600)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
