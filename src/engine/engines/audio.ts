/*
 * Audio engine.
 *
 * Decoding uses the browser's own codecs through OfflineAudioContext (the
 * Web Audio API is main-thread only, so this engine is serialised by
 * `createSerialRunner`). Encoding is done in JS: WAV by hand, MP3 with
 * lamejs. ID3 tagging is pure byte manipulation.
 *
 * Ops: convert · trim · merge · normalize · boost · speed-pitch · reverse ·
 *      silence-remove · waveform · id3
 */
import { EngineError } from '../types'
import { applyId3 } from './id3'
import type { JobInput, JobOutput, JobRequest } from '../types'

const SAMPLE_RATE = 48000

/* ------------------------------------------------------------------ */
/* decode / encode                                                    */
/* ------------------------------------------------------------------ */

async function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE)
  try {
    return await context.decodeAudioData(data)
  } catch (error) {
    throw new EngineError(
      `could not decode audio (${error instanceof Error ? error.message : String(error)}) — the browser may not support this codec`,
    )
  }
}

function channelsOf(buffer: AudioBuffer, mode: unknown): Float32Array[] {
  const left = buffer.getChannelData(0)
  if (mode === 'mono' || buffer.numberOfChannels === 1) {
    if (buffer.numberOfChannels === 1) return [left]
    const right = buffer.getChannelData(1)
    const mono = new Float32Array(left.length)
    for (let i = 0; i < left.length; i += 1) mono[i] = (left[i] + right[i]) / 2
    return [mono]
  }
  if (buffer.numberOfChannels === 1) return [left]
  return [left, buffer.getChannelData(1)]
}

function sliceRange(
  channels: Float32Array[],
  buffer: AudioBuffer,
  params: Record<string, unknown>,
): Float32Array[] {
  const range = (params.range ?? { start: 0, end: buffer.duration }) as {
    start: number
    end: number
  }
  const start = Math.max(0, Math.min(Number(range.start) || 0, buffer.duration))
  const end = Math.max(start + 0.01, Math.min(Number(range.end) || buffer.duration, buffer.duration))
  const from = Math.floor(start * buffer.sampleRate)
  const to = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate))
  const fadeIn = Math.max(0, Number(params.fadeIn) || 0) / 1000
  const fadeOut = Math.max(0, Number(params.fadeOut) || 0) / 1000
  const fadeInSamples = Math.floor(fadeIn * buffer.sampleRate)
  const fadeOutSamples = Math.floor(fadeOut * buffer.sampleRate)

  return channels.map((channel) => {
    const out = channel.slice(from, to)
    if (fadeInSamples > 0) {
      for (let i = 0; i < Math.min(fadeInSamples, out.length); i += 1) out[i] *= i / fadeInSamples
    }
    if (fadeOutSamples > 0) {
      for (let i = 0; i < Math.min(fadeOutSamples, out.length); i += 1) {
        const index = out.length - 1 - i
        if (index >= 0) out[index] *= i / fadeOutSamples
      }
    }
    return out
  })
}

function toInt16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length)
  for (let i = 0; i < channel.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i]))
    out[i] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff)
  }
  return out
}

async function encodeMp3(
  channels: Float32Array[],
  bitrate: number,
  onProgress?: (progress: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const encoder = new Mp3Encoder(channels.length, SAMPLE_RATE, bitrate)
  const left = toInt16(channels[0])
  const right = channels[1] ? toInt16(channels[1]) : undefined
  const blockSize = 1152
  const chunks: Uint8Array[] = []

  for (let offset = 0; offset < left.length; offset += blockSize) {
    if (signal?.aborted) throw new EngineError('cancelled')
    const chunk = encoder.encodeBuffer(
      left.subarray(offset, offset + blockSize),
      right?.subarray(offset, offset + blockSize),
    )
    if (chunk.length > 0) chunks.push(chunk)
    if (offset % (blockSize * 200) === 0) {
      onProgress?.(35 + Math.round((offset / left.length) * 55), 'encoding mp3')
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(tail)

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const chunk of chunks) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  return out
}

function encodeWav(channels: Float32Array[]): Uint8Array {
  const numChannels = channels.length
  const length = channels[0].length
  const blockAlign = numChannels * 2
  const dataSize = length * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Uint8Array(buffer)
}

/* ------------------------------------------------------------------ */
/* analysis + transforms                                              */
/* ------------------------------------------------------------------ */

const dbToLinear = (db: number) => 10 ** (db / 20)
const linearToDb = (value: number) => 20 * Math.log10(Math.max(value, 1e-7))

function peakOf(channels: Float32Array[]): number {
  let peak = 0
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const value = Math.abs(channel[i])
      if (value > peak) peak = value
    }
  }
  return peak
}

