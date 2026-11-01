import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { dashboardBridgePlugin } from './agent/mac/dashboard-bridge.mjs'

// https://vite.dev/config/
export default defineConfig({
  // The desktop app loads this bundle from a file:// URL, so assets must stay
  // relative to index.html instead of resolving from a web-server root.
  base: './',
  plugins: [react(), dashboardBridgePlugin()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
})
