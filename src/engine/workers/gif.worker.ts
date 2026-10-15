/*
 * GIF engine worker — animated frame pipeline.
 *
 * Decoding uses the ImageDecoder API (native, disposal-aware, available in
 * workers), transforms run on OffscreenCanvas per frame, and encoding uses
 * gifenc with a global palette by default (smaller files) or per-frame
 * palettes when asked for extra quality.
 *
 * Ops: images-to-gif · compress · resize · crop · rotate · reverse · speed ·
 *      trim · merge · text · blur · extract-frames · sprite-sheet ·
 *      sprite-to-gif · typing-text · discord-sticker
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { zipSync } from 'fflate'
import {
  clampDelay,
  DEFAULT_DELAY_MS,
  describeSettings,
  INITIAL_GIF_SETTINGS,
  nextEscalation,
  retime,
  skipIndices,
  trimRange,
  type GifSettings,
} from './gif-timing'
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
const stem = (name: string) => name.replace(/\.[^.]+$/, '') || 'animation'

type Result = { bytes: Uint8Array; type: string; name: string; notes?: string[] }
type Frame = { canvas: OffscreenCanvas; delay: number }
type Animation = { frames: Frame[]; loop: number; width: number; height: number }

const makeCanvas = (width: number, height: number) => {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  return { canvas, ctx }
}

const frameData = (frame: Frame): ImageData => {
  const ctx = frame.canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  return ctx.getImageData(0, 0, frame.canvas.width, frame.canvas.height)
}

/* ------------------------------------------------------------------ */
/* decode / encode                                                    */
/* ------------------------------------------------------------------ */

const isGif = (input: JobInput): boolean =>
  input.type === 'image/gif' || /\.gif$/i.test(input.name)

async function decodeAnimation(input: JobInput): Promise<Animation> {
  if (!isGif(input)) {
    // Still images become a one-frame animation with a sensible hold.
    const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type || 'image/png' }))
    const { canvas, ctx } = makeCanvas(bitmap.width, bitmap.height)
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return { frames: [{ canvas, delay: 200 }], loop: 0, width: canvas.width, height: canvas.height }
  }

  if (typeof ImageDecoder === 'undefined') {
    throw new Error('this browser cannot decode animated GIFs in a worker (ImageDecoder missing)')
  }

  const decoder = new ImageDecoder({ data: input.data, type: 'image/gif' })
  const frames: Frame[] = []
  let width = 0
  let height = 0

  // `track.frameCount` is not reliable before the track is ready in every
  // browser, so decode until the decoder runs out of frames instead.
  for (let index = 0; index < 5000; index += 1) {
    let decoded: { image: VideoFrame }
    try {
      decoded = await decoder.decode({ frameIndex: index })
    } catch {
      break
    }
    const { image } = decoded
    width = Math.max(width, image.displayWidth)
    height = Math.max(height, image.displayHeight)
    const { canvas, ctx } = makeCanvas(image.displayWidth, image.displayHeight)
    ctx.drawImage(image, 0, 0)
    const durationMs = image.duration && image.duration > 0 ? image.duration / 1000 : DEFAULT_DELAY_MS
    frames.push({ canvas, delay: clampDelay(durationMs) })
    image.close()
    if (index % 10 === 0) progress(15 + Math.min(35, index), `decoding frame ${index + 1}`)
  }

  let loop: number
  try {
    const repetition = decoder.tracks.selectedTrack?.repetitionCount
    loop =
      repetition === undefined || repetition === null || repetition === Infinity
        ? 0
        : Math.max(0, Number(repetition))
  } catch {
    loop = 0
  }
  decoder.close()

  if (frames.length === 0) throw new Error('no frames could be decoded')

  // Normalise every frame to the animation canvas size (top-left aligned).
  const normalised = frames.map((frame) => {
    if (frame.canvas.width === width && frame.canvas.height === height) return frame
    const { canvas, ctx } = makeCanvas(width, height)
    ctx.drawImage(frame.canvas, 0, 0)
    return { canvas, delay: frame.delay }
  })

  return { frames: normalised, loop, width, height }
}

