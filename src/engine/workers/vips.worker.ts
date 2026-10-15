/*
 * libvips (wasm-vips) image engine worker.
 *
 * Loaded lazily: `vips.wasm` (~5MB) is fetched once and cached by the HTTP
 * cache / service worker. HEIF (HEIC/AVIF) and SVG support arrive through
 * dynamic libraries, also same-origin.
 *
 * Ops: convert · resize · rotate · flip
 */
import {
  FALLBACK_QUALITY,
  MIN_SCALE,
  PROBE_QUALITY,
  nextScale,
  searchQuality,
} from './compress-search'
import { setJpegDpi } from '../dpi'
import type { WorkerRequest, WorkerResponse } from '../types'

const worker = globalThis as unknown as {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

/* ---------------------------------------------------------------- */
/* wasm-vips surface (structural typing — only what we use)          */
/* ---------------------------------------------------------------- */

type VipsImage = {
  width: number
  height: number
  bands: number
  get(name: string): unknown
  delete(): void
  resize(scale: number, opts?: { vscale?: number }): VipsImage
  thumbnailImage(
    width: number,
    opts?: { height?: number; size?: string; crop?: string },
  ): VipsImage
  crop(left: number, top: number, width: number, height: number): VipsImage
  embed(
    x: number,
    y: number,
    width: number,
    height: number,
    opts?: { extend?: string; background?: number[] },
  ): VipsImage
  rot90(): VipsImage
  rot180(): VipsImage
  rot270(): VipsImage
  fliphor(): VipsImage
  flipver(): VipsImage
  extractBand(band: number, opts?: { n?: number }): VipsImage
  linear(a: number | number[], b: number | number[]): VipsImage
  insert(sub: VipsImage, x: number, y: number): VipsImage
  bandjoin(other: VipsImage | VipsImage[]): VipsImage
  drawCircle(
    ink: number[],
    cx: number,
    cy: number,
    radius: number,
    opts?: { fill?: boolean },
  ): VipsImage
  writeToBuffer(suffix: string, opts?: Record<string, unknown>): Uint8Array
}

type VipsModule = {
  Image: {
    newFromBuffer(buffer: Uint8Array, opts?: Record<string, unknown>): VipsImage
    black(
      width: number,
      height: number,
      opts?: { bands?: number },
    ): VipsImage
  }
}

type VipsFactory = (options: {
  /** Optional: when omitted the glue resolves files relative to its own URL. */
  locateFile?: (path: string) => string
  dynamicLibraries: string[]
}) => Promise<VipsModule>

let vipsPromise: Promise<VipsModule> | null = null

function loadVips(): Promise<VipsModule> {
  if (!vipsPromise) {
    vipsPromise = (async () => {
      progress(0, 'loading libvips wasm')
      // Served from public/wasm (copied from node_modules). No locateFile:
      // the Emscripten glue resolves the wasm and its dynamic libraries
      // relative to import.meta.url — i.e. /wasm/ — which is exactly where
      // they live. The pthread workers it spawns also live there.
      const moduleUrl = '/wasm/vips-es6.js'
      const mod = (await import(/* @vite-ignore */ moduleUrl)) as { default: VipsFactory }
      const vips = await mod.default({
        dynamicLibraries: ['vips-heif.wasm', 'vips-resvg.wasm'],
      })
      return vips
    })().catch((error) => {
      vipsPromise = null
      throw error
    })
  }
  return vipsPromise
}

/* ---------------------------------------------------------------- */
/* helpers                                                           */
/* ---------------------------------------------------------------- */

const FORMATS: Record<string, { suffix: string; type: string }> = {
  jpg: { suffix: '.jpg', type: 'image/jpeg' },
  jpeg: { suffix: '.jpg', type: 'image/jpeg' },
  png: { suffix: '.png', type: 'image/png' },
  webp: { suffix: '.webp', type: 'image/webp' },
  avif: { suffix: '.avif', type: 'image/avif' },
  gif: { suffix: '.gif', type: 'image/gif' },
  tiff: { suffix: '.tif', type: 'image/tiff' },
  bmp: { suffix: '.bmp', type: 'image/bmp' },
}

/**
 * When a tool keeps the input format ('auto'), derive the output from the
 * file extension. libvips metadata is not reachable through wasm-vips'
 * public API, and the extension is what the user actually cares about.
 */
const FORMAT_BY_EXTENSION: Record<string, string> = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  heic: 'jpg',
  heif: 'jpg',
  gif: 'png',
  bmp: 'png',
  tif: 'png',
  tiff: 'png',
  svg: 'png',
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : ''
}