function rmsOf(channels: Float32Array[]): number {
  let sum = 0
  let count = 0
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      sum += channel[i] * channel[i]
      count += 1
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0
}

/** Apply gain, optionally soft-limiting so the result cannot clip. */
function applyGain(channels: Float32Array[], gainDb: number, limit: boolean): Float32Array[] {
  const gain = dbToLinear(gainDb)
  let scale = gain
  if (limit) {
    const peakAfter = peakOf(channels) * gain
    if (peakAfter > 1) scale = 1 / Math.max(peakOf(channels), 1e-6)
  }
  return channels.map((channel) => {
    const out = new Float32Array(channel.length)
    for (let i = 0; i < channel.length; i += 1) {
      const value = channel[i] * scale
      // Soft clip instead of hard clipping when the limiter is active.
      out[i] = limit ? Math.tanh(value) : Math.max(-1, Math.min(1, value))
    }
    return out
  })
}

function reverseChannels(channels: Float32Array[]): Float32Array[] {
  return channels.map((channel) => {
    const out = new Float32Array(channel.length)
    for (let i = 0; i < channel.length; i += 1) out[i] = channel[channel.length - 1 - i]
    return out
  })
}

/** Tape-style resampling (linear interpolation). rate > 1 = faster + higher. */
function resampleChannels(channels: Float32Array[], rate: number): Float32Array[] {
  const length = Math.max(1, Math.floor(channels[0].length / rate))
  return channels.map((channel) => {
    const out = new Float32Array(length)
    for (let i = 0; i < length; i += 1) {
      const position = i * rate
      const index = Math.floor(position)
      const fraction = position - index
      const a = channel[Math.min(index, channel.length - 1)]
      const b = channel[Math.min(index + 1, channel.length - 1)]
      out[i] = a + (b - a) * fraction
    }
    return out
  })
}

/** Concatenate clips, optionally crossfading the joins. */
function mergeChannels(
  parts: { channels: Float32Array[]; sampleRate: number }[],
  crossfadeMs: number,
): Float32Array[] {
  const targetRate = parts[0].sampleRate
  const targetChannels = parts[0].channels.length
  const normalised = parts.map((part) => {
    let channels = part.channels
    if (part.sampleRate !== targetRate) channels = resampleChannels(channels, part.sampleRate / targetRate)
    if (channels.length < targetChannels) {
      const extra = channels[0].slice()
      channels = [...channels, extra]
    }
    if (channels.length > targetChannels) channels = channels.slice(0, targetChannels)
    return channels
  })

  const fadeSamples = Math.max(0, Math.round((crossfadeMs / 1000) * targetRate))
  let total = 0
  normalised.forEach((channels, index) => {
    total += channels[0].length
    if (index > 0) total -= Math.min(fadeSamples, channels[0].length)
  })

  const out = Array.from({ length: targetChannels }, () => new Float32Array(total))
  let offset = 0
  normalised.forEach((channels, index) => {
    const length = channels[0].length
    const overlap = index > 0 ? Math.min(fadeSamples, length) : 0
    for (let channel = 0; channel < targetChannels; channel += 1) {
      const source = channels[channel]
      for (let i = 0; i < length; i += 1) {
        const at = offset + i
        if (at >= total) break
        if (i < overlap && overlap > 0) {
          const t = i / overlap
          out[channel][at] = out[channel][at] * (1 - t) + source[i] * t
        } else {
          out[channel][at] += source[i]
        }
      }
    }
    offset += length - overlap
  })
  return out
}

