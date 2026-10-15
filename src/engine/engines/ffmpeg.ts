/*
 * FFmpeg engine (video).
 *
 * @ffmpeg/ffmpeg runs the WASM core inside its own worker, so this engine is
 * driven from the main thread and serialised by `createSerialRunner`. The
 * core loader and wrapper are served same-origin from /ffmpeg; the ~31 MB
 * core wasm comes from a pinned jsDelivr URL (see `../vendor.ts`).
 *
 * Text watermarks and burned-in subtitles are rendered to PNGs on a canvas
 * and composited with `overlay` — the wasm build ships no fonts, and this
 * keeps styling fully in our control.
 *
 * Ops: trim · convert · compress · crop · resize · rotate · speed · volume ·
 *      watermark · merge · thumbnails · to-audio · subtitles ·
 *      to-gif · from-gif
 */
import { zipSync } from 'fflate'
import { EngineError } from '../types'
import { FFMPEG_CORE_WASM_URL } from '../vendor'
import { mergeAdjacentCues, parseSubtitles, wrapText } from './srt'
import type { JobInput, JobOutput, JobRequest } from '../types'

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg

let instance: Promise<FFmpegInstance> | null = null
let progressReporter: ((progress: number, note?: string) => void) | null = null
let logTail: string[] = []
let buildConfig: string | null = null

const log = (message: string) => {
  logTail.push(message)
  if (logTail.length > 40) logTail.shift()
}

async function load(): Promise<FFmpegInstance> {
  if (!instance) {
    instance = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const ffmpeg = new FFmpeg()
      ffmpeg.on('progress', ({ progress }) => {
        const percent = Math.max(1, Math.min(99, Math.round((progress || 0) * 100)))
        progressReporter?.(percent, 'transcoding')
      })
      ffmpeg.on('log', ({ message }) => log(message))
      await ffmpeg.load({
        coreURL: '/ffmpeg/ffmpeg-core.js',
        wasmURL: FFMPEG_CORE_WASM_URL,
        classWorkerURL: '/ffmpeg/ffmpeg-worker.js',
      })
      // Capture the build configuration once — it tells us which libraries
      // (libx264, libass, libopus, …) this core was compiled with.
      logTail = []
      await ffmpeg.exec(['-hide_banner', '-buildconf']).catch(() => undefined)
      buildConfig = logTail.join('\n')
      logTail = []
      return ffmpeg
    })().catch((error) => {
      instance = null
      throw error
    })
  }
  return instance
}

/** Does the compiled core include a library (`libx264`, `libass`, …)? */
export function ffmpegSupports(library: string): boolean {
  return buildConfig?.includes(`--enable-${library}`) ?? false
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const extensionOf = (name: string, fallback: string): string => {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : fallback
}

const TYPE_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  gif: 'image/gif',
  webp: 'image/webp',
  apng: 'image/apng',
  png: 'image/png',
  jpg: 'image/jpeg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  zip: 'application/zip',
}

/* ------------------------------------------------------------------ */
/* canvas renderers (no fonts needed: we draw and overlay)            */
/* ------------------------------------------------------------------ */

type RenderedPng = { bytes: Uint8Array; width: number; height: number }

async function encodeCanvas(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

async function renderTextWatermark(params: Record<string, unknown>): Promise<RenderedPng> {
  const text = String(params.text ?? '© Your Name')
  const fontSize = clamp(Math.round(Number(params.fontSize) || 32), 8, 200)
  const color = String(params.color ?? '#ffffff')
  const opacity = clamp(Number(params.opacity) || 70, 1, 100) / 100
  const tiled = String(params.position ?? 'bottom-right') === 'tile'

  const probe = new OffscreenCanvas(8, 8).getContext('2d')
  if (!probe) throw new EngineError('canvas unavailable for watermark rendering')
  probe.font = `700 ${fontSize}px monospace`
  const metrics = probe.measureText(text)
  const padding = Math.round(fontSize * 0.5)

  if (tiled) {
    // A full-FD-sized tile pattern covers any frame up to 1080p.
    const width = 1920
    const height = 1080
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new EngineError('canvas unavailable')
    ctx.font = `700 ${fontSize}px monospace`
    ctx.fillStyle = color
    ctx.globalAlpha = opacity
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = Math.max(2, fontSize * 0.15)
    const stepX = Math.ceil(metrics.width) + fontSize * 3
    const stepY = fontSize * 5
    for (let y = padding; y < height; y += stepY) {
      for (let x = -stepX; x < width; x += stepX) ctx.fillText(text, x, y)
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    return { bytes: await encodeCanvas(canvas), width, height }
  }

  const width = Math.ceil(metrics.width) + padding * 2
  const height = Math.ceil(fontSize * 1.4) + padding * 2
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new EngineError('canvas unavailable')
  ctx.font = `700 ${fontSize}px monospace`
  ctx.textBaseline = 'top'
  ctx.fillStyle = color
  ctx.globalAlpha = opacity
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = Math.max(2, fontSize * 0.15)
  ctx.fillText(text, padding, padding)
  return { bytes: await encodeCanvas(canvas), width, height }
}

async function renderLogoWatermark(input: JobInput, params: Record<string, unknown>): Promise<RenderedPng> {
  const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type || 'image/png' }))
  const width = clamp(Math.round(Number(params.logoWidth) || 160), 16, 2048)
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width))
  const opacity = clamp(Number(params.opacity) || 70, 1, 100) / 100
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new EngineError('canvas unavailable')
  ctx.globalAlpha = opacity
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { bytes: await encodeCanvas(canvas), width, height }
}