function encodeAnimation(animation: Animation, colors: number, globalPalette: boolean): Uint8Array {
  const encoder = GIFEncoder()
  const first = frameData(animation.frames[0])
  const palette = quantize(first.data, colors, { format: 'rgb565' })

  animation.frames.forEach((frame, index) => {
    const data = index === 0 ? first.data : frameData(frame).data
    const framePalette = globalPalette ? palette : index === 0 ? palette : quantize(data, colors, { format: 'rgb565' })
    const indexed = applyPalette(data, framePalette, 'rgb565')
    encoder.writeFrame(indexed, animation.width, animation.height, {
      palette: index === 0 || !globalPalette ? framePalette : undefined,
      delay: frame.delay,
      repeat: index === 0 ? animation.loop : undefined,
      dispose: 1,
    })
    if (index % 10 === 0) {
      progress(70 + Math.round((index / animation.frames.length) * 25), `encoding ${index + 1}/${animation.frames.length}`)
    }
  })
  encoder.finish()
  return encoder.bytes()
}

const gifResult = (input: JobInput, bytes: Uint8Array, notes?: string[]): Result => ({
  bytes,
  type: 'image/gif',
  name: `${stem(input.name)}.gif`,
  notes,
})

/* ------------------------------------------------------------------ */
/* frame transforms                                                   */
/* ------------------------------------------------------------------ */

function mapCanvas(
  animation: Animation,
  width: number,
  height: number,
  draw: (ctx: OffscreenCanvasRenderingContext2D, frame: Frame, index: number) => void,
): Animation {
  return {
    ...animation,
    width,
    height,
    frames: animation.frames.map((frame, index) => {
      const { canvas, ctx } = makeCanvas(width, height)
      draw(ctx, frame, index)
      return { canvas, delay: frame.delay }
    }),
  }
}

function resizeAnimation(
  animation: Animation,
  targetWidth: number,
  targetHeight: number,
  fit: 'cover' | 'contain' | 'stretch',
): Animation {
  const width = Math.max(1, Math.round(targetWidth))
  const height = Math.max(1, Math.round(targetHeight))
  return mapCanvas(animation, width, height, (ctx, frame) => {
    if (fit === 'stretch') {
      ctx.drawImage(frame.canvas, 0, 0, width, height)
      return
    }
    const scale =
      fit === 'cover'
        ? Math.max(width / frame.canvas.width, height / frame.canvas.height)
        : Math.min(width / frame.canvas.width, height / frame.canvas.height)
    const drawWidth = frame.canvas.width * scale
    const drawHeight = frame.canvas.height * scale
    ctx.drawImage(frame.canvas, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  })
}

function cropAnimation(animation: Animation, ratio: string, anchor: string): Animation {
  if (ratio === 'free') return animation
  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
  if (!ratioWidth || !ratioHeight) return animation
  const target = ratioWidth / ratioHeight
  const current = animation.width / animation.height
  let width: number
  let height: number
  if (current > target) {
    height = animation.height
    width = Math.round(height * target)
  } else {
    width = animation.width
    height = Math.round(width / target)
  }
  const left = Math.max(0, Math.round((animation.width - width) / 2))
  const top =
    anchor === 'top'
      ? 0
      : anchor === 'bottom'
        ? Math.max(0, animation.height - height)
        : Math.max(0, Math.round((animation.height - height) / 2))
  return mapCanvas(animation, width, height, (ctx, frame) => {
    ctx.drawImage(frame.canvas, left, top, width, height, 0, 0, width, height)
  })
}

function rotateAnimation(animation: Animation, transform: string): Animation {
  const swap = transform === '90' || transform === '270'
  const width = swap ? animation.height : animation.width
  const height = swap ? animation.width : animation.height
  return mapCanvas(animation, width, height, (ctx, frame) => {
    ctx.save()
    if (transform === '90') {
      ctx.translate(width, 0)
      ctx.rotate(Math.PI / 2)
    } else if (transform === '180') {
      ctx.translate(width, height)
      ctx.rotate(Math.PI)
    } else if (transform === '270') {
      ctx.translate(0, height)
      ctx.rotate(-Math.PI / 2)
    } else if (transform === 'hflip') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    } else if (transform === 'vflip') {
      ctx.translate(0, height)
      ctx.scale(1, -1)
    }
    ctx.drawImage(frame.canvas, 0, 0, animation.width, animation.height)
    ctx.restore()
  })
}