/** Remove stretches quieter than `thresholdDb` for longer than `minSilenceMs`. */
function removeSilence(
  channels: Float32Array[],
  sampleRate: number,
  thresholdDb: number,
  minSilenceMs: number,
  padMs: number,
): { channels: Float32Array[]; removedSeconds: number } {
  const threshold = dbToLinear(thresholdDb)
  const windowSamples = Math.max(64, Math.round(sampleRate * 0.05)) // 50ms windows
  const length = channels[0].length
  const silent: boolean[] = []

  for (let start = 0; start < length; start += windowSamples) {
    const end = Math.min(length, start + windowSamples)
    let peak = 0
    for (let i = start; i < end; i += 1) {
      for (const channel of channels) {
        const value = Math.abs(channel[i])
        if (value > peak) peak = value
      }
    }
    silent.push(peak < threshold)
  }

  const windowsNeeded = Math.max(1, Math.round(minSilenceMs / 50))
  const padWindows = Math.round(padMs / 50)
  const keep: { from: number; to: number }[] = []
  let index = 0
  while (index < silent.length) {
    if (!silent[index]) {
      index += 1
      continue
    }
    let runEnd = index
    while (runEnd < silent.length && silent[runEnd]) runEnd += 1
    if (runEnd - index >= windowsNeeded) {
      keep.push({
        from: (index + padWindows) * windowSamples,
        to: Math.max((index + padWindows) * windowSamples, (runEnd - padWindows) * windowSamples),
      })
      index = runEnd
    } else {
      index = runEnd
    }
  }

  if (keep.length === 0) return { channels, removedSeconds: 0 }

  // Build the kept ranges: everything outside the silent runs.
  const ranges: { from: number; to: number }[] = []
  let cursor = 0
  for (const cut of keep) {
    if (cut.from > cursor) ranges.push({ from: cursor, to: Math.min(cut.from, length) })
    cursor = Math.max(cursor, cut.to)
  }
  if (cursor < length) ranges.push({ from: cursor, to: length })

  const totalKept = ranges.reduce((sum, range) => sum + Math.max(0, range.to - range.from), 0)
  if (totalKept === 0) return { channels, removedSeconds: 0 }

  const out = channels.map(() => new Float32Array(totalKept))
  let writeOffset = 0
  for (const range of ranges) {
    const count = Math.max(0, range.to - range.from)
    for (let channel = 0; channel < channels.length; channel += 1) {
      out[channel].set(channels[channel].subarray(range.from, range.from + count), writeOffset)
    }
    writeOffset += count
  }

  const removedSeconds = (length - totalKept) / sampleRate
  return { channels: out, removedSeconds }
}