async function renderCuePng(text: string, opts: { fontSize: number; color: string; background: string }): Promise<RenderedPng> {
  const wrapped = wrapText(text.replace(/\n/g, ' '), 60)
  const lines = wrapped.split('\n')
  const lineHeight = Math.round(opts.fontSize * 1.35)
  const probe = new OffscreenCanvas(8, 8).getContext('2d')
  if (!probe) throw new EngineError('canvas unavailable')
  probe.font = `700 ${opts.fontSize}px monospace`
  const widest = Math.max(...lines.map((line) => probe.measureText(line).width))
  const paddingX = Math.round(opts.fontSize * 0.8)
  const paddingY = Math.round(opts.fontSize * 0.45)
  const width = Math.min(1600, Math.ceil(widest) + paddingX * 2)
  const height = lines.length * lineHeight + paddingY * 2

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new EngineError('canvas unavailable')
  ctx.fillStyle = opts.background
  ctx.fillRect(0, 0, width, height)
  ctx.font = `700 ${opts.fontSize}px monospace`
  ctx.fillStyle = opts.color
  ctx.textBaseline = 'top'
  lines.forEach((line, index) => {
    const metrics = ctx.measureText(line)
    ctx.fillText(line, Math.round((width - metrics.width) / 2), paddingY + index * lineHeight)
  })
  return { bytes: await encodeCanvas(canvas), width, height }
}

/* ------------------------------------------------------------------ */
/* command plans                                                      */
/* ------------------------------------------------------------------ */

type PlannedOutput =
  | { kind: 'single'; path: string; name: string; type: string }
  | { kind: 'glob'; dir: string; prefix: string; suffix: string; zipName: string; type: string }

type Plan = {
  args: string[]
  outputs: PlannedOutput[]
  prepared: string[]
  notes?: string[]
  /** Retried when the first attempt fails (e.g. a source with no audio). */
  audioFallback?: string[]
  /** Note appended when the fallback path is used. */
  fallbackNote?: string
  /** Clearer message when the first attempt fails and there is no fallback. */
  fallbackError?: string
}

const isImageInput = (input: JobInput): boolean =>
  input.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|heic)$/i.test(input.name)
void isImageInput

async function prepareAssets(
  req: JobRequest,
  ffmpeg: FFmpegInstance,
): Promise<{ inputs: string[]; files: string[]; notes: string[]; cues: { start: number; end: number }[] }> {
  const inputs: string[] = []
  const files: string[] = []
  const notes: string[] = []
  const cues: { start: number; end: number }[] = []

  if (req.op === 'watermark') {
    const type = String(req.params.type ?? 'text')
    const rendered =
      type === 'image'
        ? await renderLogoWatermark(
            req.inputs[1] ?? (() => {
              throw new EngineError('no watermark image provided')
            })(),
            req.params,
          )
        : await renderTextWatermark(req.params)
    await ffmpeg.writeFile('watermark.png', rendered.bytes)
    files.push('watermark.png')
    inputs.push('-loop', '1', '-i', 'watermark.png')
    notes.push(`[+] watermark rendered ${rendered.width}×${rendered.height}`)
  }

  if (req.op === 'subtitles') {
    const asset = req.inputs[1]
    if (!asset) throw new EngineError('no subtitle file provided (.srt or .vtt)')
    const parsed = mergeAdjacentCues(parseSubtitles(new TextDecoder().decode(asset.data)))
    if (parsed.length === 0) throw new EngineError('no cues found in the subtitle file')
    const limited = parsed.slice(0, 200)
    const fontSize = clamp(Math.round(Number(req.params.fontSize) || 28), 12, 72)
    const color = String(req.params.color ?? '#ffffff')
    const background = String(req.params.background ?? '#00000099')

    for (let index = 0; index < limited.length; index += 1) {
      const cue = limited[index]
      const png = await renderCuePng(cue.text, { fontSize, color, background })
      const path = `cue-${index}.png`
      await ffmpeg.writeFile(path, png.bytes)
      files.push(path)
      inputs.push('-loop', '1', '-i', path)
      cues.push({ start: cue.start, end: cue.end })
    }
    notes.push(`[+] ${limited.length} subtitle cues rendered`)
  }

  return { inputs, files, notes, cues }
}

