import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = dirname(fileURLToPath(import.meta.url))
const output = join(source, '../../release/PRIME Window Manager')
mkdirSync(dirname(output), { recursive: true })
execFileSync('swiftc', [join(source, 'PrimeWindowManager.swift'), '-framework', 'AppKit', '-framework', 'ApplicationServices', '-o', output], { stdio: 'inherit' })
process.stdout.write(`${output}\n`)
