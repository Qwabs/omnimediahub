/*
 * Copy engine assets from node_modules into public/ so they are served
 * same-origin. Required for COEP (require-corp) and for offline caching.
 *
 * Runs automatically via `predev` / `prebuild`; skips files whose size and
 * mtime already match.
 */
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const COPIES = [
  // libvips (wasm-vips) — image engine. Keep the original file name: the
  // pthread workers are spawned with a hardcoded `vips-es6.js` URL.
  ['node_modules/wasm-vips/lib/vips-es6.js', 'public/wasm/vips-es6.js'],
  ['node_modules/wasm-vips/lib/vips.wasm', 'public/wasm/vips.wasm'],
  ['node_modules/wasm-vips/lib/vips-heif.wasm', 'public/wasm/vips-heif.wasm'],
  ['node_modules/wasm-vips/lib/vips-resvg.wasm', 'public/wasm/vips-resvg.wasm'],
  // ONNX runtime (transformers.js): NOT copied — the runtime loads all of its
  // builds from a pinned jsDelivr prefix; several exceed Cloudflare Pages'
  // 25 MiB per-file limit (see src/engine/vendor.ts).
  // FFmpeg core — video engine. The core wasm is NOT copied either: at ~31 MB
  // it exceeds the same limit and is served from a pinned jsDelivr URL.
  ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', 'public/ffmpeg/ffmpeg-core.js'],
  // FFmpeg wrapper worker (spawned by @ffmpeg/ffmpeg with an explicit URL)
  ['node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js', 'public/ffmpeg/ffmpeg-worker.js'],
  ['node_modules/@ffmpeg/ffmpeg/dist/esm/const.js', 'public/ffmpeg/const.js'],
  ['node_modules/@ffmpeg/ffmpeg/dist/esm/errors.js', 'public/ffmpeg/errors.js'],
  ['node_modules/@ffmpeg/ffmpeg/dist/esm/utils.js', 'public/ffmpeg/utils.js'],
  ['node_modules/@ffmpeg/ffmpeg/dist/esm/types.js', 'public/ffmpeg/types.js'],
]

let copied = 0
let skipped = 0

for (const [from, to] of COPIES) {
  const src = join(root, from)
  const dest = join(root, to)
  try {
    const [srcStat, destStat] = await Promise.all([stat(src), stat(dest).catch(() => null)])
    if (destStat && destStat.size === srcStat.size && destStat.mtimeMs >= srcStat.mtimeMs) {
      skipped += 1
      continue
    }
    await mkdir(dirname(dest), { recursive: true })
    await copyFile(src, dest)
    copied += 1
  } catch (error) {
    console.error(`vendor assets: failed to copy ${from} → ${to}: ${error.message}`)
    process.exitCode = 1
  }
}

console.log(`vendor assets: ${copied} copied, ${skipped} up to date`)

