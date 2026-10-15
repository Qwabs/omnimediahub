/*
 * Local AI worker.
 *
 * Everything here runs on-device: models download once (cached by the
 * browser) and inference happens on your hardware — WebGPU when available,
 * WebAssembly otherwise.
 *
 * Ops: remove-background · upscale · unpixelate · inpaint · blur-people ·
 *      transcribe
 */
import type { WorkerRequest, WorkerResponse } from '../types'
import { ORT_WASM_PREFIX } from '../vendor'

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
    if (typeof message === 'string' && message.length > 0) return message
  }
  return String(error)
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const stem = (name: string) => name.replace(/\.[^.]+$/, '') || 'output'

type Result = { bytes: Uint8Array; type: string; name: string; notes?: string[] }

/* ------------------------------------------------------------------ */
/* transformers.js bootstrap                                          */
/* ------------------------------------------------------------------ */

type TransformersModule = typeof import('@huggingface/transformers')
let transformersPromise: Promise<TransformersModule> | null = null

/** Progress callback shape from transformers.js file downloads. */
type FileProgress = { status?: string; name?: string; file?: string; progress?: number; loaded?: number; total?: number }

function loadingCallback(label: string) {
  let announced = false
  return (event: FileProgress) => {
    if (event.status === 'progress' && typeof event.progress === 'number') {
      const percent = Math.round(event.progress)
      const megabytes = event.total ? ` (${(event.total / 1048576).toFixed(0)}MB)` : ''
      if (percent < 100) progress(10 + Math.round(percent * 0.35), `${label}: downloading${megabytes} ${percent}%`)
      else if (!announced) {
        announced = true
        progress(48, `${label}: downloaded, starting inference`)
      }
    } else if (event.status === 'ready') {
      progress(50, `${label}: ready`)
    }
  }
}

async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersPromise) {
    transformersPromise = (async () => {
      const module = await import('@huggingface/transformers')
      const env = module.env
      // Models come from the Hugging Face hub and are cached by the browser;
      // the ONNX runtime binaries load from a pinned jsDelivr prefix (they
      // exceed Cloudflare Pages' 25 MiB per-file limit — see ../vendor.ts).
      env.allowRemoteModels = true
      const wasm = env.backends?.onnx?.wasm
      if (wasm) {
        wasm.wasmPaths = ORT_WASM_PREFIX
        const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
        wasm.numThreads = Math.max(1, Math.min(4, cores - 1))
      }
      return module
    })().catch((error) => {
      transformersPromise = null
      throw error
    })
  }
  return transformersPromise
}

/** WebGPU when the browser exposes a usable adapter, WASM otherwise. */
async function pickDevice(module: TransformersModule): Promise<'webgpu' | 'wasm'> {
  if (!module.env.backends?.onnx?.wasm) return 'wasm'
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (gpu) {
      const adapter = await gpu.requestAdapter()
      if (adapter) return 'webgpu'
    }
  } catch {
    /* fall through to wasm */
  }
  return 'wasm'
}

/* ------------------------------------------------------------------ */
/* image helpers                                                      */
/* ------------------------------------------------------------------ */

async function bitmapOf(input: { data: ArrayBuffer; type: string }): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([input.data], { type: input.type || 'image/png' }))
}

async function toRawImage(module: TransformersModule, input: { data: ArrayBuffer; type: string }) {
  const bitmap = await bitmapOf(input)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return new module.RawImage(data.data, data.width, data.height, 4)
}

/** Convert a model output (RawImage or [1,3,H,W] tensor) to a canvas. */
function canvasFromModelOutput(output: unknown): OffscreenCanvas {
  const candidate = output as {
    data?: Uint8Array | Float32Array
    width?: number
    height?: number
    channels?: number
    dims?: number[]
    output?: unknown
  }
  // transformers.js v4 returns a RawImage for image-to-image pipelines.
  if (candidate?.data && candidate.width && candidate.height) {
    const channels = candidate.channels ?? 3
    const width = candidate.width
    const height = candidate.height
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    const image = ctx.createImageData(width, height)
    const source = candidate.data
    for (let i = 0; i < width * height; i += 1) {
      if (channels >= 4) {
        image.data[i * 4] = Number(source[i * 4])
        image.data[i * 4 + 1] = Number(source[i * 4 + 1])
        image.data[i * 4 + 2] = Number(source[i * 4 + 2])
        image.data[i * 4 + 3] = Number(source[i * 4 + 3])
      } else {
        const value = Number(source[i * channels])
        image.data[i * 4] = value
        image.data[i * 4 + 1] = channels >= 2 ? Number(source[i * channels + 1]) : value
        image.data[i * 4 + 2] = channels >= 3 ? Number(source[i * channels + 2]) : value
        image.data[i * 4 + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  }

  // Fallback: a CHW float tensor in 0..1.
  const tensor = (candidate?.output ?? output) as { data: Float32Array; dims: number[] }
  if (!tensor?.dims) throw new Error('model returned no image')
  const dims = tensor.dims
  const height = dims.length === 4 ? dims[2] : dims[1]
  const width = dims.length === 4 ? dims[3] : dims[2]
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < width * height; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      image.data[i * 4 + c] = clamp(Math.round(Number(tensor.data[c * width * height + i]) * 255), 0, 255)
    }
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

async function canvasToBytes(canvas: OffscreenCanvas, type = 'image/png', quality = 0.95): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type, quality })
  return new Uint8Array(await blob.arrayBuffer())
}

