import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createDashboardController } from '../agent/mac/dashboard-bridge.mjs'
import { isPrimeDesktopRequest } from './preload-api.mjs'

const source = dirname(fileURLToPath(import.meta.url))
const root = dirname(source)
const dashboardURL = pathToFileURL(join(root, 'dist', 'index.html')).href
const channel = 'prime:agent-request'
const errorCodes = new Set([
  'agent_key_missing', 'agent_unauthorized', 'agent_unavailable', 'dashboard_disconnected',
  'dashboard_paused', 'invalid_review', 'review_expired', 'execution_failed',
  'unknown_command', 'unknown_app', 'invalid_notification', 'invalid_search', 'invalid_request',
])
const controller = createDashboardController()

function requestFromEnvelope(envelope) {
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) return null
  const keys = Object.keys(envelope)
  if (!keys.every((key) => key === 'path' || key === 'body') || typeof envelope.path !== 'string') return null
  const body = Object.hasOwn(envelope, 'body') ? envelope.body : undefined
  return isPrimeDesktopRequest(envelope.path, body) ? { path: envelope.path, body } : null
}

function safeError(error) {
  const code = errorCodes.has(error?.code) ? error.code : errorCodes.has(error?.message) ? error.message : 'execution_failed'
  return { ok: false, code }
}

ipcMain.handle(channel, async (event, envelope) => {
  if (event.senderFrame.url !== dashboardURL) return { ok: false, code: 'invalid_request' }
  const request = requestFromEnvelope(envelope)
  if (!request) return { ok: false, code: 'invalid_request' }
  try {
    return await controller.request(request.path, request.body)
  } catch (error) {
    return safeError(error)
  }
})

function createWindow() {
  const window = new BrowserWindow({
    title: 'PRIME Control Center',
    minWidth: 980,
    minHeight: 680,
    width: 1360,
    height: 900,
    backgroundColor: '#060d15',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(source, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, navigationURL) => {
    if (navigationURL !== dashboardURL) event.preventDefault()
  })
  void window.loadURL(dashboardURL)
}

app.setName('PRIME Control Center')
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
