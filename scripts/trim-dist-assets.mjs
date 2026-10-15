/*
 * Cloudflare Pages rejects any single site asset above 25 MiB.
 *
 * Vite emits ONNX runtime's bundled wasm fallback into `dist/assets` whenever
 * the `new URL(..., import.meta.url)` references inside the runtime resolve at
 * build time. Those files are never fetched at runtime — `wasmPaths` points
 * the runtime at the pinned jsDelivr prefix (see `src/engine/vendor.ts`) and
 * the emitted URL only backs the "no wasmPaths" fallback branch — but they
 * would still be uploaded and rejected by Pages.
 *
 * Removes those files, reports anything else oversized (and fails the build
 * so a real regression surfaces here rather than at the Pages upload).
 */
import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const LIMIT = 25 * 1024 * 1024
const ASSETS = 'dist/assets'

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`

let removed = 0
const remaining = []

for (const name of await readdir(ASSETS)) {
  const path = join(ASSETS, name)
  const info = await stat(path)
  if (!info.isFile() || info.size <= LIMIT) continue
  if (/^ort-wasm-.*\.wasm$/.test(name)) {
    await unlink(path)
    removed += 1
    console.log(`trim: removed ${name} (${mib(info.size)}) — served from the pinned jsDelivr prefix instead`)
  } else {
    remaining.push(`${name} (${mib(info.size)})`)
  }
}

console.log(removed === 0 ? 'trim: nothing to trim' : `trim: ${removed} oversized ORT asset(s) removed`)

if (remaining.length > 0) {
  console.warn(`trim: WARNING — assets over 25 MiB remain and will fail the Cloudflare Pages upload: ${remaining.join(', ')}`)
  process.exitCode = 1
}
