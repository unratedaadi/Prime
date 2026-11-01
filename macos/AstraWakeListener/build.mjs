import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = dirname(fileURLToPath(import.meta.url))
const app = join(source, '../../release', 'PRIME Wake Listener.app')
const macOS = join(app, 'Contents', 'MacOS')
const resources = join(app, 'Contents', 'Resources')
mkdirSync(macOS, { recursive: true })
mkdirSync(resources, { recursive: true })
cpSync(join(source, 'Info.plist'), join(app, 'Contents', 'Info.plist'))
execFileSync('swiftc', [join(source, 'WakePhrase.swift'), join(source, 'PrimeVoiceCommand.swift'), join(source, 'PrimeVoiceSession.swift'), join(source, 'main.swift'), '-module-cache-path', join(source, '../../release/swift-module-cache'), '-framework', 'AppKit', '-framework', 'AVFoundation', '-framework', 'Speech', '-o', join(macOS, 'AstraWakeListener')], { stdio: 'inherit' })
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app])
process.stdout.write(`${app}\n`)
