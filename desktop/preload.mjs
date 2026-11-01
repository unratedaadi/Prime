import { contextBridge, ipcRenderer } from 'electron'

import { createPrimeDesktopApi } from './preload-api.mjs'

contextBridge.exposeInMainWorld('primeDesktop', createPrimeDesktopApi((channel, envelope) => ipcRenderer.invoke(channel, envelope)))
