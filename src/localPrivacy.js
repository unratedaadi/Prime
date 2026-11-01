export const PRIME_LOCAL_KEYS = Object.freeze([
  'prime.mac-dashboard.v2', 'prime.command-history.v1', 'prime.automations.v1',
  'prime.settings.v1', 'prime.integration-consent.v1', 'prime.onboarding.v1',
  'prime.local-notes.v1',
])

export function clearPrimeLocalData(storage) {
  for (const key of PRIME_LOCAL_KEYS) storage.removeItem(key)
}
