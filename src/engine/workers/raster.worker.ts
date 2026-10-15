/*
 * Raster engine worker — OffscreenCanvas 2D.
 *
 * Pixel-level effects, compositing and layout. Canvas is the right tool for
 * these ops: it has native resampling, CSS filters, clipping paths and
 * format encoders, all available inside a worker.
 *
 * Ops: adjust · blur · pixelate · glitch · round-corners · split ·
 *      watermark-text · watermark-image · merge
 */
import { zipSync } from 'fflate'
import type { JobInput, WorkerRequest, WorkerResponse } from '../types'

const worker = globalThis as unknown as {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

let activeId: string | null = null

function progress(value: number, note?: string) {
  if (!activeId) return
  worker.postMessage({ id: activeId, kind: 'progress', progress: value, note })
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const stem = (name: string) => name.replace(/\.[^.]+$/, '') || 'output'

type Result = { bytes: Uint8Array; type: string; name: string; notes?: string[] }

const OUTPUT_TYPES: Record<string, { type: string; ext: string; quality: number }> = {
  'image/jpeg': { type: 'image/jpeg', ext: 'jpg', quality: 0.92 },
  'image/png': { type: 'image/png', ext: 'png', quality: 1 },
  'image/webp': { type: 'image/webp', ext: 'webp', quality: 0.9 },
}

const outputSpec = (input: JobInput, forcePng = false) => {
  if (forcePng) return OUTPUT_TYPES['image/png']
  return OUTPUT_TYPES[(input.type || '').toLowerCase()] ?? OUTPUT_TYPES['image/png']
}

const loadBitmap = async (input: JobInput): Promise<ImageBitmap> =>
  createImageBitmap(new Blob([input.data], { type: input.type || 'image/png' }))

function makeCanvas(width: number, height: number) {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  return { canvas, ctx }
}

async function encodeCanvas(
  canvas: OffscreenCanvas,
  spec: { type: string; quality: number },
): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: spec.type, quality: spec.quality })
  return new Uint8Array(await blob.arrayBuffer())
}

/** Deterministic PRNG so a given seed always produces the same glitch. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/* adjust                                                             */
/* ------------------------------------------------------------------ */

const FILTERS: Record<string, string> = {
  'grayscale:standard': 'grayscale(1)',
  'grayscale:film': 'grayscale(1) sepia(0.4) brightness(1.06) contrast(0.92)',
  'grayscale:contrast': 'grayscale(1) contrast(1.8)',
  invert: 'invert(1)',
}

function grayscaleKeepRed(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height)
  const px = image.data
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]
    const g = px[i + 1]
    const b = px[i + 2]
    const isRed = r > g * 1.25 && r > b * 1.25 && r > 60
    if (!isRed) {
      const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
      px[i] = y
      px[i + 1] = y
      px[i + 2] = y
    }
  }
  ctx.putImageData(image, 0, 0)
}