/** Render a waveform PNG (min/max envelope per pixel column). */
async function renderWaveform(
  channels: Float32Array[],
  width: number,
  height: number,
  color: string,
  background: string,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new EngineError('canvas unavailable for waveform rendering')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  const samples = channels[0].length
  const step = samples / width
  const mid = height / 2
  ctx.fillStyle = color
  for (let x = 0; x < width; x += 1) {
    const from = Math.floor(x * step)
    const to = Math.min(samples, Math.floor((x + 1) * step))
    let min = 1
    let max = -1
    for (let i = from; i < to; i += 1) {
      let sum = 0
      for (const channel of channels) sum += channel[i]
      const value = sum / channels.length
      if (value < min) min = value
      if (value > max) max = value
    }
    if (min > max) {
      min = 0
      max = 0
    }
    const top = mid - max * mid
    const bottom = mid - min * mid
    ctx.fillRect(x, top, 1, Math.max(1, bottom - top))
  }
  ctx.fillStyle = 'rgba(15,0,0,0.25)'
  ctx.fillRect(0, Math.round(mid), width, 1)

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/* ------------------------------------------------------------------ */
/* ops                                                                */
/* ------------------------------------------------------------------ */

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const stemOf = (name: string) => name.replace(/\.[^.]+$/, '') || 'audio'

async function decodeChannels(input: JobInput): Promise<{ channels: Float32Array[]; sampleRate: number; duration: number }> {
  const buffer = await decode(input.data)
  return { channels: channelsOf(buffer, 'source'), sampleRate: buffer.sampleRate, duration: buffer.duration }
}

async function encodeOutput(
  channels: Float32Array[],
  format: string,
  bitrate: number,
  stem: string,
  opts: { onProgress?: (progress: number, note?: string) => void; signal?: AbortSignal },
): Promise<JobOutput> {
  if (format === 'wav') {
    opts.onProgress?.(80, 'encoding wav')
    return { name: `${stem}.wav`, type: 'audio/wav', data: toArrayBuffer(encodeWav(channels)) }
  }
  const mp3 = await encodeMp3(channels, bitrate, opts.onProgress, opts.signal)
  return { name: `${stem}.mp3`, type: 'audio/mpeg', data: toArrayBuffer(mp3) }
}

async function run(
  req: JobRequest,
  opts: { onProgress?: (progress: number, note?: string) => void; signal?: AbortSignal },
): Promise<JobOutput> {
  const input = req.inputs[0]
  if (!input) throw new EngineError('no input')
  const params = req.params
  const notes: string[] = []
  const stem = stemOf(input.name)

  // ---- tag editing is pure byte work (no decode/encode) ----
  if (req.op === 'id3') {
    if (!/\.mp3$/i.test(input.name) && input.type !== 'audio/mpeg') {
      throw new EngineError('ID3 tags apply to MP3 files — convert the file first')
    }
    const strip = params.stripAll === true
    const tags = strip
      ? {}
      : {
          title: String(params.title ?? '').trim() || undefined,
          artist: String(params.artist ?? '').trim() || undefined,
          album: String(params.album ?? '').trim() || undefined,
          year: String(params.year ?? '').trim() || undefined,
        }
    const tagged = applyId3(new Uint8Array(input.data), tags, strip)
    notes.push(
      strip
        ? '[+] all tags removed'
        : `[+] tags written: ${Object.entries(tags)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}="${value}"`)
            .join(', ') || 'none'}`,
    )
    return { name: input.name, type: 'audio/mpeg', data: toArrayBuffer(tagged), notes }
  }

  // ---- merging decodes every input ----
  if (req.op === 'merge') {
    if (req.inputs.length < 2) throw new EngineError('merging needs at least two audio files')
    const parts: { channels: Float32Array[]; sampleRate: number }[] = []
    for (let index = 0; index < req.inputs.length; index += 1) {
      opts.onProgress?.(5 + Math.round((index / req.inputs.length) * 55), `decoding ${index + 1}/${req.inputs.length}`)
      const decoded = await decodeChannels(req.inputs[index])
      parts.push({ channels: decoded.channels, sampleRate: decoded.sampleRate })
    }
    const crossfadeMs = Math.max(0, Number(params.crossfade) || 0)
    const merged = mergeChannels(parts, crossfadeMs)
    const normalized = params.normalize === true ? applyGain(merged, -linearToDb(peakOf(merged)) - 0.5, true) : merged
    if (params.normalize === true) notes.push('[+] loudness normalised after the join')
    const format = String(params.format ?? 'mp3')
    const result = await encodeOutput(normalized, format, 192, stem, opts)
    notes.push(`[+] ${req.inputs.length} files joined${crossfadeMs > 0 ? ` with a ${crossfadeMs}ms crossfade` : ''}`)
    return { ...result, notes }
  }

  opts.onProgress?.(5, 'decoding')
  const buffer = await decode(input.data)
  const decoded = {
    channels: channelsOf(buffer, 'source'),
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
  }
  if (opts.signal?.aborted) throw new EngineError('cancelled')
  opts.onProgress?.(35, `decoded ${decoded.duration.toFixed(1)}s`)

  // ---- waveform image ----
  if (req.op === 'waveform') {
    const width = Math.max(320, Math.min(4096, Math.round(Number(params.width) || 1920)))
    const height = Math.max(80, Math.min(1200, Math.round(Number(params.height) || 360)))
    opts.onProgress?.(70, 'drawing waveform')
    const png = await renderWaveform(
      decoded.channels,
      width,
      height,
      String(params.color ?? '#201d1d'),
      String(params.background ?? '#fdfcfc'),
    )
    notes.push(`[+] ${width}×${height} waveform`, `[+] peak ${linearToDb(peakOf(decoded.channels)).toFixed(1)}dBFS`)
    return { name: `${stem}-waveform.png`, type: 'image/png', data: toArrayBuffer(png), notes }
  }

  let channels = decoded.channels
  const bitrate = Math.max(64, Math.min(320, Number(params.bitrate) || 192))
  const format = req.op === 'trim' ? 'mp3' : String(params.format ?? 'mp3')

  switch (req.op) {
    case 'trim': {
      channels = sliceRange(channels, buffer, params)
      break
    }
    case 'convert': {
      channels = channelsOf(buffer, params.channels ?? 'source')
      break
    }
    case 'normalize': {
      const targetDb = Math.max(-12, Math.min(-0.1, Number(params.targetDb ?? -1)))
      const peak = peakOf(channels)
      const gainDb = targetDb - linearToDb(peak)
      channels = applyGain(channels, gainDb, params.limit !== false)
      notes.push(
        `[+] peak was ${linearToDb(peak).toFixed(1)}dBFS → target ${targetDb.toFixed(1)}dBFS`,
        `[+] gain applied: ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)}dB${params.limit !== false ? ' with soft limiting' : ''}`,
        `[+] resulting peak ${linearToDb(peakOf(channels)).toFixed(1)}dBFS · RMS ${linearToDb(rmsOf(channels)).toFixed(1)}dBFS${
          params.limit !== false ? ' (the limiter shaves the loudest peaks)' : ''
        }`,
      )
      break
    }
    case 'boost': {
      const gainDb = Math.max(-24, Math.min(24, Number(params.gain) || 6))
      const before = peakOf(channels)
      channels = applyGain(channels, gainDb, params.preventClip !== false)
      const after = peakOf(channels)
      notes.push(
        `[+] ${gainDb >= 0 ? '+' : ''}${gainDb}dB · peak ${linearToDb(before).toFixed(1)} → ${linearToDb(after).toFixed(1)}dBFS`,
      )
      break
    }
    case 'speed-pitch': {
      const speed = Math.max(0.25, Math.min(4, Number(params.speed) || 1))
      const semitones = Math.max(-12, Math.min(12, Number(params.semitones) || 0))
      const rate = speed * 2 ** (semitones / 12)
      channels = resampleChannels(channels, rate)
      const newDuration = decoded.duration / rate
      notes.push(
        `[+] tape-style: ${speed}× speed${semitones !== 0 ? ` and ${semitones > 0 ? '+' : ''}${semitones} semitones` : ''}`,
        `[+] duration ${decoded.duration.toFixed(1)}s → ${newDuration.toFixed(1)}s (pitch moves with speed by design)`,
      )
      break
    }
    case 'reverse': {
      channels = reverseChannels(channels)
      notes.push('[+] playback reversed')
      break
    }
    case 'silence-remove': {
      const thresholdDb = Math.max(-80, Math.min(-20, Number(params.thresholdDb ?? -45)))
      const minSilenceMs = Math.max(100, Math.min(10_000, Number(params.minSilenceMs) || 500))
      const result = removeSilence(channels, decoded.sampleRate, thresholdDb, minSilenceMs, 120)
      channels = result.channels
      notes.push(
        result.removedSeconds > 0
          ? `[+] removed ${result.removedSeconds.toFixed(1)}s of silence (below ${thresholdDb}dB for ${minSilenceMs}ms+)`
          : '[ ] no silence long enough to remove',
      )
      break
    }
    default:
      throw new EngineError(`unknown audio op: ${req.op}`)
  }

  const result = await encodeOutput(channels, format, bitrate, stem, opts)
  return { ...result, notes }
}

export function createAudioEngine() {
  return {
    run,
    abort() {
      // Encoding checks the abort signal between blocks; decoding is fast.
    },
  }
}
