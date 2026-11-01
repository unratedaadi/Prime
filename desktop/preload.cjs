const { contextBridge, ipcRenderer } = require('electron')

// Sandboxed Electron preloads cannot import another file. Keep this deliberately
// small, and enforce the same narrow request contract again in the main process.
const REQUEST_CHANNEL = 'prime:agent-request'

const isRecord = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  // Arguments crossing Electron's isolated worlds have a different Object
  // prototype, so use the cross-realm plain-object tag here. The main process
  // repeats stricter validation after IPC serialization.
  && Object.prototype.toString.call(value) === '[object Object]'

const hasOnly = (value, keys) => isRecord(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key))

function isPrimeDesktopRequest(path, body) {
  if (path === '' || path === '/audit' || path === '/voice-status') return body === undefined
  if (path === '/connect' || path === '/disconnect') return hasOnly(body, [])
  if (path === '/pause') return hasOnly(body, ['paused']) && typeof body.paused === 'boolean'
  if (path === '/assistant') return hasOnly(body, ['text']) && typeof body.text === 'string' && body.text.trim().length > 0 && body.text.length <= 2000
  if (path === '/run') return hasOnly(body, ['command']) && isRecord(body.command)
  if (path === '/review') return hasOnly(body, ['command']) && isRecord(body.command)
  if (path === '/execute') return hasOnly(body, ['reviewId']) && typeof body.reviewId === 'string' && body.reviewId.length > 0
  return false
}

contextBridge.exposeInMainWorld('primeDesktop', Object.freeze({
  async requestAgent(path = '', body) {
    if (typeof path !== 'string' || !isPrimeDesktopRequest(path, body)) throw new Error('invalid_request')
    return ipcRenderer.invoke(REQUEST_CHANNEL, body === undefined ? { path } : { path, body })
  },
}))
