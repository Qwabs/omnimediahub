/*
 * DPI (resolution) metadata writer.
 *
 * libvips' savers ignore the `resolution` metadata and copy the source EXIF
 * verbatim, so changing DPI means patching the container bytes:
 *   - JPEG: rewrite the EXIF APP1 tags in place (or the JFIF APP0 density)
 *   - PNG:  replace or insert the pHYs chunk
 *
 * Pure byte manipulation — no wasm, no DOM — so it is fully unit-testable.
 */

export type DpiPatchResult = {
  bytes: Uint8Array
  patched: boolean
  /** Where the value came from, for diagnostics. */
  via?: 'exif' | 'jfif' | 'phys-insert' | 'phys-replace'
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const isJpeg = (bytes: Uint8Array): boolean => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8
const isPng = (bytes: Uint8Array): boolean =>
  bytes.length > 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47

/** Walk JPEG segments, returning the offset/length of APP0 (JFIF) and APP1 (Exif). */
function jpegSegments(bytes: Uint8Array) {
  const segments: { marker: number; start: number; length: number }[] = []
  let offset = 2
  while (offset + 3 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xda || marker === 0xd9) break // start of scan / end of image
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    segments.push({ marker, start: offset + 4, length: length - 2 })
    offset += 2 + length
  }
  return segments
}

/** Read the DPI from a JPEG (EXIF first, then JFIF). */
export function readJpegDpi(bytes: Uint8Array): number | null {
  if (!isJpeg(bytes)) return null
  for (const segment of jpegSegments(bytes)) {
    if (segment.marker === 0xe1 && String.fromCharCode(...bytes.slice(segment.start, segment.start + 4)) === 'Exif') {
      const tiff = segment.start + 6
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const little = bytes[tiff] === 0x49
      const rd16 = (o: number) => (little ? view.getUint16(o, true) : view.getUint16(o, false))
      const rd32 = (o: number) => (little ? view.getUint32(o, true) : view.getUint32(o, false))
      let unit = 2
      let xres: number | null = null
      const ifd0 = tiff + rd32(tiff + 4)
      const count = rd16(ifd0)
      for (let i = 0; i < count; i += 1) {
        const entry = ifd0 + 2 + i * 12
        const tag = rd16(entry)
        const type = rd16(entry + 2)
        if (tag === 0x011a && type === 5) {
          const valueOffset = tiff + rd32(entry + 8)
          const numerator = rd32(valueOffset)
          const denominator = rd32(valueOffset + 4)
          xres = denominator ? numerator / denominator : null
        }
        if (tag === 0x0128 && type === 3) unit = rd16(entry + 8)
      }
      if (xres !== null) return Math.round(unit === 3 ? xres * 2.54 : xres)
      continue
    }
    if (segment.marker === 0xe0 && segment.length >= 12) {
      const units = bytes[segment.start + 7]
      if (units === 1) {
        return (bytes[segment.start + 8] << 8) | bytes[segment.start + 9]
      }
    }
  }
  return null
}