/* ------------------------------------------------------------------ */
/* ops: segmentation, super-resolution                                */
/* ------------------------------------------------------------------ */

const SEGMENTATION_MODEL = 'Xenova/modnet'
const SR_MODELS = {
  '2': 'Xenova/swin2SR-classical-sr-x2-64',
  '4': 'Xenova/swin2SR-classical-sr-x4-64',
} as const

async function opRemoveBackground(req: WorkerRequest): Promise<Result> {
  const module = await loadTransformers()
  const device = await pickDevice(module)
  progress(10, `preparing segmentation model (${device})`)
  const segmenter = await module.pipeline('image-segmentation', SEGMENTATION_MODEL, {
    device,
    progress_callback: loadingCallback('background model'),
  })

  const input = req.inputs[0]
  const raw = await toRawImage(module, input)
  progress(55, 'finding the subject')
  const output = (await segmenter(raw)) as { mask: { data: Uint8Array; width: number; height: number; channels?: number } }[]
  if (!output || output.length === 0) throw new Error('the model found no subject')
  const mask = output[0].mask

  // Segmentation masks come back as single-channel images — expand to RGBA.
  const maskChannels = mask.channels ?? 1
  const maskFull = new OffscreenCanvas(mask.width, mask.height)
  const maskFullCtx = maskFull.getContext('2d')
  if (!maskFullCtx) throw new Error('2d context unavailable')
  const maskImage = maskFullCtx.createImageData(mask.width, mask.height)
  for (let i = 0; i < mask.width * mask.height; i += 1) {
    const value = maskChannels >= 2 ? Number(mask.data[i * maskChannels]) : Number(mask.data[i])
    maskImage.data[i * 4] = value
    maskImage.data[i * 4 + 1] = value
    maskImage.data[i * 4 + 2] = value
    maskImage.data[i * 4 + 3] = 255
  }
  maskFullCtx.putImageData(maskImage, 0, 0)

  const bitmap = await bitmapOf(input)
  const source = new OffscreenCanvas(bitmap.width, bitmap.height)
  const sourceCtx = source.getContext('2d')
  if (!sourceCtx) throw new Error('2d context unavailable')
  sourceCtx.drawImage(bitmap, 0, 0)

  const maskCanvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const maskCtx = maskCanvas.getContext('2d')
  if (!maskCtx) throw new Error('2d context unavailable')
  maskCtx.imageSmoothingQuality = 'high'
  maskCtx.drawImage(maskFull, 0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
  const imageData = sourceCtx.getImageData(0, 0, source.width, source.height)
  const refine = req.params.refineEdges !== false
  const background = String(req.params.background ?? '')

  progress(80, 'compositing cutout')
  const out = new OffscreenCanvas(source.width, source.height)
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('2d context unavailable')
  if (background) {
    outCtx.fillStyle = background
    outCtx.fillRect(0, 0, out.width, out.height)
  }

  const result = outCtx.createImageData(source.width, source.height)
  for (let i = 0; i < result.data.length; i += 4) {
    const alpha = maskData.data[i] // MODNet's mask is greyscale
    // Optional edge refinement: compress near-transparent values slightly so
    // halos around hair fade instead of fringing.
    const shaped = refine ? clamp((alpha - 8) / 0.9, 0, 255) : alpha
    result.data[i] = imageData.data[i]
    result.data[i + 1] = imageData.data[i + 1]
    result.data[i + 2] = imageData.data[i + 2]
    result.data[i + 3] = shaped
  }
  outCtx.putImageData(result, 0, 0)

  progress(95, 'encoding png')
  return {
    bytes: await canvasToBytes(out),
    type: 'image/png',
    name: `${stem(input.name)}-cutout.png`,
    notes: [`[+] ran on ${device}`, background ? `[+] background replaced with ${background}` : '[+] transparent background'],
  }
}

async function opUpscale(req: WorkerRequest): Promise<Result> {
  const module = await loadTransformers()
  const device = await pickDevice(module)
  const factor = String(req.params.factor ?? '2') === '4' ? '4' : '2'
  const model = SR_MODELS[factor]
  progress(10, `preparing ${factor}× super-resolution model (${device})`)
  const upscaler = await module.pipeline('image-to-image', model, {
    device,
    progress_callback: loadingCallback(`${factor}× upscaler`),
  })

  const input = req.inputs[0]
  const raw = await toRawImage(module, input)
  progress(55, `upscaling ${factor}×`)
  const output = await upscaler(raw)
  const canvas = canvasFromModelOutput(output)

  progress(95, 'encoding png')
  return {
    bytes: await canvasToBytes(canvas),
    type: 'image/png',
    name: `${stem(input.name)}-${factor}x.png`,
    notes: [`[+] ran on ${device}`, `[+] output ${canvas.width}×${canvas.height}`],
  }
}

/** Unpixelate = super-resolve, then scale back to the original dimensions. */
async function opUnpixelate(req: WorkerRequest): Promise<Result> {
  const module = await loadTransformers()
  const device = await pickDevice(module)
  const strength = clamp(Number(req.params.strength) || 50, 1, 100)
  const factor = strength > 60 ? '4' : '2'
  progress(10, `preparing restoration model (${device})`)
  const upscaler = await module.pipeline('image-to-image', SR_MODELS[factor], {
    device,
    progress_callback: loadingCallback('restoration model'),
  })

  const input = req.inputs[0]
  const raw = await toRawImage(module, input)
  progress(55, 'hallucinating detail')
  const output = await upscaler(raw)
  const hiRes = canvasFromModelOutput(output)
  const bitmap = await bitmapOf(input)
  const out = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(hiRes, 0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  progress(95, 'encoding png')
  return {
    bytes: await canvasToBytes(out),
    type: 'image/png',
    name: `${stem(input.name)}-restored.png`,
    notes: [`[+] ran on ${device}`, `[+] restored at the original size (${out.width}×${out.height})`],
  }
}

/* ------------------------------------------------------------------ */
/* op: classical inpainting (no model download)                       */
/* ------------------------------------------------------------------ */

/** Fill masked pixels outward from the boundary, then smooth the result. */
function inpaint(image: ImageData, mask: Uint8Array, width: number, height: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(image.data), width, height)
  const data = out.data
  const filled = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i += 1) filled[i] = mask[i] ? 0 : 1

  // Distance-ordered fill: repeatedly fill pixels adjacent to known ones with
  // the average of their known neighbours (a fast-marching style inpaint).
  const queue: number[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (filled[index]) continue
      if (
        (x > 0 && filled[index - 1]) ||
        (x < width - 1 && filled[index + 1]) ||
        (y > 0 && filled[index - width]) ||
        (y < height - 1 && filled[index + width])
      ) {
        queue.push(index)
      }
    }
  }

  let cursor = 0
  while (cursor < queue.length) {
    const index = queue[cursor]
    cursor += 1
    if (filled[index]) continue
    const x = index % width
    const y = (index - x) / width
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ]
    for (const neighbour of neighbours) {
      if (neighbour < 0 || !filled[neighbour]) continue
      r += data[neighbour * 4]
      g += data[neighbour * 4 + 1]
      b += data[neighbour * 4 + 2]
      count += 1
    }
    if (count === 0) {
      queue.push(index) // retry after neighbours have values
      continue
    }
    data[index * 4] = r / count
    data[index * 4 + 1] = g / count
    data[index * 4 + 2] = b / count
    data[index * 4 + 3] = 255
    filled[index] = 1
    if (x > 0 && !filled[index - 1]) queue.push(index - 1)
    if (x < width - 1 && !filled[index + 1]) queue.push(index + 1)
    if (y > 0 && !filled[index - width]) queue.push(index - width)
    if (y < height - 1 && !filled[index + width]) queue.push(index + width)
  }

  // Smooth only the filled region so seams disappear without blurring detail.
  const passes = 12
  const buffer = new Uint8ClampedArray(data.length)
  for (let pass = 0; pass < passes; pass += 1) {
    buffer.set(data)
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x
        if (mask[index]) continue
        for (let c = 0; c < 3; c += 1) {
          const at = index * 4 + c
          data[at] = Math.round(
            (buffer[at] * 4 +
              buffer[(index - 1) * 4 + c] +
              buffer[(index + 1) * 4 + c] +
              buffer[(index - width) * 4 + c] +
              buffer[(index + width) * 4 + c]) /
              8,
          )
        }
      }
    }
  }

  return out
}