async function opAdjust(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await loadBitmap(input)
  const { canvas, ctx } = makeCanvas(bitmap.width, bitmap.height)
  const effect = String(req.params.effect ?? 'grayscale')
  const mode = String(req.params.mode ?? 'standard')
  const value = clamp(Number(req.params.value) || 0, -100, 100)

  progress(40, effect)
  if (effect === 'grayscale' && mode === 'keep-red') {
    ctx.drawImage(bitmap, 0, 0)
    grayscaleKeepRed(ctx, canvas.width, canvas.height)
  } else if (effect === 'brightness') {
    ctx.filter = `brightness(${clamp(1 + value / 100, 0.1, 2.5).toFixed(3)})`
    ctx.drawImage(bitmap, 0, 0)
  } else if (effect === 'contrast') {
    ctx.filter = `contrast(${clamp(1 + value / 100, 0.1, 2.5).toFixed(3)})`
    ctx.drawImage(bitmap, 0, 0)
  } else {
    ctx.filter = FILTERS[`${effect}:${mode}`] ?? FILTERS[effect] ?? 'none'
    ctx.drawImage(bitmap, 0, 0)
  }
  bitmap.close()

  progress(90, 'encoding')
  const spec = outputSpec(input)
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(input.name)}.${spec.ext}`,
  }
}

/* ------------------------------------------------------------------ */
/* blur                                                               */
/* ------------------------------------------------------------------ */

async function opBlur(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await loadBitmap(input)
  const mode = String(req.params.mode ?? 'gaussian')
  const radius = clamp(Number(req.params.radius) || 12, 1, 120)
  const { canvas, ctx } = makeCanvas(bitmap.width, bitmap.height)

  progress(45, mode)
  if (mode === 'solid') {
    ctx.fillStyle = String(req.params.coverColor ?? '#201d1d')
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else if (mode === 'pixelate') {
    const scale = Math.max(2, Math.round(radius / 2))
    const small = makeCanvas(Math.ceil(canvas.width / scale), Math.ceil(canvas.height / scale))
    small.ctx.imageSmoothingEnabled = false
    small.ctx.drawImage(bitmap, 0, 0, small.canvas.width, small.canvas.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(small.canvas, 0, 0, canvas.width, canvas.height)
  } else {
    // Overscan so the blur's edge falloff happens outside the canvas.
    ctx.filter = `blur(${radius}px)`
    ctx.drawImage(bitmap, -radius, -radius, canvas.width + radius * 2, canvas.height + radius * 2)
  }
  bitmap.close()

  progress(90, 'encoding')
  const spec = outputSpec(input)
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(input.name)}.${spec.ext}`,
  }
}

/* ------------------------------------------------------------------ */
/* pixelate                                                           */
/* ------------------------------------------------------------------ */

const PALETTES: Record<string, [number, number, number][]> = {
  gameboy: [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15],
  ],
  nes: [
    [0, 0, 0], [252, 252, 252], [188, 188, 188], [124, 124, 124],
    [164, 0, 0], [244, 0, 0], [164, 88, 0], [228, 152, 0],
    [0, 120, 0], [0, 184, 0], [0, 0, 164], [0, 0, 248],
    [152, 0, 164], [0, 168, 168], [248, 120, 88], [228, 228, 168],
  ],
  c64: [
    [0, 0, 0], [255, 255, 255], [129, 51, 56], [75, 166, 173],
    [142, 60, 151], [86, 172, 77], [45, 50, 148], [237, 241, 113],
    [142, 84, 37], [91, 71, 43], [206, 116, 103], [80, 80, 80],
    [120, 120, 120], [170, 255, 170], [120, 130, 255], [170, 170, 170],
  ],
}

function applyPalette(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  palette: [number, number, number][],
) {
  const image = ctx.getImageData(0, 0, width, height)
  const px = image.data
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]
    const g = px[i + 1]
    const b = px[i + 2]
    let best = palette[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const color of palette) {
      const dr = r - color[0]
      const dg = g - color[1]
      const db = b - color[2]
      const distance = dr * dr + dg * dg + db * db
      if (distance < bestDistance) {
        bestDistance = distance
        best = color
      }
    }
    px[i] = best[0]
    px[i + 1] = best[1]
    px[i + 2] = best[2]
  }
  ctx.putImageData(image, 0, 0)
}

