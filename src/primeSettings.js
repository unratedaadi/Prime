export const PRIME_SETTINGS_KEY = 'prime.settings.v1'

export const defaultPrimeSettings = Object.freeze({
  microphoneInput: 'System default',
  wakeWordEnabled: true,
  wakePhrase: 'Hey Prime',
  pushToTalkShortcut: 'Space',
  language: 'hinglish',
  speechProvider: 'mock-local',
  ttsVoice: 'System voice',
  ttsRate: 0.95,
  ttsVolume: 0.9,
  transcriptStorage: 'local',
  autoDeleteDays: 30,
  cloudDisclosure: false,
  appearance: 'dark',
})

const options = {
  microphoneInput: new Set(['System default']),
  pushToTalkShortcut: new Set(['Space', '⌘⇧P']),
  language: new Set(['hinglish', 'english', 'hindi']),
  speechProvider: new Set(['mock-local', 'browser-speech']),
  ttsVoice: new Set(['System voice']),
  transcriptStorage: new Set(['local', 'off']),
  autoDeleteDays: new Set([0, 7, 30, 90]),
  appearance: new Set(['dark', 'light']),
}

export function applySettingsPatch(current, patch) {
  const next = { ...current }
  for (const key of Object.keys(options)) if (key in patch && options[key].has(patch[key])) next[key] = patch[key]
  if (typeof patch.wakeWordEnabled === 'boolean') next.wakeWordEnabled = patch.wakeWordEnabled
  if (typeof patch.cloudDisclosure === 'boolean') next.cloudDisclosure = patch.cloudDisclosure
  if (typeof patch.wakePhrase === 'string') next.wakePhrase = patch.wakePhrase.trim().slice(0, 40) || defaultPrimeSettings.wakePhrase
  for (const key of ['ttsRate', 'ttsVolume']) if (typeof patch[key] === 'number' && patch[key] >= 0.5 && patch[key] <= (key === 'ttsRate' ? 1.5 : 1)) next[key] = patch[key]
  return next
}

export function restorePrimeSettings(raw) {
  try { return applySettingsPatch(defaultPrimeSettings, JSON.parse(raw ?? '{}')) } catch { return defaultPrimeSettings }
}

export function shouldStoreTranscript(settings) { return settings.transcriptStorage === 'local' }