async function opInpaint(req: WorkerRequest): Promise<Result> {
  const input = req.inputs[0]
  const maskInput = req.inputs[1]
  if (!maskInput) throw new Error('paint over what should be removed first (no mask received)')

  progress(20, 'reading image and mask')
  const bitmap = await bitmapOf(input)
  const width = bitmap.width
  const height = bitmap.height
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const imageData = ctx.getImageData(0, 0, width, height)

  const maskBitmap = await bitmapOf(maskInput)
  const maskCanvas = new OffscreenCanvas(width, height)
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!maskCtx) throw new Error('2d context unavailable')
  maskCtx.drawImage(maskBitmap, 0, 0, width, height)
  maskBitmap.close()
  const maskData = maskCtx.getImageData(0, 0, width, height)
  const mask = new Uint8Array(width * height)
  let masked = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (maskData.data[i * 4 + 3] > 20) {
      mask[i] = 1
      masked += 1
    }
  }
  if (masked === 0) throw new Error('the mask is empty — paint over the object to remove')

  progress(40, `filling ${masked.toLocaleString()} painted pixels`)
  const result = inpaint(imageData, mask, width, height)
  ctx.putImageData(result, 0, 0)

  progress(90, 'encoding png')
  return {
    bytes: await canvasToBytes(canvas),
    type: 'image/png',
    name: `${stem(input.name)}-filled.png`,
    notes: [
      `[ ] classical fill (no model download) — ${masked.toLocaleString()} pixels repaired`,
      '[ ] for complex textures an AI diffusion model is better; this works best on watermarks, text and thin objects',
    ],
  }
}