function applySkip(animation: Animation, skip: number): Animation {
  const indices = skipIndices(animation.frames.length, skip)
  if (indices.length === animation.frames.length) return animation
  return {
    ...animation,
    frames: indices.map((index) => {
      const frame = animation.frames[index]
      // When frames are dropped, hold each kept frame for the skipped time.
      const held = indices
        .slice(indices.indexOf(index), indices.indexOf(index) + skip)
        .reduce((sum, at) => sum + (animation.frames[at]?.delay ?? 0), 0)
      return { canvas: frame.canvas, delay: clampDelay(held || frame.delay) }
    }),
  }
}

/* ------------------------------------------------------------------ */
/* ops                                                                */
/* ------------------------------------------------------------------ */

async function imagesToGif(req: WorkerRequest): Promise<Result> {
  const params = req.params
  const delay = clampDelay(Number(params.delay) || 200)
  const loop = Math.max(0, Math.round(Number(params.loop ?? 0)))
  const targetWidth = Math.max(32, Math.round(Number(params.width) || 480))

  const frames: Frame[] = []
  for (let index = 0; index < req.inputs.length; index += 1) {
    const input = req.inputs[index]
    progress(Math.round((index / req.inputs.length) * 70), `frame ${index + 1}/${req.inputs.length}`)
    const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type || 'image/png' }))
    if (frames.length === 0) {
      const scale = Math.min(1, targetWidth / bitmap.width)
      const { canvas, ctx } = makeCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      frames.push({ canvas, delay })
      bitmap.close()
      continue
    }
    const first = frames[0]
    const { canvas, ctx } = makeCanvas(first.canvas.width, first.canvas.height)
    const scale = Math.max(first.canvas.width / bitmap.width, first.canvas.height / bitmap.height)
    const drawWidth = bitmap.width * scale
    const drawHeight = bitmap.height * scale
    ctx.drawImage(
      bitmap,
      (first.canvas.width - drawWidth) / 2,
      (first.canvas.height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    )
    frames.push({ canvas, delay })
    bitmap.close()
  }

  const animation: Animation = {
    frames,
    loop,
    width: frames[0].canvas.width,
    height: frames[0].canvas.height,
  }
  progress(75, 'encoding')
  const bytes = encodeAnimation(animation, 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] ${frames.length} frames at ${delay}ms`])
}

async function opCompress(req: WorkerRequest): Promise<Result> {
  const params = req.params
  const targetKb = Number(params.targetKb) || 0
  const globalPalette = params.optimizePalette !== false
  const requestedScale = clamp((Number(params.scale) || 100) / 100, 0.1, 1)
  const requestedSkip = clamp(Math.round(Number(params.dropFrames) || 1), 1, 4)

  const animation = await decodeAnimation(req.inputs[0])
  progress(55, 'decoding done')

  let settings: GifSettings = {
    ...INITIAL_GIF_SETTINGS,
    scale: requestedScale,
    skip: requestedSkip,
  }
  let best: Uint8Array | null = null
  let lastNote = ''

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const candidate = applySkip(
      settings.scale < 1
        ? resizeAnimation(animation, animation.width * settings.scale, animation.height * settings.scale, 'cover')
        : animation,
      settings.skip,
    )
    const bytes = encodeAnimation(candidate, settings.colors, globalPalette)
    best = bytes
    lastNote = describeSettings(settings)
    if (!targetKb || bytes.length <= targetKb * 1024) break
    const next = nextEscalation(settings)
    if (!next) break
    settings = next
    progress(60, `trying ${describeSettings(settings)}`)
  }

  if (!best) throw new Error('compression produced no output')
  const met = !targetKb || best.length <= targetKb * 1024
  return gifResult(req.inputs[0], best, [
    met
      ? `[+] target met with ${lastNote}`
      : `[!] target not reachable — smallest result uses ${lastNote}`,
    `[+] ${animation.frames.length} frames`,
  ])
}

async function opResize(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const params = req.params
  const requestedWidth = Math.round(Number(params.width) || 0)
  const requestedHeight = Math.round(Number(params.height) || 0)
  // A single dimension keeps the aspect ratio of the animation.
  const width =
    requestedWidth > 0
      ? requestedWidth
      : requestedHeight > 0
        ? Math.max(1, Math.round(animation.width * (requestedHeight / animation.height)))
        : animation.width
  const height =
    requestedHeight > 0
      ? requestedHeight
      : requestedWidth > 0
        ? Math.max(1, Math.round(animation.height * (requestedWidth / animation.width)))
        : animation.height
  const fit = (String(params.fit ?? 'cover') as 'cover' | 'contain' | 'stretch') ?? 'cover'
  progress(60, 'resizing frames')
  const bytes = encodeAnimation(resizeAnimation(animation, width, height, fit), 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] ${width}×${height} (${fit})`])
}