/** Rewrite the DPI inside a JPEG, in place. */
export function setJpegDpi(bytes: Uint8Array, dpi: number): DpiPatchResult {
  if (!isJpeg(bytes)) return { bytes, patched: false }
  const output = bytes.slice()
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength)

  for (const segment of jpegSegments(output)) {
    // EXIF path — RATIONALs are always inline (8 bytes), so tags can be
    // patched without moving any offsets.
    if (segment.marker === 0xe1 && String.fromCharCode(...output.slice(segment.start, segment.start + 4)) === 'Exif') {
      const tiff = segment.start + 6
      const little = output[tiff] === 0x49
      const rd16 = (o: number) => (little ? view.getUint16(o, true) : view.getUint16(o, false))
      const rd32 = (o: number) => (little ? view.getUint32(o, true) : view.getUint32(o, false))
      const wr32 = (o: number, value: number) =>
        little ? view.setUint32(o, value, true) : view.setUint32(o, value, false)
      const wr16 = (o: number, value: number) =>
        little ? view.setUint16(o, value, true) : view.setUint16(o, value, false)

      const ifd0 = tiff + rd32(tiff + 4)
      const count = rd16(ifd0)
      let patchedX = false
      for (let i = 0; i < count; i += 1) {
        const entry = ifd0 + 2 + i * 12
        const tag = rd16(entry)
        const type = rd16(entry + 2)
        // RATIONAL values live at an offset — write through to the data.
        if ((tag === 0x011a || tag === 0x011b) && type === 5) {
          const valueOffset = tiff + rd32(entry + 8)
          wr32(valueOffset, dpi)
          wr32(valueOffset + 4, 1)
          patchedX = true
        }
        if (tag === 0x0128 && type === 3) {
          wr16(entry + 8, 2) // inches (inline SHORT)
        }
      }
      if (patchedX) return { bytes: output, patched: true, via: 'exif' }
      continue
    }

    // JFIF path — units byte + 16-bit densities.
    if (segment.marker === 0xe0 && segment.length >= 12 && dpi <= 65535) {
      output[segment.start + 7] = 1
      output[segment.start + 8] = (dpi >> 8) & 0xff
      output[segment.start + 9] = dpi & 0xff
      output[segment.start + 10] = (dpi >> 8) & 0xff
      output[segment.start + 11] = dpi & 0xff
      return { bytes: output, patched: true, via: 'jfif' }
    }
  }

  return { bytes, patched: false }
}

/** Read the DPI from a PNG pHYs chunk. */
export function readPngDpi(bytes: Uint8Array): number | null {
  if (!isPng(bytes)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    )
    if (type === 'pHYs' && length >= 9) {
      const ppuX = view.getUint32(offset + 8)
      const unit = bytes[offset + 16]
      if (unit === 1) return Math.round(ppuX * 0.0254)
      return null
    }
    offset += 12 + length
  }
  return null
}

const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Set the DPI in a PNG by replacing or inserting the pHYs chunk. */
export function setPngDpi(bytes: Uint8Array, dpi: number): DpiPatchResult {
  if (!isPng(bytes)) return { bytes, patched: false }
  const pixelsPerMetre = Math.round(dpi / 0.0254)
  const data = new Uint8Array(9)
  const view = new DataView(data.buffer)
  view.setUint32(0, pixelsPerMetre)
  view.setUint32(4, pixelsPerMetre)
  data[8] = 1 // metres

  const chunk = pngChunk('pHYs', data)

  // Find an existing pHYs chunk to replace.
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset)
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    )
    if (type === 'pHYs') {
      const out = new Uint8Array(bytes.length - (12 + length) + chunk.length)
      out.set(bytes.subarray(0, offset), 0)
      out.set(chunk, offset)
      out.set(bytes.subarray(offset + 12 + length), offset + chunk.length)
      return { bytes: out, patched: true, via: 'phys-replace' }
    }
    if (type === 'IDAT' || type === 'IEND') break
    offset += 12 + length
  }

  // No pHYs yet — insert one right after IHDR (which is always first).
  const ihdrLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8)
  const insertAt = 8 + 12 + ihdrLength
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, insertAt), 0)
  out.set(chunk, insertAt)
  out.set(bytes.subarray(insertAt), insertAt + chunk.length)
  return { bytes: out, patched: true, via: 'phys-insert' }
}

export type DpiPatch = DpiPatchResult & { format: 'jpeg' | 'png' | 'unsupported' }

/** Patch DPI for whatever container we recognise. */
export function setImageDpi(bytes: Uint8Array, dpi: number, type: string): DpiPatch {
  if (isPng(bytes) || type === 'image/png') {
    const result = setPngDpi(bytes, dpi)
    return { ...result, format: result.patched ? 'png' : 'unsupported' }
  }
  if (isJpeg(bytes) || type === 'image/jpeg') {
    const result = setJpegDpi(bytes, dpi)
    return { ...result, format: result.patched ? 'jpeg' : 'unsupported' }
  }
  return { bytes, patched: false, format: 'unsupported' }
}