function outputFormat(inputName: string, params: Record<string, unknown>): string {
  const requested = typeof params.format === 'string' ? params.format.toLowerCase() : 'auto'
  if (requested !== 'auto') return requested
  return FORMAT_BY_EXTENSION[extensionOf(inputName)] ?? 'jpg'
}

const hexToRgb = (hex: string): number[] => {
  const value = hex.replace('#', '').trim()
  if (value.length !== 6) return [255, 255, 255]
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'output'
}

function saveOptions(format: string, params: Record<string, unknown>): Record<string, unknown> {
  const quality = typeof params.quality === 'number' ? params.quality : undefined
  const keepMetadata = params.keepMetadata !== false
  const background = typeof params.background === 'string' ? hexToRgb(params.background) : undefined
  // `strip: true` drops metadata; undefined keeps it (the default).
  const strip = keepMetadata ? undefined : true

  switch (format) {
    case 'jpg':
      return { Q: quality ?? 90, background, strip }
    case 'webp': {
      const lossless = params.lossless === true
      return { Q: quality ?? 82, lossless, strip }
    }
    case 'avif': {
      const effort = params.effort ? Number(params.effort) : 6
      return { Q: quality ?? 60, effort: Math.max(0, Math.min(9, effort)), strip }
    }
    case 'png':
      return { compression: 6, effort: 7, strip }
    default:
      return { Q: quality ?? 90, strip }
  }
}

/** WebAssembly.Exception-style errors carry `.message` but are not `Error` instances. */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return String(error)
}

function encode(
  image: VipsImage,
  params: Record<string, unknown>,
  format: string,
): { bytes: Uint8Array; type: string; format: string } {
  const spec = FORMATS[format] ?? FORMATS.jpg
  const options = saveOptions(format, params)
  let bytes: Uint8Array
  try {
    bytes = image.writeToBuffer(spec.suffix, options)
  } catch (error) {
    // Some encoder/input combinations can fail (e.g. 16-bit or exotic colour
    // spaces). Fall back to high-quality JPEG rather than failing the job.
    if (format === 'jpg') throw error
    bytes = image.writeToBuffer('.jpg', {
      Q: 90,
      strip: options.strip,
      background: options.background,
    })
    return { bytes, type: 'image/jpeg', format: 'jpg' }
  }
  return { bytes, type: spec.type, format }
}

function numberParam(params: Record<string, unknown>, key: string, fallback = 0): number {
  const direct = Number(params[key])
  if (Number.isFinite(direct) && params[key] !== undefined && params[key] !== null && params[key] !== '') {
    return direct
  }
  const nested = params.size as { width?: number; height?: number } | undefined
  const value = nested?.[key as 'width' | 'height']
  const num = Number(value)
  return Number.isFinite(num) && value !== undefined ? num : fallback
}

function fitResize(image: VipsImage, params: Record<string, unknown>): VipsImage {
  const mode = String(params.mode ?? 'dimensions')
  // Opt-in via the "never enlarge" toggle; exact-size presets upscale freely.
  const neverUpscale = params.neverUpscale === true

  if (mode === 'percent') {
    const percent = Math.max(1, numberParam(params, 'percent', 100))
    return image.resize(percent / 100)
  }

  if (mode === 'longest') {
    const longest = Math.max(8, Math.round(numberParam(params, 'longest', 1920)))
    const scale = longest / Math.max(image.width, image.height)
    const applied = neverUpscale ? Math.min(1, scale) : scale
    return image.resize(applied)
  }

  const width = Math.max(0, Math.round(numberParam(params, 'width', 0)))
  const height = Math.max(0, Math.round(numberParam(params, 'height', 0)))
  if (width === 0 || height === 0) return image

  const fit = String(params.fit ?? 'cover')
  const background = hexToRgb(typeof params.padColor === 'string' ? params.padColor : '#ffffff')
  const clamp = (scale: number) => (neverUpscale ? Math.min(1, scale) : scale)

  if (fit === 'contain') {
    const scale = clamp(Math.min(width / image.width, height / image.height))
    const scaled = image.resize(scale)
    const left = Math.max(0, Math.round((width - scaled.width) / 2))
    const top = Math.max(0, Math.round((height - scaled.height) / 2))
    return scaled.embed(left, top, width, height, { extend: 'background', background })
  }

  if (fit === 'inside') {
    return image.resize(clamp(Math.min(width / image.width, height / image.height)))
  }

  if (fit === 'stretch') {
    return image.resize(width / image.width, { vscale: height / image.height })
  }

  // cover — resize up to fill, then crop the centre
  const scale = clamp(Math.max(width / image.width, height / image.height))
  const scaled = image.resize(scale)
  const left = Math.max(0, Math.round((scaled.width - width) / 2))
  const top = Math.max(0, Math.round((scaled.height - height) / 2))
  const cropWidth = Math.min(width, Math.max(1, scaled.width - left))
  const cropHeight = Math.min(height, Math.max(1, scaled.height - top))
  return scaled.crop(left, top, cropWidth, cropHeight)
}