async function opCrop(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const cropped = cropAnimation(animation, String(req.params.ratio ?? '1:1'), String(req.params.anchor ?? 'center'))
  progress(60, 'encoding')
  const bytes = encodeAnimation(cropped, 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] ${cropped.width}×${cropped.height}`])
}

async function opRotate(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const rotated = rotateAnimation(animation, String(req.params.transform ?? '90'))
  progress(60, 'encoding')
  const bytes = encodeAnimation(rotated, 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] ${rotated.width}×${rotated.height}`])
}

async function opReverse(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const reversed: Animation = { ...animation, frames: [...animation.frames].reverse() }
  progress(60, 'encoding')
  const bytes = encodeAnimation(reversed, 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] ${reversed.frames.length} frames reversed`])
}

async function opSpeed(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const speed = clamp(Number(req.params.speed) || 2, 0.1, 5)
  const delays = retime(
    animation.frames.map((frame) => frame.delay),
    speed,
  )
  const sped: Animation = {
    ...animation,
    frames: animation.frames.map((frame, index) => ({ canvas: frame.canvas, delay: delays[index] })),
  }
  progress(60, 'encoding')
  const bytes = encodeAnimation(sped, 256, true)
  return gifResult(req.inputs[0], bytes, [
    `[+] ${speed}× speed — ${delays[0]}ms per frame`,
  ])
}

async function opTrim(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const range = (req.params.range ?? { start: 0, end: 0 }) as { start: number; end: number }
  const delays = animation.frames.map((frame) => frame.delay)
  const { from, to } = trimRange(delays, Number(range.start) * 1000, Number(range.end) * 1000)
  const trimmed: Animation = { ...animation, frames: animation.frames.slice(from, to + 1) }
  progress(60, 'encoding')
  const bytes = encodeAnimation(trimmed, 256, true)
  return gifResult(req.inputs[0], bytes, [
    `[+] kept frames ${from + 1}-${to + 1} of ${animation.frames.length}`,
  ])
}

async function opMerge(req: WorkerRequest): Promise<Result> {
  if (req.inputs.length < 2) throw new Error('merging needs at least two GIFs')
  const animations: Animation[] = []
  for (let index = 0; index < req.inputs.length; index += 1) {
    progress(10 + Math.round((index / req.inputs.length) * 40), `reading clip ${index + 1}`)
    animations.push(await decodeAnimation(req.inputs[index]))
  }

  const target = animations[0]
  const frames: Frame[] = []
  animations.forEach((animation) => {
    const fitted = resizeAnimation(animation, target.width, target.height, 'cover')
    frames.push(...fitted.frames)
  })

  const merged: Animation = { frames, loop: target.loop, width: target.width, height: target.height }
  progress(65, 'encoding')
  const bytes = encodeAnimation(merged, 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] ${animations.length} clips · ${frames.length} frames`])
}

