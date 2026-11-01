import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import viteConfig from '../vite.config.js'

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const installerPath = fileURLToPath(new URL('./install.mjs', import.meta.url))

test('desktop package names the secure PRIME macOS app and exposes install scripts', async () => {
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(manifest.main, 'desktop/main.mjs')
  assert.equal(typeof manifest.scripts['desktop:run'], 'string')
  assert.equal(typeof manifest.scripts['desktop:package'], 'string')
  assert.equal(typeof manifest.scripts['desktop:install'], 'string')
  assert.equal(manifest.build.productName, 'PRIME Control Center')
  assert.equal(manifest.build.appId, 'com.aadityjain.prime.control-center')
  assert.deepEqual(manifest.build.mac.target, ['dir'])
})

test('desktop builds use relative asset paths for the packaged file URL', () => {
  assert.equal(viteConfig.base, './')
})

test('installer preserves relative framework symlinks inside the app bundle', async () => {
  const installer = await readFile(installerPath, 'utf8')
  assert.match(installer, /cpSync\(source, destination, \{ recursive: true, force: true, verbatimSymlinks: true \}\)/)
})

test('main process uses a sandbox-compatible CommonJS preload', async () => {
  const main = await readFile(fileURLToPath(new URL('./main.mjs', import.meta.url)), 'utf8')
  assert.match(main, /preload: join\(source, 'preload\.cjs'\)/)
})