async function opPixelate(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await loadBitmap(input)
  const block = clamp(Number(req.params.block) || 8, 2, 64)
  const paletteName = String(req.params.palette ?? 'none')

  progress(40, 'blocking')
  const small = makeCanvas(Math.ceil(bitmap.width / block), Math.ceil(bitmap.height / block))
  small.ctx.imageSmoothingEnabled = false
  small.ctx.drawImage(bitmap, 0, 0, small.canvas.width, small.canvas.height)

  const { canvas, ctx } = makeCanvas(bitmap.width, bitmap.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small.canvas, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const palette = PALETTES[paletteName]
  if (palette) {
    progress(75, `palette ${paletteName}`)
    applyPalette(ctx, canvas.width, canvas.height, palette)
  }

  progress(90, 'encoding')
  const spec = OUTPUT_TYPES['image/png']
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(input.name)}.${spec.ext}`,
  }
}

/* ------------------------------------------------------------------ */
/* glitch                                                             */
/* ------------------------------------------------------------------ */

async function opGlitch(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await loadBitmap(input)
  const width = bitmap.width
  const height = bitmap.height
  const intensity = clamp(Number(req.params.intensity) || 40, 1, 100)
  const seed = Math.round(Number(req.params.seed) || 7)
  const rgbSplit = req.params.rgbSplit !== false
  const scanlines = req.params.scanlines !== false
  const pixelShift = req.params.pixelShift !== false

  progress(40, 'glitching')
  const { canvas, ctx } = makeCanvas(width, height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const image = ctx.getImageData(0, 0, width, height)
  const out = image.data
  const src = new Uint8ClampedArray(out)
  const random = mulberry32(seed)
  const maxShift = Math.max(1, Math.round((intensity / 100) * Math.min(width, height) * 0.08))
  const channelShift = Math.max(1, Math.round(maxShift * 0.6))
  const indexOf = (x: number, y: number) => (y * width + clamp(x, 0, width - 1)) * 4

  for (let y = 0; y < height; y += 1) {
    const rowOffset =
      pixelShift && random() < 0.06 ? Math.round((random() * 2 - 1) * maxShift) : 0
    const scan = scanlines && y % 3 === 0 ? 1 - intensity / 400 : 1
    for (let x = 0; x < width; x += 1) {
      const outIndex = (y * width + x) * 4
      const redIndex = indexOf(x + rowOffset + (rgbSplit ? channelShift : 0), y)
      const greenIndex = indexOf(x + rowOffset, y)
      const blueIndex = indexOf(x + rowOffset - (rgbSplit ? channelShift : 0), y)
      out[outIndex] = src[redIndex] * scan
      out[outIndex + 1] = src[greenIndex + 1] * scan
      out[outIndex + 2] = src[blueIndex + 2] * scan
      out[outIndex + 3] = src[greenIndex + 3]
    }
  }
  ctx.putImageData(image, 0, 0)

  progress(90, 'encoding')
  const spec = outputSpec(input)
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(input.name)}.${spec.ext}`,
  }
}

/* ------------------------------------------------------------------ */
/* round-corners                                                      */
/* ------------------------------------------------------------------ */

function smoothCornersPath(
  width: number,
  height: number,
  radius: number,
  corners: { tl: boolean; tr: boolean; br: boolean; bl: boolean },
): Path2D {
  const r = radius
  const k = 0.45
  const tl = corners.tl ? r : 0
  const tr = corners.tr ? r : 0
  const br = corners.br ? r : 0
  const bl = corners.bl ? r : 0
  const path = new Path2D()
  path.moveTo(tl, 0)
  path.lineTo(width - tr, 0)
  if (tr) path.bezierCurveTo(width - tr * (1 - k), 0, width, tr * (1 - k), width, tr)
  path.lineTo(width, height - br)
  if (br) path.bezierCurveTo(width, height - br * (1 - k), width - br * (1 - k), height, width - br, height)
  path.lineTo(bl, height)
  if (bl) path.bezierCurveTo(bl * (1 - k), height, 0, height - bl * (1 - k), 0, height - bl)
  path.lineTo(0, tl)
  if (tl) path.bezierCurveTo(0, tl * (1 - k), tl * (1 - k), 0, tl, 0)
  path.closePath()
  return path
}