/* ---------------------------------------------------------------- */
/* ops                                                               */
/* ---------------------------------------------------------------- */

/** Passport / ID standards in millimetres or inches. */
const STANDARD_SIZES: Record<string, { mm?: [number, number]; inch?: [number, number] }> = {
  '35x45': { mm: [35, 45] },
  '33x48': { mm: [33, 48] },
  '2x2': { inch: [2, 2] },
}

const sizeInPixels = (standard: string, dpi: number): { width: number; height: number } => {
  const spec = STANDARD_SIZES[standard] ?? STANDARD_SIZES['35x45']
  const [w, h] = spec.mm ?? [0, 0]
  const [wi, hi] = spec.inch ?? [0, 0]
  const width = spec.mm ? (w / 25.4) * dpi : wi * dpi
  const height = spec.mm ? (h / 25.4) * dpi : hi * dpi
  return { width: Math.round(width), height: Math.round(height) }
}

/** Largest crop of `image` matching an `a:b` ratio, anchored vertically. */
function cropToRatio(image: VipsImage, ratio: string, anchor: string): VipsImage {
  if (ratio === 'free') return image
  const [rw, rh] = ratio.split(':').map(Number)
  if (!rw || !rh) return image
  const target = rw / rh
  const current = image.width / image.height
  let width: number
  let height: number
  if (current > target) {
    height = image.height
    width = Math.round(height * target)
  } else {
    width = image.width
    height = Math.round(width / target)
  }
  const left = Math.max(0, Math.round((image.width - width) / 2))
  const top =
    anchor === 'top'
      ? 0
      : anchor === 'bottom'
        ? Math.max(0, image.height - height)
        : Math.max(0, Math.round((image.height - height) / 2))
  return image.crop(left, top, Math.min(width, image.width), Math.min(height, image.height))
}

/** Tile photo copies onto a 4x6 inch white sheet (print-at-home layout). */
function sheet4x6(vips: VipsModule, photo: VipsImage, dpi: number): VipsImage | null {
  const sheet = vips.Image.black(Math.round(4 * dpi), Math.round(6 * dpi), { bands: 3 })
  if (typeof (sheet as { insert?: unknown }).insert !== 'function') return null
  let white = sheet.linear(1, 255)
  const margin = Math.round(0.06 * dpi)
  const gap = Math.round(0.04 * dpi)
  const cols = Math.max(1, Math.floor((white.width - 2 * margin + gap) / (photo.width + gap)))
  const rows = Math.max(1, Math.floor((white.height - 2 * margin + gap) / (photo.height + gap)))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = margin + col * (photo.width + gap)
      const y = margin + row * (photo.height + gap)
      white = white.insert(photo, x, y)
    }
  }
  return white
}

/** Anti-aliased circular alpha mask, supersampled 4x for smooth edges. */
function circleMask(vips: VipsModule, size: number): VipsImage {
  const scale = 4
  const big = vips.Image.black(size * scale, size * scale, { bands: 1 })
  big.drawCircle([255], (size * scale) / 2, (size * scale) / 2, (size * scale) / 2 - scale, {
    fill: true,
  })
  return big.resize(1 / scale)
}

type CompressResult = {
  bytes: Uint8Array
  quality: number
  scale: number
  missed: boolean
}

