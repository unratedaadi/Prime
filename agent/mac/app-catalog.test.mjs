import assert from 'node:assert/strict'
import test from 'node:test'

import { createApprovedAppCatalog } from './app-catalog.mjs'

test('resolves only apps explicitly approved by their friendly label', () => {
  const catalog = createApprovedAppCatalog()
  catalog.approve({ label: 'Notes', appId: 'notes' })
  assert.deepEqual(catalog.resolve('notes'), { label: 'Notes', appId: 'notes', status: 'approved' })
  assert.equal(catalog.resolve('Terminal'), null)
})

test('rejects paths, URLs, shell-looking labels, and unknown app IDs', () => {
  const catalog = createApprovedAppCatalog()
  assert.throws(() => catalog.approve({ label: '../Notes', appId: 'notes' }), /label/)
  assert.throws(() => catalog.approve({ label: 'Notes', appId: 'terminal' }), /appId/)
  assert.throws(() => catalog.approve({ label: 'https://example.com', appId: 'notes' }), /label/)
})

test('revoked apps no longer resolve', () => {
  const catalog = createApprovedAppCatalog()
  catalog.approve({ label: 'Calendar', appId: 'calendar' })
  catalog.revoke('Calendar')
  assert.equal(catalog.resolve('calendar'), null)
})

test('installed discovery excludes symlinks, bundle internals and execution utilities', async () => {
  const { mkdtemp, mkdir, symlink, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { listInstalledApps } = await import('./app-catalog.mjs')
  const directory = await mkdtemp(join(tmpdir(), 'prime-catalog-'))
  try {
    const root = join(directory, 'Applications')
    await mkdir(join(root, 'Google Chrome.app', 'Contents', 'Helper.app'), { recursive: true })
    await mkdir(join(root, 'Utilities', 'Terminal.app'), { recursive: true })
    await mkdir(join(root, 'Utilities', 'Clock.app'), { recursive: true })
    await mkdir(join(directory, 'Elsewhere.app'))
    await symlink(join(directory, 'Elsewhere.app'), join(root, 'Escape.app'))
    const apps = await listInstalledApps({ roots: [root] })
    assert.deepEqual(apps.map((app) => app.name), ['Clock', 'Google Chrome'])
    assert.ok(apps.every((app) => app.path.includes('/Applications/')))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