async function opRoundCorners(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await loadBitmap(input)
  const width = bitmap.width
  const height = bitmap.height
  const radiusPercent = clamp(Number(req.params.radius) || 12, 1, 50)
  const radius = Math.round((radiusPercent / 100) * Math.min(width, height) * 0.5)
  const curve = String(req.params.curve ?? 'smooth')
  const cornersParam = String(req.params.corners ?? 'all')
  const corners = {
    tl: cornersParam === 'all' || cornersParam === 'top',
    tr: cornersParam === 'all' || cornersParam === 'top',
    br: cornersParam === 'all' || cornersParam === 'bottom',
    bl: cornersParam === 'all' || cornersParam === 'bottom',
  }

  progress(45, 'clipping')
  const { canvas, ctx } = makeCanvas(width, height)
  const path =
    curve === 'circular'
      ? (() => {
          const p = new Path2D()
          p.roundRect(0, 0, width, height, [
            corners.tl ? radius : 0,
            corners.tr ? radius : 0,
            corners.br ? radius : 0,
            corners.bl ? radius : 0,
          ])
          return p
        })()
      : smoothCornersPath(width, height, radius, corners)

  ctx.clip(path)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  progress(90, 'encoding')
  const spec = OUTPUT_TYPES['image/png']
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(input.name)}.${spec.ext}`,
  }
}

/* ------------------------------------------------------------------ */
/* split                                                              */
/* ------------------------------------------------------------------ */

async function opSplit(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await loadBitmap(input)
  const cols = clamp(Math.round(Number(req.params.cols) || 3), 1, 12)
  const rows = clamp(Math.round(Number(req.params.rows) || 3), 1, 12)
  const gap = clamp(Math.round(Number(req.params.gap) || 0), 0, 64)
  const tileWidth = Math.floor((bitmap.width - gap * (cols - 1)) / cols)
  const tileHeight = Math.floor((bitmap.height - gap * (rows - 1)) / rows)
  if (tileWidth < 1 || tileHeight < 1) throw new Error('gap is too large for this grid')

  const files: Record<string, Uint8Array> = {}
  const base = stem(input.name)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      progress(20 + Math.round(((row * cols + col) / (rows * cols)) * 65), `tile ${row + 1},${col + 1}`)
      const tile = makeCanvas(tileWidth, tileHeight)
      tile.ctx.drawImage(
        bitmap,
        col * (tileWidth + gap),
        row * (tileHeight + gap),
        tileWidth,
        tileHeight,
        0,
        0,
        tileWidth,
        tileHeight,
      )
      const bytes = await encodeCanvas(tile.canvas, OUTPUT_TYPES['image/png'])
      files[`${base}-r${row + 1}c${col + 1}.png`] = bytes
    }
  }
  bitmap.close()

  progress(90, 'packing zip')
  const zip = zipSync(files)
  return {
    bytes: zip,
    type: 'application/zip',
    name: `${base}-tiles.zip`,
    notes: [`${cols * rows} tiles packaged`],
  }
}

/* ------------------------------------------------------------------ */
/* watermark                                                          */
/* ------------------------------------------------------------------ */

type Position = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile'

function positionOf(position: Position, width: number, height: number, w: number, h: number, margin: number) {
  switch (position) {
    case 'top-left':
      return { x: margin, y: margin }
    case 'top-right':
      return { x: width - w - margin, y: margin }
    case 'bottom-left':
      return { x: margin, y: height - h - margin }
    case 'bottom-right':
      return { x: width - w - margin, y: height - h - margin }
    default:
      return { x: (width - w) / 2, y: (height - h) / 2 }
  }
}

async function opWatermarkText(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await loadBitmap(input)
  const width = bitmap.width
  const height = bitmap.height
  const text = String(req.params.text ?? '© Your Name')
  const opacity = clamp(Number(req.params.opacity) || 60, 1, 100) / 100
  const scale = clamp(Number(req.params.scale) || 20, 1, 100)
  const position = String(req.params.position ?? 'bottom-right') as Position
  const color = String(req.params.color ?? '#ffffff')

  const { canvas, ctx } = makeCanvas(width, height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  progress(50, 'drawing text')
  const fontSize = Math.max(10, Math.round((scale / 100) * Math.min(width, height) * 0.6))
  ctx.font = `700 ${fontSize}px monospace`
  ctx.fillStyle = color
  ctx.globalAlpha = opacity
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = Math.max(2, fontSize * 0.12)
  const metrics = ctx.measureText(text)
  const margin = Math.round(Math.min(width, height) * 0.03)

  if (position === 'tile') {
    const stepX = metrics.width + fontSize
    const stepY = fontSize * 3
    for (let y = margin; y < height; y += stepY) {
      for (let x = -stepX; x < width; x += stepX) {
        ctx.fillText(text, x, y + fontSize)
      }
    }
  } else {
    const spot = positionOf(position, width, height, metrics.width, fontSize, margin)
    ctx.fillText(text, spot.x, spot.y + fontSize)
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0

  progress(90, 'encoding')
  const spec = outputSpec(input)
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(input.name)}.${spec.ext}`,
  }
}

