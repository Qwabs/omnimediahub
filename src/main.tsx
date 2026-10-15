import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './app/App'
import { useSession } from './session/store'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)

// Prerendered pages hydrate; a bare index.html (dev) mounts fresh.
if (container.hasChildNodes()) {
  hydrateRoot(container, app)
} else {
  createRoot(container).render(app)
}

/**
 * Test/debug handle. Exposes the session store so end-to-end probes can
 * inspect results (blobs, sizes) without scraping the DOM. No data leaves
 * the device; this exists purely for testing and debugging.
 */
;(window as unknown as { __omh?: unknown }).__omh = { useSession }

// Offline support: once the service worker has precached the shell, the whole
// toolbox keeps working with no network — engines cache on first use.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onOfflineReady() {
        useSession.getState().log('ok', '[+] app shell cached — OmniMediaHub now works offline')
      },
      onNeedRefresh() {
        useSession.getState().log('info', '[ ] a new version is ready — reload to update')
      },
    })
  })
}
