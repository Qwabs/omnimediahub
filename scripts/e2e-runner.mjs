/*
 * Phase 1 end-to-end runner.
 *
 * Launches headless Chrome with remote debugging, loads the probe page
 * (dist/_probe.html), and polls `document.title` until the probe publishes
 * its results. Writes the JSON to stdout and a screenshot to the shots dir.
 *
 * Usage: node scripts/e2e-runner.mjs [url]
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.E2E_PORT ?? 9300 + Math.floor(Math.random() * 400))
const URL_TO_TEST = process.argv[2] ?? 'http://localhost:4173/_probe.html'
const MATCH = new URL(URL_TO_TEST).pathname
const SHOT = process.argv[3] ?? join(tmpdir(), 'omh-e2e.png')
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT ?? 600_000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const profile = process.env.E2E_PROFILE ?? join(tmpdir(), 'omh-e2e-profile')
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1400,1000',
    URL_TO_TEST,
  ],
  { stdio: 'ignore' },
)

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await response.json()
      const page = targets.find((t) => t.type === 'page' && String(t.url).includes(MATCH))
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* chrome not up yet */
    }
    await sleep(500)
  }
  throw new Error('chrome did not expose the probe target')
}

const wsUrl = await findTarget()
const ws = new WebSocket(wsUrl)
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

const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  return response?.result?.result?.value
}

const started = Date.now()
let title = 'pending'
let lastStep = ''
let lastProbe = ''
let lastSnapshot = ''
let offlineApplied = false
const offlineAfterMs = Number(process.env.E2E_OFFLINE_AFTER ?? 0)

const report = async () => {
  const info = await evaluate('JSON.stringify({ step: window.__probe?.step ?? null, omh: !!window.__omh, iframes: document.querySelectorAll("iframe").length })')
  if (info && info !== lastProbe) {
    lastProbe = info
    console.error(`[probe] ${info}`)
  }
  const snapshot = await evaluate('window.__probe?.snapshot ? JSON.stringify(window.__probe.snapshot) : ""')
  if (snapshot && snapshot !== lastSnapshot) {
    lastSnapshot = snapshot
    console.error(`[snapshot] ${snapshot}`)
  }
}

while (Date.now() - started < TIMEOUT_MS) {
  title = await evaluate('document.title')
  if (typeof title === 'string' && title !== 'pending' && title.startsWith('{')) break

  // Optional: cut the network mid-run to prove service-worker offline support.
  // Either after a fixed delay (E2E_OFFLINE_AFTER) or when the probe sets
  // window.__probe.cutNetwork = true.
  if (!offlineApplied) {
    const requested = await evaluate('window.__probe?.cutNetwork === true')
    const byTime = offlineAfterMs > 0 && Date.now() - started > offlineAfterMs
    if (requested === true || byTime) {
      offlineApplied = true
      await send('Network.enable')
      const offline = await send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      })
      console.error(
        `[offline] network emulation enabled (${requested === true ? 'probe requested' : 'timer'}): ${
          offline?.error ? offline.error.message : 'ok'
        }`,
      )
    }
  }

  const stepValue = await evaluate('window.__probe?.step ?? ""')
  if (stepValue && stepValue !== lastStep) {
    lastStep = stepValue
    console.error(`[step] ${stepValue}`)
  }
  await report()
  await sleep(2000)
}

await mkdir(join(SHOT, '..'), { recursive: true }).catch(() => undefined)
const screenshot = await send('Page.captureScreenshot', { format: 'png' })
if (screenshot?.result?.data) {
  await writeFile(SHOT, Buffer.from(screenshot.result.data, 'base64'))
}

console.log(title)
ws.close()
chrome.kill()
process.exit(0)