async function opWatermarkImage(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const logoInput = req.inputs[1]
  if (!logoInput) throw new Error('no watermark image provided')
  const bitmap = await loadBitmap(input)
  const logo = await loadBitmap(logoInput)
  const width = bitmap.width
  const height = bitmap.height
  const opacity = clamp(Number(req.params.opacity) || 60, 1, 100) / 100
  const scale = clamp(Number(req.params.scale) || 20, 1, 100)
  const position = String(req.params.position ?? 'bottom-right') as Position

  progress(50, 'compositing logo')
  const { canvas, ctx } = makeCanvas(width, height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const logoWidth = Math.max(8, Math.round((scale / 100) * width))
  const logoHeight = Math.round((logo.height / logo.width) * logoWidth)
  const margin = Math.round(Math.min(width, height) * 0.03)
  ctx.globalAlpha = opacity

  if (position === 'tile') {
    const stepX = logoWidth + margin * 2
    const stepY = logoHeight + margin * 2
    for (let y = margin; y < height; y += stepY) {
      for (let x = margin; x < width; x += stepX) ctx.drawImage(logo, x, y, logoWidth, logoHeight)
    }
  } else {
    const spot = positionOf(position, width, height, logoWidth, logoHeight, margin)
    ctx.drawImage(logo, spot.x, spot.y, logoWidth, logoHeight)
  }
  ctx.globalAlpha = 1
  logo.close()

  progress(90, 'encoding')
  const spec = outputSpec(input)
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(input.name)}.${spec.ext}`,
  }
}

/* ------------------------------------------------------------------ */
/* merge                                                              */
/* ------------------------------------------------------------------ */

async function opMerge(req: WorkerRequest): Promise<Result> {  const bitmaps: ImageBitmap[] = []
  for (const input of req.inputs) {
    bitmaps.push(await loadBitmap(input))
  }
  if (bitmaps.length === 0) throw new Error('no inputs')

  const layout = String(req.params.layout ?? 'grid')
  const gap = clamp(Math.round(Number(req.params.gap) || 8), 0, 128)
  const background = String(req.params.background ?? '#ffffff')
  const columns =
    layout === 'horizontal'
      ? bitmaps.length
      : layout === 'vertical'
        ? 1
        : clamp(Math.round(Number(req.params.columns) || 3), 1, 12)
  const rows = Math.ceil(bitmaps.length / columns)
  const cellWidth = Math.max(...bitmaps.map((b) => b.width))
  const cellHeight = Math.max(...bitmaps.map((b) => b.height))
  const width = columns * cellWidth + gap * (columns - 1)
  const height = rows * cellHeight + gap * (rows - 1)

  progress(50, `${columns}x${rows} grid`)
  const { canvas, ctx } = makeCanvas(width, height)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  bitmaps.forEach((bitmap, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const cellX = col * (cellWidth + gap)
    const cellY = row * (cellHeight + gap)
    // Contain each image inside its cell, centred.
    const scale = Math.min(cellWidth / bitmap.width, cellHeight / bitmap.height)
    const drawWidth = Math.round(bitmap.width * scale)
    const drawHeight = Math.round(bitmap.height * scale)
    ctx.drawImage(
      bitmap,
      cellX + Math.round((cellWidth - drawWidth) / 2),
      cellY + Math.round((cellHeight - drawHeight) / 2),
      drawWidth,
      drawHeight,
    )
    bitmap.close()
  })

  progress(90, 'encoding')
  const spec = (req.params.format as string) === 'png' ? OUTPUT_TYPES['image/png'] : OUTPUT_TYPES['image/jpeg']
  const first = req.inputs[0]
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(first.name)}-merged.${spec.ext}`,
    notes: [`${bitmaps.length} images merged`],
  }
}