/**
 * Iteratively compress to a byte target: binary-search quality, then step
 * dimensions down when even the lowest quality overshoots.
 */
function compressToTarget(
  image: VipsImage,
  format: string,
  targetBytes: number,
  params: Record<string, unknown>,
  onProgress: (progress: number, note?: string) => void,
): CompressResult {
  const suffix = (FORMATS[format] ?? FORMATS.jpg).suffix
  const options = (quality: number) => saveOptions(format, { ...params, quality })
  const encode = (img: VipsImage, quality: number) => img.writeToBuffer(suffix, options(quality))
  const strategy = String(params.strategy ?? 'quality-first')

  const tryFit = (img: VipsImage): { bytes: Uint8Array; quality: number } | null => {
    const found = searchQuality(targetBytes, (quality) => encode(img, quality).length)
    return found ? { bytes: encode(img, found.quality), quality: found.quality } : null
  }

  if (strategy !== 'dimensions-first') {
    const hit = tryFit(image)
    if (hit) return { ...hit, scale: 1, missed: false }
  }

  let scale = 1
  let working = image
  while (scale > MIN_SCALE) {
    scale = nextScale(scale)
    onProgress(60, `scaling to ${Math.round(scale * 100)}%`)
    working = image.resize(scale)

    if (strategy === 'dimensions-first') {
      const probe = encode(working, PROBE_QUALITY)
      if (probe.length <= targetBytes) {
        const hit = tryFit(working)
        if (hit) return { ...hit, scale, missed: false }
      }
      continue
    }

    const hit = tryFit(working)
    if (hit) return { ...hit, scale, missed: false }
  }

  return {
    bytes: encode(working, FALLBACK_QUALITY),
    quality: FALLBACK_QUALITY,
    scale,
    missed: true,
  }
}

