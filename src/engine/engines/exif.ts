/*
 * EXIF engine (main thread).
 *
 * Reading is done with exifr (small, fast, no wasm); editing uses piexifjs
 * for JPEG — the only format where tag-level edits are safe. For other
 * formats, "strip all" re-encodes through a canvas, which drops metadata.
 */
import { EngineError } from '../types'
import { setImageDpi } from '../dpi'
import type { JobInput, JobOutput, JobRequest } from '../types'

type ExifReport = Record<string, unknown>

const isJpeg = (input: JobInput): boolean =>
  input.type === 'image/jpeg' || /\.jpe?g$/i.test(input.name)

const uint8ToBinaryString = (bytes: Uint8Array): string => {
  let result = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return result
}

const binaryStringToUint8 = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff
  return bytes
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const round = (value: number, digits = 1) => Number(value.toFixed(digits))

async function imageInfo(data: ArrayBuffer, type: string) {
  const bitmap = await createImageBitmap(new Blob([data], { type: type || 'image/png' }))
  const info = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return info
}

const resolutionToDpi = (report: ExifReport): number | null => {
  const raw = report.XResolution
  let value: number | null = null
  if (typeof raw === 'number') value = raw
  else if (Array.isArray(raw) && raw.length >= 2) {
    const [numerator, denominator] = raw.map(Number)
    if (denominator) value = numerator / denominator
  } else if (typeof raw === 'string' && raw.includes('/')) {
    const [numerator, denominator] = raw.split('/').map(Number)
    if (denominator) value = numerator / denominator
  } else if (raw && typeof raw === 'object' && 'numerator' in raw) {
    const fraction = raw as { numerator: number; denominator: number }
    if (fraction.denominator) value = fraction.numerator / fraction.denominator
  }
  if (value === null || !Number.isFinite(value) || value <= 1) return null
  // ResolutionUnit: 2 = inches, 3 = centimetres.
  const unit = report.ResolutionUnit
  if (unit === 3) return Math.round(value * 2.54)
  return Math.round(value)
}

async function readMetadata(input: JobInput, params: Record<string, unknown>): Promise<JobOutput> {
  const exifr = await import('exifr')
  const bytes = new Uint8Array(input.data)
  let parsed: Record<string, unknown> | undefined
  let viaDefaults = false
  try {
    parsed = (await exifr.parse(bytes, {
      tiff: true,
      exif: true,
      gps: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
    })) as Record<string, unknown> | undefined
  } catch (error) {
    throw new EngineError(
      `could not read metadata (${error instanceof Error ? error.message : String(error)})`,
    )
  }

  // Some containers expose tags only through the default parse path.
  if (!parsed || Object.keys(parsed).length === 0) {
    try {
      const retry = await exifr.parse(bytes, true)
      if (retry && Object.keys(retry).length > 0) {
        parsed = retry as Record<string, unknown>
        viaDefaults = true
      }
    } catch {
      /* keep the empty result */
    }
  }

  const info = await imageInfo(input.data, input.type)
  const report: ExifReport = parsed ?? {}
  const dpi = resolutionToDpi(report)
  const notes: string[] = []

  const summary: Record<string, unknown> = {
    file: input.name,
    ...info,
  }
  if (dpi) summary.dpi = dpi
  const camera = [report.Make, report.Model].filter(Boolean).join(' ')
  if (camera) summary.camera = camera
  if (report.DateTimeOriginal instanceof Date) summary.taken = report.DateTimeOriginal.toISOString()
  else if (report.CreateDate instanceof Date) summary.taken = report.CreateDate.toISOString()
  if (typeof report.ISO === 'number') summary.iso = report.ISO
  if (typeof report.FNumber === 'number') summary.aperture = `f/${report.FNumber}`
  if (typeof report.ExposureTime === 'number') summary.shutter = `${report.ExposureTime}s`
  if (typeof report.FocalLength === 'number') summary.focalLength = `${round(report.FocalLength)}mm`
  if (report.latitude !== undefined && report.longitude !== undefined) {
    summary.gps = `${round(Number(report.latitude), 5)}, ${round(Number(report.longitude), 5)}`
  }

  notes.push(`[+] ${info.width}×${info.height}px`)
  notes.push(`[+] dpi: ${dpi ?? 'not tagged (defaults to 72)'}`)
  if (dpi)
    notes.push(
      `[+] print size: ${round(info.width / dpi, 1)}×${round(info.height / dpi, 1)}in at ${dpi}dpi`,
    )
  notes.push(
    `[+] print size at 300dpi: ${round(info.width / 300, 1)}×${round(info.height / 300, 1)}in`,
  )
  if (camera) notes.push(`[+] camera: ${camera}`)
  if (summary.taken) notes.push(`[+] taken: ${String(summary.taken)}`)
  if (summary.gps) notes.push(`[!] gps: ${String(summary.gps)} (embedded location)`)
  const tagCount = Object.keys(report).length
  notes.push(
    `[ ] ${tagCount} metadata tags parsed from ${Math.round(bytes.length / 1024)}KB${viaDefaults ? ' (default parse)' : ''}`,
  )

  const focus = String(params.focus ?? 'all')
  const body = JSON.stringify(
    {
      summary,
      focus,
      tags: Object.fromEntries(
        Object.entries(report).filter(([, value]) => typeof value !== 'object' || value instanceof Date),
      ),
    },
    (_key, value) => (value instanceof Date ? value.toISOString() : value),
    2,
  )

  return {
    name: `${input.name.replace(/\.[^.]+$/, '') || 'image'}-metadata.json`,
    type: 'application/json',
    data: toArrayBuffer(new TextEncoder().encode(body)),
    notes,
  }
}

