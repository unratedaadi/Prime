import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const name = 'PRIME Control Center.app'
const source = [
  join(root, 'release', 'mac-arm64', name),
  join(root, 'release', 'mac', name),
].find(existsSync)

if (!source) throw new Error('The PRIME Control Center package was not created.')

const applications = join(homedir(), 'Applications')
const destination = join(applications, name)
mkdirSync(applications, { recursive: true })
rmSync(destination, { recursive: true, force: true })
// Frameworks inside Electron use relative symlinks. Preserve them verbatim so
// their targets remain inside the copied app, instead of pointing back to the
// build directory.
cpSync(source, destination, { recursive: true, force: true, verbatimSymlinks: true })
execFileSync('codesign', ['--force', '--deep', '--sign', '-', destination], { stdio: 'inherit' })
process.stdout.write(`${destination}\n`)
