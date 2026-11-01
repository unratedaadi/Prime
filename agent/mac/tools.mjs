import os from 'node:os'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

import { listInstalledApps } from './app-catalog.mjs'
import { loadChromeProfiles, resolveChromeProfile } from './chrome-profiles.mjs'
import { getSystemInsight } from './system-insight.mjs'
import { getDisplays, moveWindow } from './window-manager.mjs'

import { validateCommand } from './policy.mjs'

const execFileAsync = promisify(execFileCallback)
const runExecFile = (file, args) => execFileAsync(file, args, { timeout: 10_000, maxBuffer: 256 * 1024 })
const macApps = Object.freeze({ calendar: 'Calendar', calculator: 'Calculator', contacts: 'Contacts', finder: 'Finder', mail: 'Mail', maps: 'Maps', messages: 'Messages', music: 'Music', notes: 'Notes', photos: 'Photos', reminders: 'Reminders', safari: 'Safari', spotify: 'Spotify', settings: 'System Settings', textedit: 'TextEdit', whatsapp: 'WhatsApp' })
const escapeAppleScript = (text) => text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', ' ').replaceAll('\r', ' ')
const normalizePhone = (value) => {
  const digits = String(value).replace(/[^\d+]/g, '').replace(/^\+/, '')
  return /^\d{6,15}$/.test(digits) ? digits : null
}
const contactLookupScript = (contact) => `tell application "Contacts"
  set matches to every person whose name contains "${escapeAppleScript(contact)}"
  if (count of matches) is 0 then return "NOT_FOUND"
  if (count of matches) is not 1 then return "AMBIGUOUS"
  set personRecord to item 1 of matches
  set phoneValues to value of phones of personRecord
  if (count of phoneValues) is 0 then return "NO_PHONE"
  return (name of personRecord as text) & tab & (item 1 of phoneValues as text)
end tell`
const whatsappCallScript = `tell application "WhatsApp" to activate
delay 2
tell application "System Events"
  tell process "WhatsApp"
    if exists button "Voice call" of window 1 then
      click button "Voice call" of window 1
    else if exists button "Audio call" of window 1 then
      click button "Audio call" of window 1
    else if exists button "Call" of window 1 then
      click button "Call" of window 1
    else
      error "WhatsApp voice-call control was not available"
    end if
  end tell
end tell`