async function editMetadata(input: JobInput, params: Record<string, unknown>): Promise<JobOutput> {  const notes: string[] = []
  const stripAll = params.stripAll === true
  const stripGps = params.stripGps === true
  const artist = String(params.artist ?? '').trim()
  const copyright = String(params.copyright ?? '').trim()
  const software = String(params.software ?? '').trim()
  const wantsTags = Boolean(artist || copyright || software)

  if (isJpeg(input)) {
    const piexif = await import('piexifjs')
    const binary = uint8ToBinaryString(new Uint8Array(input.data))
    try {
      if (stripAll) {
        const cleaned = piexif.remove(binary)
        notes.push('[+] all metadata stripped (JPEG)')
        return {
          name: input.name.replace(/\.jpeg$/i, '.jpg'),
          type: 'image/jpeg',
          data: toArrayBuffer(binaryStringToUint8(cleaned)),
          notes,
        }
      }

      const exif = piexif.load(binary)
      if (stripGps) {
        exif.GPS = {}
        notes.push('[+] GPS tags removed')
      }
      if (artist) {
        exif['0th'] = exif['0th'] ?? {}
        exif['0th'][piexif.ImageIFD.Artist] = artist
        notes.push(`[+] artist set: ${artist}`)
      }
      if (copyright) {
        exif['0th'] = exif['0th'] ?? {}
        exif['0th'][piexif.ImageIFD.Copyright] = copyright
        notes.push(`[+] copyright set: ${copyright}`)
      }
      if (software) {
        exif['0th'] = exif['0th'] ?? {}
        exif['0th'][piexif.ImageIFD.Software] = software
        notes.push(`[+] software set: ${software}`)
      }
      const edited = piexif.insert(piexif.dump(exif), binary)
      return {
        name: input.name,
        type: 'image/jpeg',
        data: toArrayBuffer(binaryStringToUint8(edited)),
        notes,
      }
    } catch (error) {
      throw new EngineError(
        `metadata edit failed (${error instanceof Error ? error.message : String(error)})`,
      )
    }
  }

  // Non-JPEG: tag-level editing is not supported, but a full strip can be
  // done safely by re-encoding through the canvas.
  if (stripAll) {
    const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new EngineError('canvas unavailable')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const keepPng = input.type === 'image/png' || input.type === 'image/webp'
    const type = keepPng ? input.type : 'image/png'
    const blob = await canvas.convertToBlob({ type })
    notes.push(`[+] all metadata stripped (re-encoded as ${type})`)
    return {
      name: input.name.replace(/\.[^.]+$/, type === 'image/png' ? '.png' : '.webp'),
      type,
      data: toArrayBuffer(new Uint8Array(await blob.arrayBuffer())),
      notes,
    }
  }

  if (stripGps || wantsTags) {
    notes.push('[!] tag editing is JPEG-only — file left unchanged')
    return {
      name: input.name,
      type: input.type || 'application/octet-stream',
      data: input.data,
      notes,
    }
  }

  notes.push('[ ] nothing to do — no edit options selected')
  return {
    name: input.name,
    type: input.type || 'application/octet-stream',
    data: input.data,
    notes,
  }
}

/** Byte-level DPI writer — instant, because it never decodes the image. */
function setDpi(input: JobInput, params: Record<string, unknown>): JobOutput {
  const dpi = Math.max(36, Math.min(1200, Math.round(Number(params.dpi) || 300)))
  const patched = setImageDpi(new Uint8Array(input.data), dpi, input.type)
  return {
    name: input.name,
    type: input.type || 'application/octet-stream',
    data: toArrayBuffer(patched.bytes),
    notes: patched.patched
      ? [`[+] ${dpi}dpi written to the ${patched.format} container`]
      : ['[!] this format has no resolution field — JPEG and PNG are supported'],
  }
}

async function run(
  req: JobRequest,
  opts: { onProgress?: (progress: number, note?: string) => void },
): Promise<JobOutput> {
  const input = req.inputs[0]
  if (!input) throw new EngineError('no input')
  opts.onProgress?.(20, req.op === 'read' ? 'reading metadata' : 'editing metadata')
  const result =
    req.op === 'read'
      ? await readMetadata(input, req.params)
      : req.op === 'set-dpi'
        ? setDpi(input, req.params)
        : await editMetadata(input, req.params)
  opts.onProgress?.(95, 'done')
  return result
}

export function createExifEngine() {
  return {
    run,
    abort() {
      /* metadata work is short; nothing to tear down */
    },
  }
}