/* ------------------------------------------------------------------ */
/* op: person detection + blur (privacy)                              */
/* ------------------------------------------------------------------ */

const OBJECT_MODEL = 'Xenova/yolos-tiny'

type Detection = {
  label: string
  score: number
  box: { xmin: number; ymin: number; xmax: number; ymax: number }
}

async function opBlurPeople(req: WorkerRequest): Promise<Result> {
  const module = await loadTransformers()
  const device = await pickDevice(module)
  const effect = String(req.params.effect ?? 'blur')
  const strength = clamp(Number(req.params.strength) || 60, 1, 100)
  const expand = req.params.expand !== false
  const threshold = clamp(Number(req.params.threshold) || 55, 20, 95) / 100

  progress(10, `preparing person detection model (${device})`)
  const detector = await module.pipeline('object-detection', OBJECT_MODEL, {
    device,
    progress_callback: loadingCallback('person model'),
  })

  const input = req.inputs[0]
  const raw = await toRawImage(module, input)
  progress(50, 'looking for people')
  const detected = (await detector(raw, { threshold })) as Detection[]
  const people = (detected ?? []).filter((item) => item.label === 'person')

  const bitmap = await bitmapOf(input)
  const width = bitmap.width
  const height = bitmap.height
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const notes: string[] = [`[+] ran on ${device} (${OBJECT_MODEL.split('/')[1]})`]
  if (people.length === 0) {
    notes.push(`[ ] no people detected above ${Math.round(threshold * 100)}% confidence — image unchanged`)
  } else {
    for (const person of people) {
      const grow = expand ? 0.15 : 0
      const boxWidth = (person.box.xmax - person.box.xmin) * (1 + grow)
      const boxHeight = (person.box.ymax - person.box.ymin) * (1 + grow)
      const x = clamp(person.box.xmin - (boxWidth - (person.box.xmax - person.box.xmin)) / 2, 0, width)
      const y = clamp(person.box.ymin - (boxHeight - (person.box.ymax - person.box.ymin)) / 2, 0, height)
      const w = clamp(boxWidth, 1, width - x)
      const h = clamp(boxHeight, 1, height - y)

      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      if (effect === 'solid') {
        ctx.fillStyle = String(req.params.coverColor ?? '#201d1d')
        ctx.fillRect(x, y, w, h)
      } else if (effect === 'pixelate') {
        const scale = Math.max(4, Math.round((strength / 100) * Math.min(w, h) * 0.15))
        const small = new OffscreenCanvas(Math.max(1, Math.ceil(w / scale)), Math.max(1, Math.ceil(h / scale)))
        const smallCtx = small.getContext('2d')
        if (smallCtx) {
          smallCtx.imageSmoothingEnabled = false
          smallCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height)
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(small, x, y, w, h)
        }
      } else {
        const radius = Math.max(4, Math.round((strength / 100) * Math.min(w, h) * 0.12))
        ctx.filter = `blur(${radius}px)`
        ctx.drawImage(ctx.canvas, x, y, w, h, x, y, w, h)
        ctx.filter = 'none'
      }
      ctx.restore()
    }
    notes.push(`[+] ${people.length} person${people.length === 1 ? '' : 's'} covered (${effect}, ≥${Math.round(threshold * 100)}% confidence)`)
    notes.push('[ ] the whole detected body is covered — stronger privacy than blurring only the face')
  }

  progress(90, 'encoding')
  return {
    bytes: await canvasToBytes(canvas),
    type: 'image/png',
    name: `${stem(input.name)}-people.png`,
    notes,
  }
}