/* ------------------------------------------------------------------ */
/* overlay (stack images on a background canvas)                      */
/* ------------------------------------------------------------------ */

async function opOverlay(req: WorkerRequest): Promise<Result> {
  const bitmaps: ImageBitmap[] = []
  for (const input of req.inputs) bitmaps.push(await loadBitmap(input))
  if (bitmaps.length === 0) throw new Error('no inputs')

  const canvasParam = (req.params.canvas ?? { width: 1920, height: 1080 }) as {
    width: number
    height: number
  }
  const width = Math.max(16, Math.round(Number(canvasParam.width) || 1920))
  const height = Math.max(16, Math.round(Number(canvasParam.height) || 1080))
  const opacity = clamp(Number(req.params.opacity) || 100, 0, 100) / 100
  const background = String(req.params.background ?? '#ffffff')

  progress(45, 'compositing')
  const { canvas, ctx } = makeCanvas(width, height)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  const [base, ...layers] = bitmaps
  // Background image: cover the canvas.
  const coverScale = Math.max(width / base.width, height / base.height)
  const coverWidth = Math.round(base.width * coverScale)
  const coverHeight = Math.round(base.height * coverScale)
  ctx.drawImage(base, Math.round((width - coverWidth) / 2), Math.round((height - coverHeight) / 2), coverWidth, coverHeight)
  base.close()

  // Layers: contained inside the canvas, centred, with opacity.
  ctx.globalAlpha = opacity
  for (const layer of layers) {
    const scale = Math.min(1, Math.min(width / layer.width, height / layer.height))
    const drawWidth = Math.round(layer.width * scale)
    const drawHeight = Math.round(layer.height * scale)
    ctx.drawImage(layer, Math.round((width - drawWidth) / 2), Math.round((height - drawHeight) / 2), drawWidth, drawHeight)
    layer.close()
  }
  ctx.globalAlpha = 1

  progress(90, 'encoding')
  const spec = (req.params.format as string) === 'png' ? OUTPUT_TYPES['image/png'] : OUTPUT_TYPES['image/jpeg']
  const first = req.inputs[0]
  return {
    bytes: await encodeCanvas(canvas, spec),
    type: spec.type,
    name: `${stem(first.name)}-overlay.${spec.ext}`,
    notes: [layers.length > 0 ? `${layers.length} layer(s) over 1 background` : 'single image resized to canvas'],
  }
}

/* ------------------------------------------------------------------ */
/* dispatch                                                           */
/* ------------------------------------------------------------------ */

async function runOp(req: WorkerRequest): Promise<Result> {
  switch (req.op) {
    case 'adjust':
      return opAdjust(req)
    case 'blur':
      return opBlur(req)
    case 'pixelate':
      return opPixelate(req)
    case 'glitch':
      return opGlitch(req)
    case 'round-corners':
      return opRoundCorners(req)
    case 'split':
      return opSplit(req)
    case 'watermark':
      return String(req.params.type ?? 'text') === 'image'
        ? opWatermarkImage(req)
        : opWatermarkText(req)
    case 'merge':
      return opMerge(req)
    case 'overlay':
      return opOverlay(req)
    default:
      throw new Error(`unknown raster op: ${req.op}`)
  }
}

worker.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  activeId = req.id
  try {
    const result = await runOp(req)
    const bytes = result.bytes
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
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
