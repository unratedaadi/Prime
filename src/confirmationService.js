export function createPendingConfirmation(intent, now = Date.now()) {
  return { intent, requestedAt: now, expiresAt: now + 30_000 }
}

export function isConfirmationActive(pending, now = Date.now()) {
  return Boolean(pending && now <= pending.expiresAt)
}