/* ------------------------------------------------------------------ */
/* op: speech transcription (Whisper)                                 */
/* ------------------------------------------------------------------ */

const WHISPER_MODELS: Record<string, string> = {
  tiny: 'Xenova/whisper-tiny.en',
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
}

const formatTimestamp = (seconds: number, separator = ','): string => {
  const total = Math.max(0, seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = Math.floor(total % 60)
  const millis = Math.round((total - Math.floor(total)) * 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`
}

async function opTranscribe(req: WorkerRequest): Promise<Result> {
  const module = await loadTransformers()
  const device = await pickDevice(module)
  const modelKey = String(req.params.model ?? 'base')
  const model = WHISPER_MODELS[modelKey] ?? WHISPER_MODELS.base
  progress(8, `preparing ${modelKey} Whisper model (${device})`)
  const transcriber = await module.pipeline('automatic-speech-recognition', model, {
    device,
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    progress_callback: loadingCallback('speech model'),
  })

  const input = req.inputs[0]
  if (input.type !== 'audio/raw-f32') throw new Error('transcription needs decoded audio')
  const pcm = new Float32Array(input.data)

  progress(50, `transcribing ${(pcm.length / 16000).toFixed(1)}s of audio`)
  const language = String(req.params.language ?? 'auto')
  const options: Record<string, unknown> = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  }
  if (language !== 'auto') options.language = language
  const output = (await transcriber(pcm, options)) as {
    text?: string
    chunks?: { text: string; timestamp: [number, number | null] }[]
  }

  const text = (output.text ?? '').trim()
  const chunks = output.chunks ?? []
  const format = String(req.params.format ?? 'txt')
  let body = text
  let extension = 'txt'
  let type = 'text/plain'

  if (format === 'srt') {
    extension = 'srt'
    body = (chunks.length > 0 ? chunks : [{ text, timestamp: [0, null] as [number, null] }])
      .map((chunk, index) => {
        const start = chunk.timestamp?.[0] ?? 0
        const end = chunk.timestamp?.[1] ?? start + 2
        return `${index + 1}\n${formatTimestamp(start)} --> ${formatTimestamp(end)}\n${chunk.text.trim()}\n`
      })
      .join('\n')
  } else if (format === 'vtt') {
    extension = 'vtt'
    type = 'text/vtt'
    body = `WEBVTT\n\n${(chunks.length > 0 ? chunks : [{ text, timestamp: [0, null] as [number, null] }])
      .map((chunk) => {
        const start = chunk.timestamp?.[0] ?? 0
        const end = chunk.timestamp?.[1] ?? start + 2
        return `${formatTimestamp(start, '.')} --> ${formatTimestamp(end, '.')}\n${chunk.text.trim()}\n`
      })
      .join('\n')}`
  }

  progress(95, 'writing transcript')
  const notes = [
    `[+] ran on ${device} · ${modelKey} model`,
    text.length > 0 ? `[+] transcript: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''}` : '[ ] no speech detected',
  ]
  return {
    bytes: new TextEncoder().encode(body),
    type,
    name: `${stem(input.name)}.${extension}`,
    notes,
  }
}

/* ------------------------------------------------------------------ */
/* dispatch                                                           */
/* ------------------------------------------------------------------ */

async function runOp(req: WorkerRequest): Promise<Result> {
  switch (req.op) {
    case 'remove-background':
      return opRemoveBackground(req)
    case 'upscale':
      return opUpscale(req)
    case 'unpixelate':
      return opUnpixelate(req)
    case 'inpaint':
      return opInpaint(req)
    case 'blur-people':
      return opBlurPeople(req)
    case 'transcribe':
      return opTranscribe(req)
    default:
      throw new Error(`unknown ai op: ${req.op}`)
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
      { id: req.id, kind: 'done', output: { name: result.name, type: result.type, data, notes: result.notes } },
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