async function opText(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const text = String(req.params.text ?? 'Your text')
  const position = String(req.params.position ?? 'bottom')
  const size = clamp(Number(req.params.size) || 8, 1, 40)
  const color = String(req.params.color ?? '#ffffff')
  const opacity = clamp(Number(req.params.opacity) || 100, 1, 100) / 100

  const withText = mapCanvas(animation, animation.width, animation.height, (ctx, frame) => {
    ctx.drawImage(frame.canvas, 0, 0)
    const fontSize = Math.max(10, Math.round((size / 100) * animation.height))
    ctx.font = `700 ${fontSize}px monospace`
    ctx.fillStyle = color
    ctx.globalAlpha = opacity
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = Math.max(2, fontSize * 0.15)
    const metrics = ctx.measureText(text)
    const margin = Math.round(animation.height * 0.04)
    const x = Math.round((animation.width - metrics.width) / 2)
    const y =
      position === 'top'
        ? margin + fontSize
        : position === 'center'
          ? Math.round(animation.height / 2)
          : animation.height - margin
    ctx.fillText(text, Math.max(2, x), y)
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  })

  progress(65, 'encoding')
  const bytes = encodeAnimation(withText, 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] text on ${withText.frames.length} frames`])
}

async function opBlur(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const mode = String(req.params.mode ?? 'gaussian')
  const radius = clamp(Number(req.params.radius) || 10, 1, 60)
  const coverColor = String(req.params.coverColor ?? '#201d1d')

  const blurred = mapCanvas(animation, animation.width, animation.height, (ctx, frame) => {
    if (mode === 'solid') {
      ctx.fillStyle = coverColor
      ctx.fillRect(0, 0, animation.width, animation.height)
      return
    }
    if (mode === 'pixelate') {
      const scale = Math.max(2, Math.round(radius / 2))
      const small = makeCanvas(Math.ceil(animation.width / scale), Math.ceil(animation.height / scale))
      small.ctx.imageSmoothingEnabled = false
      small.ctx.drawImage(frame.canvas, 0, 0, small.canvas.width, small.canvas.height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(small.canvas, 0, 0, animation.width, animation.height)
      return
    }
    ctx.filter = `blur(${radius}px)`
    ctx.drawImage(frame.canvas, -radius, -radius, animation.width + radius * 2, animation.height + radius * 2)
  })

  progress(65, 'encoding')
  const bytes = encodeAnimation(blurred, 256, true)
  return gifResult(req.inputs[0], bytes, [`[+] ${mode} applied to ${blurred.frames.length} frames`])
}

async function opExtractFrames(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const format = String(req.params.format ?? 'png') === 'jpg' ? 'image/jpeg' : 'image/png'
  const extension = format === 'image/jpeg' ? 'jpg' : 'png'
  const mode = String(req.params.mode ?? 'all')
  const base = stem(req.inputs[0].name)

  if (mode === 'first') {
    const frame = animation.frames[0]
    const blob = await frame.canvas.convertToBlob({ type: format, quality: 0.92 })
    progress(90, 'done')
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      type: format,
      name: `${base}-frame-1.${extension}`,
      notes: ['[+] first frame extracted'],
    }
  }

  const files: Record<string, Uint8Array> = {}
  for (let index = 0; index < animation.frames.length; index += 1) {
    progress(30 + Math.round((index / animation.frames.length) * 55), `frame ${index + 1}/${animation.frames.length}`)
    const blob = await animation.frames[index].canvas.convertToBlob({ type: format, quality: 0.92 })
    files[`${base}-${String(index + 1).padStart(3, '0')}.${extension}`] = new Uint8Array(await blob.arrayBuffer())
  }
  const zip = zipSync(files)
  return {
    bytes: zip,
    type: 'application/zip',
    name: `${base}-frames.zip`,
    notes: [`[+] ${animation.frames.length} frames packaged`],
  }
}

async function opSpriteSheet(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const columns = clamp(Math.round(Number(req.params.cols) || 5), 1, 12)
  const rows = Math.ceil(animation.frames.length / columns)
  const { canvas, ctx } = makeCanvas(animation.width * columns, animation.height * rows)
  animation.frames.forEach((frame, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    ctx.drawImage(frame.canvas, column * animation.width, row * animation.height)
  })
  progress(80, 'encoding sheet')
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    type: 'image/png',
    name: `${stem(req.inputs[0].name)}-sheet.png`,
    notes: [`[+] ${columns}×${rows} grid · ${animation.frames.length} frames`],
  }
}

async function opSpriteToGif(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type || 'image/png' }))
  const columns = clamp(Math.round(Number(req.params.cols) || 5), 1, 12)
  const rows = clamp(Math.round(Number(req.params.rows) || 4), 1, 12)
  const delay = clampDelay(Number(req.params.delay) || 120)
  const tileWidth = Math.floor(bitmap.width / columns)
  const tileHeight = Math.floor(bitmap.height / rows)

  const frames: Frame[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const { canvas, ctx } = makeCanvas(tileWidth, tileHeight)
      ctx.drawImage(
        bitmap,
        column * tileWidth,
        row * tileHeight,
        tileWidth,
        tileHeight,
        0,
        0,
        tileWidth,
        tileHeight,
      )
      frames.push({ canvas, delay })
    }
  }
  bitmap.close()

  const animation: Animation = { frames, loop: 0, width: tileWidth, height: tileHeight }
  progress(75, 'encoding')
  const bytes = encodeAnimation(animation, 256, true)
  return gifResult(input, bytes, [`[+] ${columns}×${rows} grid → ${frames.length} frames`])
}

async function opTypingText(req: WorkerRequest): Promise<Result> {
  const params = req.params
  const text = String(params.text ?? 'Hello')
  const width = clamp(Math.round(Number(params.width) || 640), 64, 1920)
  const height = clamp(Math.round(Number(params.height) || 240), 48, 1080)
  const fontSize = clamp(Math.round(Number(params.fontSize) || 48), 8, 200)
  const msPerChar = clamp(Math.round(Number(params.msPerChar) || 120), 20, 2000)
  const holdMs = clamp(Math.round(Number(params.holdMs) || 800), 20, 10_000)
  const color = String(params.color ?? '#fdfcfc')
  const background = String(params.background ?? '#201d1d')

  const frames: Frame[] = []
  for (let index = 0; index <= text.length; index += 1) {
    const { canvas, ctx } = makeCanvas(width, height)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
    ctx.font = `700 ${fontSize}px monospace`
    ctx.fillStyle = color
    const visible = text.slice(0, index)
    const metrics = ctx.measureText(text)
    const x = Math.round((width - metrics.width) / 2)
    ctx.fillText(visible, Math.max(4, x), Math.round(height / 2 + fontSize / 3))
    if (index < text.length) {
      // Blinking cursor: solid on even frames.
      if (index % 2 === 0) ctx.fillText('_', Math.max(4, x) + ctx.measureText(visible).width, Math.round(height / 2 + fontSize / 3))
    }
    frames.push({ canvas, delay: index === text.length ? holdMs : msPerChar })
    if (index % 8 === 0) progress(20 + Math.round((index / (text.length + 1)) * 50), `typing ${index}/${text.length}`)
  }

  const animation: Animation = { frames, loop: 0, width, height }
  progress(75, 'encoding')
  const bytes = encodeAnimation(animation, 128, true)
  return {
    bytes,
    type: 'image/gif',
    name: `${stem(text.slice(0, 24) || 'typing')}.gif`,
    notes: [`[+] ${frames.length} frames · ${msPerChar}ms per character`],
  }
}

async function opDiscordSticker(req: WorkerRequest): Promise<Result> {
  const animation = await decodeAnimation(req.inputs[0])
  const sized = resizeAnimation(animation, 320, 320, 'cover')
  const targetBytes = 512 * 1024
  let settings: GifSettings = { ...INITIAL_GIF_SETTINGS }
  let best: Uint8Array | null = null
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const candidate = applySkip(
      settings.scale < 1 ? resizeAnimation(sized, sized.width * settings.scale, sized.height * settings.scale, 'cover') : sized,
      settings.skip,
    )
    const bytes = encodeAnimation(candidate, settings.colors, true)
    best = bytes
    if (bytes.length <= targetBytes) break
    const next = nextEscalation(settings)
    if (!next) break
    settings = next
  }
  if (!best) throw new Error('sticker encoding produced no output')
  return gifResult(req.inputs[0], best, [
    best.length <= targetBytes
      ? `[+] Discord sticker ready — ${Math.round(best.length / 1024)}KB`
      : `[!] ${Math.round(best.length / 1024)}KB — still above the 512KB sticker limit`,
  ])
}

/* ------------------------------------------------------------------ */
/* dispatch                                                           */
/* ------------------------------------------------------------------ */

async function runOp(req: WorkerRequest): Promise<Result> {
  switch (req.op) {
    case 'images-to-gif':
      return imagesToGif(req)
    case 'compress':
      return opCompress(req)
    case 'resize':
      return opResize(req)
    case 'crop':
      return opCrop(req)
    case 'rotate':
      return opRotate(req)
    case 'reverse':
      return opReverse(req)
    case 'speed':
      return opSpeed(req)
    case 'trim':
      return opTrim(req)
    case 'merge':
      return opMerge(req)
    case 'text':
      return opText(req)
    case 'blur':
      return opBlur(req)
    case 'extract-frames':
      return opExtractFrames(req)
    case 'sprite-sheet':
      return opSpriteSheet(req)
    case 'sprite-to-gif':
      return opSpriteToGif(req)
    case 'typing-text':
      return opTypingText(req)
    case 'discord-sticker':
      return opDiscordSticker(req)
    default:
      throw new Error(`unknown gif op: ${req.op}`)
  }
}

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