export async function executeTool(command, dependencies = {}) {
  const checked = validateCommand(command)
  if (!checked.ok) return checked

  const execFile = dependencies.execFile ?? runExecFile
  const osModule = dependencies.osModule ?? os
  const { type, payload } = checked.value

  if (type === 'system.status') {
    return { ok: true, data: { hostname: osModule.hostname(), platform: osModule.platform(), release: osModule.release(), arch: osModule.arch() } }
  }

  if (type === 'app.open') {
    const appKey = payload.app.toLowerCase()
    const fixedName = Object.hasOwn(macApps, appKey) ? macApps[appKey] : null
    if (fixedName) {
      await execFile('/usr/bin/open', ['-a', fixedName])
      return { ok: true, data: { opened: payload.app } }
    }
    const catalog = await (dependencies.listInstalledApps ?? listInstalledApps)()
    const matches = catalog.filter((app) => app.name.toLowerCase() === payload.app.toLowerCase())
    if (matches.length === 0) return { ok: false, code: 'unknown_app' }
    if (matches.length > 1) return { ok: false, code: 'ambiguous_app' }
    await execFile('/usr/bin/open', ['-a', matches[0].path])
    return { ok: true, data: { opened: matches[0].name } }
  }

  if (type === 'app.list') {
    const apps = await (dependencies.listInstalledApps ?? listInstalledApps)()
    return { ok: true, data: { apps: [...new Set(apps.map((app) => app.name))] } }
  }

  if (type === 'chrome.profile.list') {
    const profiles = await (dependencies.loadChromeProfiles ?? loadChromeProfiles)()
    return { ok: true, data: { profiles: profiles.map(({ name, directory }) => `${name} (${directory})`) } }
  }

  if (type === 'chrome.profile.open') {
    const profiles = await (dependencies.loadChromeProfiles ?? loadChromeProfiles)()
    const profile = resolveChromeProfile(payload.profile, profiles)
    if (!profile) return { ok: false, code: 'unknown_chrome_profile' }
    await execFile('/usr/bin/open', ['-na', 'Google Chrome', '--args', `--profile-directory=${profile.directory}`])
    return { ok: true, data: { profile: profile.name } }
  }

  if (type === 'whatsapp.call') {
    const lookup = dependencies.queryContact
      ? await dependencies.queryContact(payload.contact)
      : (await execFile('/usr/bin/osascript', ['-e', contactLookupScript(payload.contact)])).stdout.trim()
    if (lookup === 'NOT_FOUND') return { ok: false, code: 'contact_not_found' }
    if (lookup === 'AMBIGUOUS') return { ok: false, code: 'ambiguous_contact' }
    if (lookup === 'NO_PHONE') return { ok: false, code: 'contact_has_no_phone' }
    const [name, phone] = String(lookup).split('\t')
    const normalizedPhone = normalizePhone(phone)
    if (!name || !normalizedPhone) return { ok: false, code: 'invalid_contact_phone' }
    await execFile('/usr/bin/open', [`whatsapp://send?phone=${normalizedPhone}`])
    try {
      await execFile('/usr/bin/osascript', ['-e', whatsappCallScript])
    } catch { return { ok: false, code: 'whatsapp_call_unavailable' } }
    return { ok: true, data: { contact: name.trim() } }
  }

  if (type === 'system.time') {
    const now = dependencies.now?.() ?? new Date()
    return { ok: true, data: { date: now.toLocaleDateString(), time: now.toLocaleTimeString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }
  }

  if (type === 'system.battery') {
    const { stdout } = await execFile('/usr/bin/pmset', ['-g', 'batt'])
    const percent = stdout.match(/(\d{1,3})%/)
    return { ok: true, data: { percent: percent ? Number(percent[1]) : null, charging: /;\s*(?:charging|charged)/.test(stdout), powerSource: stdout.includes('AC Power') ? 'AC' : stdout.includes('Battery Power') ? 'battery' : 'unknown' } }
  }

  if (type === 'system.memory' || type === 'system.storage') {
    return getSystemInsight(type.slice('system.'.length), { execFile })
  }

  if (type === 'display.list') return (dependencies.getDisplays ?? getDisplays)()

  if (type === 'window.move') return (dependencies.moveWindow ?? moveWindow)(payload)

  if (type === 'system.volume') {
    const change = { get: '', set: `set volume output volume ${payload.level}\n`, mute: 'set volume output muted true\n', unmute: 'set volume output muted false\n' }[payload.action]
    const script = `${change}set currentVolume to get volume settings\nreturn (output volume of currentVolume as string) & "," & (output muted of currentVolume as string)`
    const { stdout } = await execFile('/usr/bin/osascript', ['-e', script])
    const match = stdout.trim().match(/^(\d{1,3}),\s*(true|false)$/)
    if (!match || Number(match[1]) > 100) return { ok: false, code: 'execution_failed' }
    return { ok: true, data: { level: Number(match[1]), muted: match[2] === 'true' } }
  }

  if (type === 'media.control') {
    const target = payload.app === 'spotify' ? 'Spotify' : 'Music'
    const action = { play: 'play', pause: 'pause', next: 'next track', previous: 'previous track' }[payload.action]
    await execFile('/usr/bin/osascript', ['-e', `tell application "${target}" to ${action}`])
    return { ok: true, data: { app: payload.app, action: payload.action } }
  }

  if (type === 'app.close') {
    const appKey = payload.app.toLowerCase()
    let appName = Object.hasOwn(macApps, appKey) ? macApps[appKey] : null
    if (!appName) {
      const catalog = await (dependencies.listInstalledApps ?? listInstalledApps)()
      const matches = catalog.filter((app) => app.name.toLowerCase() === appKey)
      if (matches.length === 0) return { ok: false, code: 'unknown_app' }
      if (matches.length > 1) return { ok: false, code: 'ambiguous_app' }
      appName = matches[0].name
    }
    await execFile('/usr/bin/osascript', ['-e', `tell application "${escapeAppleScript(appName)}" to quit`])
    return { ok: true, data: { closed: appName } }
  }

  if (type === 'notification.send') {
    const script = `display notification "${escapeAppleScript(payload.body)}" with title "${escapeAppleScript(payload.title)}"`
    await execFile('/usr/bin/osascript', ['-e', script])
    return { ok: true, data: { delivered: true } }
  }

  if (type === 'web.search') {
    const url = payload.provider === 'youtube'
      ? `https://www.youtube.com/results?${new URLSearchParams({ search_query: payload.query })}`
      : `https://www.google.com/search?${new URLSearchParams({ q: payload.query })}`
    await execFile('/usr/bin/open', [url])
    return { ok: true, data: { searched: payload.query, provider: payload.provider } }
  }

  return { ok: false, code: 'unknown_command' }
}
