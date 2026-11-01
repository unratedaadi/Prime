import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const home = homedir()
const source = dirname(fileURLToPath(import.meta.url))
const builtApp = join(source, '../../release', 'PRIME Wake Listener.app')
if (!existsSync(builtApp)) throw new Error('Build the listener with npm run wake:mac:build before installing.')
mkdirSync(join(home, 'Applications'), { recursive: true })
cpSync(builtApp, join(home, 'Applications', 'PRIME Wake Listener.app'), { recursive: true })
const label = 'com.aadityjain.prime-wake-listener'
const previousLabel = 'com.aadityjain.astra-wake-listener'
const appExecutable = join(home, 'Applications', 'PRIME Wake Listener.app', 'Contents', 'MacOS', 'AstraWakeListener')
const launchAgents = join(home, 'Library', 'LaunchAgents')
const plistPath = join(launchAgents, `${label}.plist`)
const logDirectory = join(home, '.prime')
mkdirSync(launchAgents, { recursive: true })
mkdirSync(logDirectory, { recursive: true, mode: 0o700 })
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${appExecutable}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(logDirectory, 'wake-listener.log')}</string>
  <key>StandardErrorPath</key><string>${join(logDirectory, 'wake-listener.log')}</string>
</dict></plist>
`
writeFileSync(plistPath, plist, { encoding: 'utf8', mode: 0o600 })
chmodSync(plistPath, 0o600)
const domain = `gui/${userInfo().uid}`
try { execFileSync('launchctl', ['bootout', domain, plistPath], { stdio: 'ignore' }) } catch {}
try { execFileSync('launchctl', ['bootout', domain, `${join(launchAgents, `${previousLabel}.plist`)}`], { stdio: 'ignore' }) } catch {}
execFileSync('launchctl', ['bootstrap', domain, plistPath])
process.stdout.write(`${plistPath}\n`)