function overlayPosition(position: string): string {
  switch (position) {
    case 'top-left':
      return 'x=24:y=24'
    case 'top-right':
      return 'x=W-w-24:y=24'
    case 'bottom-left':
      return 'x=24:y=H-h-24'
    case 'center':
      return 'x=(W-w)/2:y=(H-h)/2'
    case 'tile':
      return 'x=0:y=0'
    default:
      return 'x=W-w-24:y=H-h-24'
  }
}

function buildPlan(
  req: JobRequest,
  inName: string,
  assets: { inputs: string[]; files: string[]; notes: string[]; cues: { start: number; end: number }[] },
): Plan {
  const params = req.params
  const inExt = extensionOf(inName, 'mp4')
  const videoEncoder = ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
  const notes: string[] = [...assets.notes]

  const single = (ext: string, stem: string): Extract<PlannedOutput, { kind: 'single' }> => ({
    kind: 'single',
    path: `output.${ext}`,
    name: `${stem}.${ext}`,
    type: TYPE_BY_EXT[ext] ?? 'application/octet-stream',
  })

  const stemOf = (input: JobInput) => input.name.replace(/\.[^.]+$/, '') || 'output'

  if (req.op === 'trim') {
    const range = (params.range ?? { start: 0, end: 0 }) as { start: number; end: number }
    const start = Math.max(0, Number(range.start) || 0)
    const end = Math.max(start, Number(range.end) || 0)
    const duration = Math.max(0.1, end - start)
    const seek = ['-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', inName]
    const lossless = params.lossless !== false
    const outExt = lossless ? inExt : 'mp4'
    const output = single(outExt, stemOf(req.inputs[0]))
    const args = lossless
      ? [...seek, '-c', 'copy', '-avoid_negative_ts', 'make_zero', output.path]
      : [...seek, ...videoEncoder, '-c:a', 'aac', output.path]
    return { args, outputs: [output], prepared: [output.path] }
  }

  if (req.op === 'convert') {
    const format = String(params.format ?? 'mp4')
    const crf = String(clamp(Number(params.crf) || 23, 0, 51))
    const resolution = params.resolution
    const scale = resolution && resolution !== 'source' ? ['-vf', `scale=-2:${Number(resolution) || 1080}`] : []
    if (format === 'webm') {
      return {
        args: ['-i', inName, ...scale, '-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-row-mt', '1', '-cpu-used', '5', '-c:a', 'libopus', 'output.webm'],
        outputs: [single('webm', stemOf(req.inputs[0]))],
        prepared: ['output.webm'],
      }
    }
    if (format === 'mov') {
      return {
        args: ['-i', inName, ...scale, ...videoEncoder, '-c:a', 'aac', 'output.mov'],
        outputs: [single('mov', stemOf(req.inputs[0]))],
        prepared: ['output.mov'],
      }
    }
    return {
      args: ['-i', inName, ...scale, ...videoEncoder, '-c:a', 'aac', 'output.mp4'],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
    }
  }

  if (req.op === 'compress') {
    const mode = String(params.mode ?? 'quality')
    const resolution = Number(params.resolution) || 0
    const scale = resolution > 0 ? ['-vf', `scale=-2:${resolution}`] : []
    const crf = String(clamp(Number(params.crf) || 26, 0, 51))
    const audio = params.stripAudio === true ? ['-an'] : ['-c:a', 'aac', '-b:a', '128k']
    return {
      args: ['-i', inName, ...scale, '-c:v', 'libx264', '-crf', crf, '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...audio, '-movflags', '+faststart', 'output.mp4'],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
      notes: mode === 'target-size' ? ['[ ] target-size mode adapts CRF across up to 4 passes'] : notes,
    }
  }

  if (req.op === 'crop') {
    const ratio = String(params.ratio ?? 'free')
    const centered = params.center !== false
    const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
    let filter: string
    if (ratio !== 'free' && ratioWidth > 0 && ratioHeight > 0) {
      filter = `crop='min(iw,ih*${ratioWidth}/${ratioHeight})':'min(ih,iw*${ratioHeight}/${ratioWidth})':'${centered ? '(iw-ow)/2' : '0'}':'${centered ? '(ih-oh)/2' : '0'}'`
    } else {
      const width = Math.max(2, Math.round(Number(params.width) || 640))
      const height = Math.max(2, Math.round(Number(params.height) || 640))
      const x = String(params.x ?? '(iw-ow)/2')
      const y = String(params.y ?? '(ih-oh)/2')
      filter = `crop=${width}:${height}:${x}:${y}`
    }
    return {
      args: ['-i', inName, '-vf', filter, ...videoEncoder, '-c:a', 'aac', 'output.mp4'],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
    }
  }

  if (req.op === 'resize') {
    const width = Math.max(2, Math.round(Number(params.width) || 1080))
    const height = Math.max(2, Math.round(Number(params.height) || 1920))
    const fit = String(params.fit ?? 'contain')
    const color = String(params.padColor ?? '#000000').replace('#', '0x')
    const filters: Record<string, string> = {
      contain: `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${color}`,
      cover: `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
      stretch: `scale=${width}:${height}`,
    }
    return {
      args: ['-i', inName, '-vf', filters[fit] ?? filters.contain, ...videoEncoder, '-c:a', 'aac', 'output.mp4'],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
    }
  }

  if (req.op === 'rotate') {
    const transform = String(params.transform ?? '90')
    const filters: Record<string, string> = {
      '90': 'transpose=1',
      '180': 'transpose=1,transpose=1',
      '270': 'transpose=2',
      hflip: 'hflip',
      vflip: 'vflip',
    }
    return {
      args: ['-i', inName, '-vf', filters[transform] ?? 'transpose=1', ...videoEncoder, '-c:a', 'aac', 'output.mp4'],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
    }
  }

  if (req.op === 'speed') {
    const speed = clamp(Number(params.speed) || 2, 0.25, 4)
    // atempo accepts 0.5–2, so extreme speeds are chained.
    const audioFilters: string[] = []
    let remaining = speed
    while (remaining > 2) {
      audioFilters.push('atempo=2')
      remaining /= 2
    }
    while (remaining < 0.5) {
      audioFilters.push('atempo=0.5')
      remaining /= 0.5
    }
    audioFilters.push(`atempo=${remaining.toFixed(3)}`)
    const mute = params.mute === true
    const videoFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`
    const withAudio = ['-i', inName, '-filter_complex', `[0:v]${videoFilter}[v];[0:a]${audioFilters.join(',')}[a]`, '-map', '[v]', '-map', '[a]', '-c:a', 'aac', ...videoEncoder, 'output.mp4']
    const videoOnly = ['-i', inName, '-vf', videoFilter, '-an', ...videoEncoder, 'output.mp4']
    return {
      args: mute ? videoOnly : withAudio,
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
      notes: [...notes, `[+] ${speed}× speed${mute ? ' · audio muted' : ` · audio re-timed (${audioFilters.join(', ')})`}`],
      audioFallback: videoOnly,
      fallbackNote: '[!] the source has no audio track — output is video only',
    }
  }

  if (req.op === 'volume') {
    const gain = clamp(Number(params.gain) || 0, -30, 30)
    // The video is re-encoded rather than copied: stream copy would fail for
    // any input whose codec is not MP4-compatible (VP8/VP9 WebM, for example).
    if (params.mute === true) {
      return {
        args: ['-i', inName, ...videoEncoder, '-an', 'output.mp4'],
        outputs: [single('mp4', stemOf(req.inputs[0]))],
        prepared: ['output.mp4'],
        notes: ['[+] audio stripped'],
      }
    }
    const filters: string[] = []
    if (params.normalize === true) filters.push('loudnorm=I=-14:TP=-1.5:LRA=11')
    if (gain !== 0) filters.push(`volume=${gain}dB`)
    if (filters.length === 0) filters.push('volume=1.0')
    return {
      args: ['-i', inName, ...videoEncoder, '-af', filters.join(','), '-c:a', 'aac', 'output.mp4'],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
      notes: [...notes, `[+] audio: ${filters.join(', ')}`],
      audioFallback: ['-i', inName, ...videoEncoder, '-an', 'output.mp4'],
      fallbackNote: '[!] the source has no audio track — output is video only',
    }
  }

  if (req.op === 'watermark') {
    const position = overlayPosition(String(params.position ?? 'bottom-right'))
    // `shortest=1` ends the filtergraph with the real video: the watermark
    // input is an infinite -loop 1 image, so the muxer's -shortest is not
    // enough on its own.
    const complex = `[0:v][1:v]overlay=${position}:shortest=1[v]`
    return {
      args: [
        '-i', inName, ...assets.inputs,
        '-filter_complex', complex,
        '-map', '[v]', '-map', '0:a?',
        ...videoEncoder, '-c:a', 'copy',
        // The watermark input is an infinite loop; -shortest ends the encode
        // when the real video does.
        '-shortest',
        'output.mp4',
      ],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4', ...assets.files],
      notes,
      audioFallback: [
        '-i', inName, ...assets.inputs,
        '-filter_complex', complex,
        '-map', '[v]', '-an',
        ...videoEncoder, '-shortest', 'output.mp4',
      ],
      fallbackNote: '[!] the source has no audio track — output is video only',
    }
  }

  if (req.op === 'subtitles') {
    const cueCount = assets.cues.length
    if (cueCount === 0) throw new EngineError('no cues to burn in')
    // Overlays are chained in order; each one only shows during its cue.
    const chains: string[] = []
    let current = '[0:v]'
    for (let index = 0; index < cueCount; index += 1) {
      const cue = assets.cues[index]
      const label = index === cueCount - 1 ? '[vout]' : `[v${index}]`
      const enable = `enable='between(t,${cue.start.toFixed(3)},${cue.end.toFixed(3)})'`
      chains.push(`${current}[${index + 1}:v]overlay=x=(W-w)/2:y=H-h-40:${enable}:shortest=1${label}`)
      current = label
    }
    return {
      args: [
        '-i', inName, ...assets.inputs,
        '-filter_complex', chains.join(';'),
        '-map', '[vout]', '-map', '0:a?',
        ...videoEncoder, '-c:a', 'copy',
        // Cue images are looped; -shortest ends the encode with the video.
        '-shortest',
        'output.mp4',
      ],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4', ...assets.files],
      notes,
      audioFallback: [
        '-i', inName, ...assets.inputs,
        '-filter_complex', chains.map((chain) => chain).join(';'),
        '-map', '[vout]', '-an',
        ...videoEncoder, '-shortest', 'output.mp4',
      ],
      fallbackNote: '[!] the source has no audio track — output is video only',
    }
  }

  if (req.op === 'merge') {
    const count = req.inputs.length
    if (count < 2) throw new EngineError('merging needs at least two clips')
    // Normalise every clip, then concat with the filter.
    const inputs = req.inputs.flatMap((_, index) => ['-i', `merge-${index}.${extensionOf(req.inputs[index].name, 'mp4')}`])
    const videoChains: string[] = []
    const audioChains: string[] = []
    for (let index = 0; index < count; index += 1) {
      videoChains.push(
        `[${index}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${index}]`,
      )
      audioChains.push(`[${index}:a]aresample=48000[a${index}]`)
    }
    const withAudio = Array.from({ length: count }, (_, index) => `[v${index}][a${index}]`).join('')
    const videoOnly = Array.from({ length: count }, (_, index) => `[v${index}]`).join('')
    return {
      args: [
        ...inputs,
        '-filter_complex',
        [...videoChains, ...audioChains, `${withAudio}concat=n=${count}:v=1:a=1[vout][aout]`].join(';'),
        '-map', '[vout]', '-map', '[aout]',
        ...videoEncoder, '-c:a', 'aac', 'output.mp4',
      ],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
      notes: [...notes, `[+] ${count} clips normalised to 1280×720@30`],
      audioFallback: [
        ...inputs,
        '-filter_complex',
        [...videoChains, `${videoOnly}concat=n=${count}:v=1:a=0[vout]`].join(';'),
        '-map', '[vout]',
        ...videoEncoder, '-an', 'output.mp4',
      ],
      fallbackNote: '[!] clips have no audio track — merged video only',
    }
  }

  if (req.op === 'thumbnails') {
    const mode = String(params.mode ?? 'timestamp')
    const time = Math.max(0, Number(params.time) || 1)
    if (mode === 'interval') {
      const interval = Math.max(1, Number(params.interval) || 5)
      return {
        args: ['-i', inName, '-vf', `fps=1/${interval}`, '-frames:v', '600', 'thumb-%03d.png'],
        outputs: [{ kind: 'glob', dir: '/', prefix: 'thumb-', suffix: '.png', zipName: `${stemOf(req.inputs[0])}-frames.zip`, type: 'image/png' }],
        prepared: [],
        notes: [`[+] one frame every ${interval}s`],
      }
    }
    if (mode === 'contact-sheet') {
      const interval = Math.max(1, Number(params.interval) || 5)
      const columns = clamp(Math.round(Number(params.columns) || 4), 1, 8)
      const rows = clamp(Math.round(Number(params.rows) || 3), 1, 8)
      const frame = `fps=1/${interval},scale=320:-1,tile=${columns}x${rows}`
      return {
        args: ['-i', inName, '-vf', frame, '-frames:v', '1', 'output.png'],
        outputs: [single('png', stemOf(req.inputs[0]))],
        prepared: ['output.png'],
        notes: [`[+] contact sheet ${columns}×${rows}`],
      }
    }
    return {
      args: ['-ss', time.toFixed(3), '-i', inName, '-frames:v', '1', 'output.png'],
      outputs: [single('png', stemOf(req.inputs[0]))],
      prepared: ['output.png'],
      notes: [`[+] frame at ${time}s`],
    }
  }

  if (req.op === 'to-audio') {
    const format = String(params.format ?? 'mp3')
    const bitrate = String(clamp(Number(params.bitrate) || 192, 32, 320))
    const args = ['-i', inName, '-vn']
    let ext = 'mp3'
    if (format === 'wav') {
      args.push('-c:a', 'pcm_s16le')
      ext = 'wav'
    } else if (format === 'm4a') {
      args.push('-c:a', 'aac', '-b:a', `${bitrate}k`)
      ext = 'm4a'
    } else if (format === 'opus') {
      args.push('-c:a', 'libopus', '-b:a', `${bitrate}k`)
      ext = 'ogg'
    } else {
      args.push('-c:a', 'libmp3lame', '-b:a', `${bitrate}k`)
    }
    args.push(`output.${ext}`)
    return {
      args,
      outputs: [single(ext, stemOf(req.inputs[0]))],
      prepared: [`output.${ext}`],
      // A silent clip has no audio stream to map — say so plainly.
      fallbackError: 'this video has no audio track to extract',
    }
  }

  if (req.op === 'ringtone') {
    const range = (params.range ?? { start: 0, end: 30 }) as { start: number; end: number }
    const start = Math.max(0, Number(range.start) || 0)
    const end = Math.max(start + 1, Number(range.end) || start + 30)
    const duration = end - start
    const fade = clamp(Number(params.fade) || 500, 0, 5000) / 1000
    const format = String(params.format ?? 'm4a')
    const ext = format === 'mp3' ? 'mp3' : 'm4a'
    const codec = ext === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : ['-c:a', 'aac', '-b:a', '192k']
    const fadeOutStart = Math.max(0, duration - fade)
    const filter = fade > 0 ? `afade=t=in:st=0:d=${fade},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fade}` : 'anull'
    return {
      args: ['-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', inName, '-vn', '-af', filter, ...codec, `output.${ext}`],
      outputs: [single(ext, stemOf(req.inputs[0]))],
      prepared: [`output.${ext}`],
      notes: [
        `[+] ${duration.toFixed(1)}s clip${fade > 0 ? ` with ${Math.round(fade * 1000)}ms fades` : ''}`,
        ext === 'm4a' ? '[+] M4A is the format iPhone ringtones expect' : '[+] MP3 works on Android',
      ],
    }
  }

  if (req.op === 'to-gif') {
    const range = (params.range ?? {}) as { start?: number; end?: number }
    const start = Math.max(0, Number(range.start) || 0)
    const end = Number(range.end) || 0
    const duration = end > start ? Math.max(0.05, end - start) : 0
    const seek =
      duration > 0 ? ['-ss', start.toFixed(3), '-t', duration.toFixed(3)] : start > 0 ? ['-ss', start.toFixed(3)] : []
    const fps = clamp(Number(params.fps) || 12, 1, 50)
    const width = clamp(Number(params.width) || 480, 32, 1920)

    if (String(params.format ?? 'gif') === 'webp') {
      const quality = clamp(Number(params.quality) || 75, 1, 100)
      return {
        args: [...seek, '-i', inName, '-vf', `fps=${fps},scale=${width}:-2`, '-c:v', 'libwebp', '-loop', '0', '-q:v', String(quality), '-an', 'output.webp'],
        outputs: [single('webp', stemOf(req.inputs[0]))],
        prepared: ['output.webp'],
      }
    }

    // Two-pass palette recipe (single filtergraph): sample the clip, build a
    // 256-colour palette, then apply it — the standard quality GIF recipe.
    const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a`
    return {
      args: [...seek, '-i', inName, '-vf', filter, '-loop', '0', '-an', 'output.gif'],
      outputs: [single('gif', stemOf(req.inputs[0]))],
      prepared: ['output.gif'],
    }
  }

  if (req.op === 'from-gif') {
    const format = String(params.format ?? 'mp4')
    if (format === 'webp') {
      const quality = clamp(Number(params.quality) || 80, 1, 100)
      return {
        args: ['-i', inName, '-c:v', 'libwebp', '-loop', '0', '-q:v', String(quality), '-an', 'output.webp'],
        outputs: [single('webp', stemOf(req.inputs[0]))],
        prepared: ['output.webp'],
      }
    }
    if (format === 'apng') {
      return {
        args: ['-i', inName, '-c:v', 'apng', '-plays', '0', '-an', 'output.apng'],
        outputs: [single('apng', stemOf(req.inputs[0]))],
        prepared: ['output.apng'],
      }
    }
    const crf = String(clamp(Number(params.crf) || 20, 0, 51))
    return {
      args: ['-i', inName, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', crf, '-movflags', '+faststart', '-an', 'output.mp4'],
      outputs: [single('mp4', stemOf(req.inputs[0]))],
      prepared: ['output.mp4'],
      notes,
    }
  }

  throw new EngineError(`unknown ffmpeg op: ${req.op}`)
}

/* ------------------------------------------------------------------ */
/* execution                                                          */
/* ------------------------------------------------------------------ */

async function readSingle(ffmpeg: FFmpegInstance, path: string): Promise<Uint8Array> {
  const data = await ffmpeg.readFile(path)
  if (typeof data === 'string') throw new EngineError('unexpected text output from ffmpeg')
  return data as Uint8Array
}

async function run(
  req: JobRequest,
  opts: { onProgress?: (progress: number, note?: string) => void },
): Promise<JobOutput> {
  const ffmpeg = await load()
  progressReporter = opts.onProgress ?? null
  opts.onProgress?.(2, 'loading engine')

  const input = req.inputs[0]
  if (!input) throw new EngineError('no input')

  const sizeGb = input.data.byteLength / (1024 * 1024 * 1024)
  if (sizeGb > 1.2) {
    throw new EngineError(
      `file is ${sizeGb.toFixed(2)}GB — WebAssembly runs in a 32-bit memory space. Trim it first (lossless) or use a desktop tool.`,
    )
  }
  const notes: string[] = []
  if (input.data.byteLength > 300 * 1024 * 1024) {
    notes.push('[!] large file — ffmpeg.wasm keeps input and output in memory; expect slow processing')
  }

  const inExt = extensionOf(input.name, 'mp4')
  const inName = `input.${inExt}`

  if (req.op === 'merge') {
    // Merge references every clip by index. `writeFile` transfers the buffer,
    // so each input is written exactly once (index 0 included).
    for (let index = 0; index < req.inputs.length; index += 1) {
      const source = req.inputs[index]
      await ffmpeg.writeFile(`merge-${index}.${extensionOf(source.name, 'mp4')}`, new Uint8Array(source.data))
    }
  } else {
    await ffmpeg.writeFile(inName, new Uint8Array(input.data))
  }

  const assets = await prepareAssets(req, ffmpeg)
  const plan = buildPlan(req, inName, assets)

  try {
    if (req.op === 'compress' && String(req.params.mode ?? 'quality') === 'target-size') {
      return await compressToTarget(ffmpeg, req, inName, notes, opts)
    }

    progressReporter?.(5, 'transcoding')
    let code = await ffmpeg.exec(plan.args)
    if (code !== 0 && plan.audioFallback) {
      // Common case: the source has no audio track, so audio filter pads
      // cannot be resolved. Retry with the video-only graph.
      logTail = []
      progressReporter?.(5, 'retrying without audio')
      code = await ffmpeg.exec(plan.audioFallback)
      if (code === 0) notes.push(plan.fallbackNote ?? '[!] retried without audio')
    }
    if (code !== 0) {
      if (plan.fallbackError) throw new EngineError(plan.fallbackError)
      const tail = logTail.filter(Boolean).slice(-4).join(' | ')
      throw new EngineError(`ffmpeg exited with code ${code}${tail ? ` — ${tail}` : ''}`)
    }

    const output = plan.outputs[0]
    if (output.kind === 'single') {
      const bytes = await readSingle(ffmpeg, output.path)
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      return { name: output.name, type: output.type, data: buffer, notes: [...notes, ...(plan.notes ?? [])] }
    }

    // Glob output: read every matching file from the virtual filesystem.
    const entries = await ffmpeg.listDir(output.dir)
    const matching = entries
      .filter((entry) => !entry.isDir && entry.name.startsWith(output.prefix) && entry.name.endsWith(output.suffix))
      .map((entry) => entry.name)
      .sort()
    if (matching.length === 0) throw new EngineError('ffmpeg produced no frames')
    const files: Record<string, Uint8Array> = {}
    for (const name of matching) {
      files[name] = await readSingle(ffmpeg, `${output.dir === '/' ? '' : `${output.dir}/`}${name}`)
    }
    const zip = zipSync(files)
    const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
    return {
      name: output.zipName,
      type: 'application/zip',
      data: buffer,
      notes: [...notes, `[+] ${matching.length} frames packaged`, ...(plan.notes ?? [])],
    }
  } finally {
    progressReporter = null
    const cleanup = new Set([inName, ...plan.prepared, ...assets.files, 'watermark.png'])
    for (let index = 0; index < req.inputs.length; index += 1) {
      cleanup.add(`merge-${index}.${extensionOf(req.inputs[index].name, 'mp4')}`)
    }
    await Promise.allSettled([...cleanup].map((path) => ffmpeg.deleteFile(path)))
    logTail = []
  }
}

/** Target-size video compression: bisect CRF, then step resolution down. */
async function compressToTarget(
  ffmpeg: FFmpegInstance,
  req: JobRequest,
  inName: string,
  notes: string[],
  opts: { onProgress?: (progress: number, note?: string) => void },
): Promise<JobOutput> {
  const targetBytes = Math.max(64, Number(req.params.targetMb) || 25) * 1024 * 1024
  const resolutions = [0, 720, 480]
  let best: { bytes: Uint8Array; crf: number; resolution: number } | null = null

  for (const resolution of resolutions) {
    let crf = 26
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const path = `attempt-${resolution}-${attempt}.mp4`
      const scale = resolution > 0 ? ['-vf', `scale=-2:${resolution}`] : []
      opts.onProgress?.(10 + attempt * 15, `encoding at CRF ${crf}${resolution ? ` · ${resolution}p` : ''}`)
      const code = await ffmpeg.exec([
        '-i', inName, ...scale,
        '-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path,
      ])
      if (code !== 0) continue
      const bytes = await readSingle(ffmpeg, path)
      await ffmpeg.deleteFile(path).catch(() => undefined)
      if (!best || (bytes.byteLength <= targetBytes && bytes.byteLength > best.bytes.byteLength)) {
        best = { bytes, crf, resolution }
      }
      if (bytes.byteLength <= targetBytes) break
      crf = Math.min(45, crf + 6)
    }
    if (best && best.bytes.byteLength <= targetBytes) break
  }

  if (!best) throw new EngineError('compression produced no output')
  const met = best.bytes.byteLength <= targetBytes
  const bytes = best.bytes
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  notes.push(
    met
      ? `[+] target met at CRF ${best.crf}${best.resolution ? ` · ${best.resolution}p` : ''}`
      : `[!] target not reachable — smallest result is ${Math.round(bytes.byteLength / (1024 * 1024))}MB`,
  )
  const stem = req.inputs[0].name.replace(/\.[^.]+$/, '') || 'video'
  return { name: `${stem}.mp4`, type: 'video/mp4', data: buffer, notes }
}

export function createFFmpegEngine() {
  return {
    run,
    abort() {
      const current = instance
      instance = null
      progressReporter = null
      logTail = []
      buildConfig = null
      void current?.then((ffmpeg) => ffmpeg.terminate()).catch(() => undefined)
    },
  }
}
