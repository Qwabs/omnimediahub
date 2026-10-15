/*
 * Offline verification (Phase 8).
 *
 * Service-worker APIs are unreliable inside the iframe the other probes use,
 * so this script drives the app at the top level over CDP instead:
 *
 *   1. load the app and wait for the service worker + precache
 *   2. run a conversion online (warms the WASM engine into the runtime cache)
 *   3. cut the network with CDP
 *   4. navigate to a fresh route and run another conversion — proving
 *      "works offline after first load" with no network at all
 *
 * Usage: node scripts/e2e-offline.mjs [url]
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.E2E_PORT ?? 9419)
const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '')
const profile = process.env.E2E_PROFILE ?? join(tmpdir(), 'omh-e2e-profile')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1400,1000',
    `${BASE}/`,
  ],
  { stdio: 'ignore' },
)

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && target.url.startsWith(BASE))
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* chrome not up yet */
    }
    await sleep(500)
  }
  throw new Error('chrome did not expose the app target')
}

const ws = new WebSocket(await findTarget())
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let messageId = 0
const pending = new Map()
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
}
const send = (method, params) =>
  new Promise((resolve) => {
    const id = (messageId += 1)
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression, awaitPromise = true) => {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  })
  if (response?.result?.exceptionDetails) {
    return { error: String(response.result.exceptionDetails.exception?.description ?? '').slice(0, 300) }
  }
  return response?.result?.result?.value
}

/** Drives the app the way a user does: drop a file, press process, read the store. */
const CONVERT_SCRIPT = (colour, name) => `(async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 90
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '${colour}'
  ctx.fillRect(0, 0, 120, 90)
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
  const file = new File([blob], '${name}', { type: 'image/png' })
  const dropzone = document.querySelector('[data-testid="dropzone"]')
  if (!dropzone) return { error: 'no dropzone' }
  const transfer = new DataTransfer()
  transfer.items.add(file)
  dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  const button = await new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      const candidate = document.querySelector('[data-testid="process"]')
      if (candidate && !candidate.disabled) return resolve(candidate)
      if (Date.now() - started > 30000) return resolve(null)
      setTimeout(tick, 100)
    }
    tick()
  })
  if (!button) return { error: 'process button never enabled' }
  button.click()
  await new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      const state = window.__omh.useSession.getState()
      if (state.files.some((item) => item.result || item.error) && !state.running) return resolve()
      if (Date.now() - started > 120000) return resolve()
      setTimeout(tick, 150)
    }
    tick()
  })
  const state = window.__omh.useSession.getState()
  return {
    results: state.files.filter((item) => item.result).map((item) => ({ name: item.result.name, size: item.result.size })),
    errors: state.files.map((item) => item.error).filter(Boolean),
    logs: state.logs.slice(-3).map((line) => line.text),
  }
})()`

const results = {}

try {
  // 1. service worker + shell precache
  let shell = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    shell = await evaluate(`(async () => {
      if (!navigator.serviceWorker) return { step: 'no-sw' }
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (!registrations.some((registration) => registration.active)) return { step: 'waiting' }
      const names = await caches.keys()
      const precacheName = names.find((name) => name.includes('precache')) ?? ''
      const entries = precacheName ? await (await caches.open(precacheName)).keys() : []
      return { step: 'ready', names, entries: entries.map((request) => request.url) }
    })()`)
    if (shell?.step === 'ready') break
    await sleep(1000)
  }
  results.shell = shell?.step === 'ready'
    ? {
        cacheNames: shell.names,
        precacheEntries: shell.entries.length,
        hasShell: shell.entries.some((url) => url.endsWith('/index.html')),
        hasAppJs: shell.entries.some((url) => /\/assets\/index.*\.js$/.test(url)),
        excludesEngines: !shell.entries.some((url) => /\/wasm\/|\/ffmpeg\/|\/models\//.test(url)),
      }
    : shell

  // 2. online conversion warms the engine cache
  await send('Page.navigate', { url: `${BASE}/tools/convert/to-webp` })
  await sleep(2500)
  results.online = await evaluate(CONVERT_SCRIPT('#007aff', 'online.png'))
  const cacheState = await evaluate(`(async () => {
    const names = await caches.keys()
    const inventory = {}
    for (const name of names) {
      const keys = await (await caches.open(name)).keys()
      inventory[name] = keys.map((request) => new URL(request.url).pathname).slice(0, 12)
    }
    return { names, inventory }
  })()`)
  results.engineCache = cacheState

  // 3. cut the network
  await send('Network.enable')
  const offline = await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  })
  results.networkCut = offline?.error ? offline.error.message : 'ok'
  await sleep(500)
  results.offlineConfirmed = await evaluate(
    `fetch('/robots.txt').then(() => false, () => true)`,
  )

  // 4. navigate + convert with no network
  await send('Page.navigate', { url: `${BASE}/tools/convert/png-to-jpg` })
  await sleep(4000)
  results.offlineNavigation = await evaluate(`({
    title: document.title.slice(0, 50),
    dropzone: Boolean(document.querySelector('[data-testid="dropzone"]')),
    workspace: Boolean(document.querySelector('[data-testid="workspace"]')),
    url: location.pathname,
  })`)
  results.offline = await evaluate(CONVERT_SCRIPT('#30d158', 'offline.png'))
} catch (error) {
  results.fatal = String(error && error.stack ? error.stack : error)
}

console.log(JSON.stringify(results))
ws.close()
chrome.kill()
process.exit(0)