async function runOp(req: WorkerRequest): Promise<{
  bytes: Uint8Array
  type: string
  name: string
  notes?: string[]
}> {
  const vips = await loadVips()
  const input = req.inputs[0]
  if (!input) throw new Error('no input')
  progress(20, 'decoding')

  let image = vips.Image.newFromBuffer(new Uint8Array(input.data))
  try {
    const params = req.params
    const format = outputFormat(input.name, params)
    let result: { bytes: Uint8Array; type: string; format: string }
    let name = input.name

    switch (req.op) {
      case 'convert': {
        progress(55, 'encoding')
        result = encode(image, params, format)
        name = `${stem(input.name)}.${result.format}`
        break
      }
      case 'resize': {
        progress(45, 'resizing')
        const resized = fitResize(image, params)
        if (resized !== image) {
          image.delete()
          image = resized
        }
        progress(70, 'encoding')
        result = encode(image, params, format)
        name = `${stem(input.name)}.${result.format}`
        break
      }
      case 'rotate': {
        progress(45, 'rotating')
        const angle = String(params.angle ?? '90')
        const rotated =
          angle === '180' ? image.rot180() : angle === '270' ? image.rot270() : image.rot90()
        image.delete()
        image = rotated
        progress(70, 'encoding')
        result = encode(image, params, format)
        name = `${stem(input.name)}.${result.format}`
        break
      }
      case 'flip': {
        progress(45, 'flipping')
        const axis = String(params.axis ?? 'horizontal')
        let flipped = image
        if (axis === 'horizontal') flipped = image.fliphor()
        else if (axis === 'vertical') flipped = image.flipver()
        else flipped = image.fliphor().flipver()
        image.delete()
        image = flipped
        progress(70, 'encoding')
        result = encode(image, params, format)
        name = `${stem(input.name)}.${result.format}`
        break
      }
      case 'compress': {
        const mode = String(params.mode ?? 'quality')
        const targetKb = Number(params.targetKb)
        progress(40, mode === 'target-size' ? 'searching quality' : 'encoding')

        if (params.resize) {
          const resized = fitResize(image, { mode: 'dimensions', ...(params.resize as object) })
          if (resized !== image) {
            image.delete()
            image = resized
          }
        }

        if (mode === 'target-size' && Number.isFinite(targetKb) && targetKb > 0) {
          const outcome = compressToTarget(image, format, targetKb * 1024, params, progress)
          progress(95, outcome.missed ? 'target not reached — best effort' : 'target met')
          return {
            bytes: outcome.bytes,
            type: (FORMATS[format] ?? FORMATS.jpg).type,
            name: `${stem(input.name)}.${format}`,
          }
        }

        result = encode(image, params, format)
        name = `${stem(input.name)}.${result.format}`
        break
      }
      case 'crop-ratio': {
        progress(45, 'cropping')
        const cropped = cropToRatio(image, String(params.ratio ?? '1:1'), String(params.anchor ?? 'center'))
        if (cropped !== image) {
          image.delete()
          image = cropped
        }
        progress(70, 'encoding')
        result = encode(image, params, format)
        name = `${stem(input.name)}.${result.format}`
        break
      }
      case 'crop-standard': {
        const standard = String(params.standard ?? '35x45')
        const dpi = Math.max(72, Math.min(1200, Math.round(Number(params.dpi) || 300)))
        const target = sizeInPixels(standard, dpi)
        progress(40, `cropping ${standard} @ ${dpi}dpi`)

        const cropped = fitResize(image, {
          mode: 'dimensions',
          width: target.width,
          height: target.height,
          fit: 'cover',
        })
        if (cropped !== image) {
          image.delete()
          image = cropped
        }

        const sheetTip =
          params.compose4x6 === true ? sheet4x6(vips, image, dpi) : null
        if (sheetTip) {
          image.delete()
          image = sheetTip
        }

        progress(80, 'encoding')
        const bytes = image.writeToBuffer('.jpg', saveOptions('jpg', { ...params, quality: 92 }))
        // libvips savers ignore resolution metadata and copy the source EXIF
        // verbatim, so the DPI is written into the output container directly.
        const patched = setJpegDpi(bytes, dpi)
        return {
          bytes: patched.bytes,
          type: 'image/jpeg',
          name: `${stem(input.name)}.jpg`,
          notes: [
            sheetTip
              ? `[+] 4x6 sheet: ${image.width}×${image.height}px (multiple copies)`
              : `[+] ${target.width}×${target.height}px at ${dpi}dpi`,
            patched.patched
              ? '[+] DPI embedded in the file'
              : '[!] no EXIF/JFIF block to embed DPI — portals process by pixels',
          ],
        }
      }
      case 'circle-crop': {
        const size = Math.max(32, Math.min(4096, Math.round(numberParam(params, 'size', 512))))
        progress(40, 'cropping square')
        const squared = fitResize(image, {
          mode: 'dimensions',
          width: size,
          height: size,
          fit: 'cover',
        })
        if (squared !== image) {
          image.delete()
          image = squared
        }
        progress(70, 'applying circle mask')
        // Canvas PNGs already carry an alpha band; drop it so the circle mask
        // becomes the image's only alpha channel.
        if (image.bands >= 4) {
          const rgb = image.extractBand(0, { n: 3 })
          image.delete()
          image = rgb
        }
        const mask = circleMask(vips, size)
        const rgba = image.bandjoin(mask)
        mask.delete()
        image.delete()
        image = rgba
        progress(85, 'encoding')
        const bytes = image.writeToBuffer('.png', {
          compression: 6,
          effort: 7,
          strip: params.keepMetadata !== true,
        })
        return { bytes, type: 'image/png', name: `${stem(input.name)}.png` }
      }
      default:
        throw new Error(`unknown vips op: ${req.op}`)
    }

    progress(95, 'finishing')
    return { bytes: result.bytes, type: result.type, name }
  } finally {
    try {
      image.delete()
    } catch {
      /* already freed */
    }
  }
}

/* ---------------------------------------------------------------- */
/* worker plumbing                                                   */
/* ---------------------------------------------------------------- */

function progress(value: number, note?: string) {
  const id = activeId
  if (!id) return
  worker.postMessage({ id, kind: 'progress', progress: value, note })
}

let activeId: string | null = null

worker.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  activeId = req.id
  try {
    const result = await runOp(req)
    const data = result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.byteLength,
    ) as ArrayBuffer
    worker.postMessage(
      {
        id: req.id,
        kind: 'done',
        output: { name: result.name, type: result.type, data, notes: result.notes },
      },
      [data],
    )
  } catch (error) {
    worker.postMessage({
      id: req.id,
      kind: 'error',
      message: `${req.inputs[0]?.name ?? 'input'} (${req.op}): ${errorText(error)}`,
    })
  } finally {
    activeId = null
  }
}
