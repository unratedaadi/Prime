const REQUEST_CHANNEL = 'prime:agent-request'

const isRecord = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

const hasOnly = (value, keys) => isRecord(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key))

export function isPrimeDesktopRequest(path, body) {
  if (path === '' || path === '/audit' || path === '/voice-status') return body === undefined
  if (path === '/connect' || path === '/disconnect') return hasOnly(body, [])
  if (path === '/pause') return hasOnly(body, ['paused']) && typeof body.paused === 'boolean'
  if (path === '/assistant') return hasOnly(body, ['text']) && typeof body.text === 'string' && body.text.trim().length > 0 && body.text.length <= 2000
  if (path === '/run') return hasOnly(body, ['command']) && isRecord(body.command)
  if (path === '/review') return hasOnly(body, ['command']) && isRecord(body.command)
  if (path === '/execute') return hasOnly(body, ['reviewId']) && typeof body.reviewId === 'string' && body.reviewId.length > 0
  return false
}

export function createPrimeDesktopApi(invoke) {
  return Object.freeze({
    async requestAgent(path = '', body) {
      if (typeof path !== 'string' || !isPrimeDesktopRequest(path, body)) throw new Error('invalid_request')
      return invoke(REQUEST_CHANNEL, body === undefined ? { path } : { path, body })
    },
  })
}
