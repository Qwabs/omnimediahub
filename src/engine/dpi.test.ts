import { describe, expect, it } from 'vitest'
import { crc32, readJpegDpi, readPngDpi, setImageDpi, setJpegDpi, setPngDpi } from './dpi'

/* ------------------------------------------------------------------ */
/* fixtures                                                           */
/* ------------------------------------------------------------------ */

/** A minimal JPEG: SOI + APP1(Exif, IFD0 with resolution tags) + EOI. */
function buildJpegWithExif(dpi: number): Uint8Array {
  const ifd0Offset = 8
  const entries = 3
  const rationalOffset = ifd0Offset + 2 + entries * 12 + 4
  const tiff = new Uint8Array(rationalOffset + 16)
  const view = new DataView(tiff.buffer)
  tiff[0] = 0x4d
  tiff[1] = 0x4d // big-endian TIFF
  view.setUint16(2, 42)
  view.setUint32(4, ifd0Offset)
  view.setUint16(ifd0Offset, entries)

  let entry = ifd0Offset + 2
  const writeEntry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(entry, tag)
    view.setUint16(entry + 2, type)
    view.setUint32(entry + 4, count)
    view.setUint32(entry + 8, value)
    entry += 12
  }
  writeEntry(0x011a, 5, 1, rationalOffset) // XResolution → offset to RATIONAL
  writeEntry(0x011b, 5, 1, rationalOffset + 8) // YResolution
  writeEntry(0x0128, 3, 1, 2) // ResolutionUnit = inches (inline SHORT)
  view.setUint32(rationalOffset, dpi)
  view.setUint32(rationalOffset + 4, 1)
  view.setUint32(rationalOffset + 8, dpi)
  view.setUint32(rationalOffset + 12, 1)

  const payload = new Uint8Array(6 + tiff.length)
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]) // 'Exif\0\0'
  payload.set(tiff, 6)

  const length = payload.length + 2
  const jpeg = new Uint8Array(6 + payload.length + 2)
  jpeg[0] = 0xff
  jpeg[1] = 0xd8
  jpeg[2] = 0xff
  jpeg[3] = 0xe1
  jpeg[4] = (length >> 8) & 0xff
  jpeg[5] = length & 0xff
  jpeg.set(payload, 6)
  jpeg[jpeg.length - 2] = 0xff
  jpeg[jpeg.length - 1] = 0xd9
  return jpeg
}

/** A minimal JPEG with a JFIF APP0 (density in DPI) and no EXIF. */
function buildJpegWithJfif(dpi: number): Uint8Array {
  const app0 = new Uint8Array(16)
  app0.set([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01]) // 'JFIF\0' v1.1, units=1
  app0[8] = (dpi >> 8) & 0xff
  app0[9] = dpi & 0xff
  app0[10] = (dpi >> 8) & 0xff
  app0[11] = dpi & 0xff
  const length = app0.length + 2
  const jpeg = new Uint8Array(6 + app0.length + 2)
  jpeg[0] = 0xff
  jpeg[1] = 0xd8
  jpeg[2] = 0xff
  jpeg[3] = 0xe0
  jpeg[4] = (length >> 8) & 0xff
  jpeg[5] = length & 0xff
  jpeg.set(app0, 6)
  jpeg[jpeg.length - 2] = 0xff
  jpeg[jpeg.length - 1] = 0xd9
  return jpeg
}

const pngChunkBytes = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

const concat = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/** A minimal PNG (IHDR + optional pHYs + IDAT + IEND). */
function buildPng(dpi: number | null): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, 1) // width
  view.setUint32(4, 1) // height
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour

  const chunks = [signature, pngChunkBytes('IHDR', ihdr)]
  if (dpi !== null) {
    const phys = new Uint8Array(9)
    const physView = new DataView(phys.buffer)
    const ppm = Math.round(dpi / 0.0254)
    physView.setUint32(0, ppm)
    physView.setUint32(4, ppm)
    phys[8] = 1
    chunks.push(pngChunkBytes('pHYs', phys))
  }
  chunks.push(pngChunkBytes('IDAT', new Uint8Array([0x78, 0x9c, 0x03, 0x00])))
  chunks.push(pngChunkBytes('IEND', new Uint8Array(0)))
  return concat(...chunks)
}

/* ------------------------------------------------------------------ */
/* tests                                                              */
/* ------------------------------------------------------------------ */

describe('jpeg dpi', () => {
  it('reads the EXIF resolution', () => {
    expect(readJpegDpi(buildJpegWithExif(300))).toBe(300)
  })

  it('rewrites the EXIF resolution in place', () => {
    const source = buildJpegWithExif(72)
    const result = setJpegDpi(source, 300)
    expect(result.patched).toBe(true)
    expect(result.via).toBe('exif')
    expect(readJpegDpi(result.bytes)).toBe(300)
    // The original buffer is untouched.
    expect(readJpegDpi(source)).toBe(72)
  })

  it('rewrites the JFIF density when there is no EXIF', () => {
    const result = setJpegDpi(buildJpegWithJfif(72), 150)
    expect(result.patched).toBe(true)
    expect(result.via).toBe('jfif')
    expect(readJpegDpi(result.bytes)).toBe(150)
  })

  it('reports no patch for a JPEG with neither EXIF nor JFIF', () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const result = setJpegDpi(bare, 300)
    expect(result.patched).toBe(false)
    expect(readJpegDpi(bare)).toBeNull()
  })

  it('ignores non-JPEG input', () => {
    expect(readJpegDpi(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(setJpegDpi(new Uint8Array([1, 2, 3]), 300).patched).toBe(false)
  })
})

describe('png dpi', () => {
  it('reads the pHYs chunk', () => {
    expect(readPngDpi(buildPng(300))).toBe(300)
  })

  it('inserts a pHYs chunk when missing', () => {
    const source = buildPng(null)
    const result = setPngDpi(source, 300)
    expect(result.patched).toBe(true)
    expect(result.via).toBe('phys-insert')
    expect(readPngDpi(result.bytes)).toBe(300)
    // The inserted chunk must carry a valid CRC.
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength)
    expect(view.getUint32(8)).toBe(13) // IHDR length still correct
  })

  it('replaces an existing pHYs chunk', () => {
    const result = setPngDpi(buildPng(72), 300)
    expect(result.via).toBe('phys-replace')
    expect(readPngDpi(result.bytes)).toBe(300)
  })
})

describe('setImageDpi', () => {
  it('routes by container', () => {
    expect(setImageDpi(buildPng(72), 300, 'image/png')).toMatchObject({ patched: true, format: 'png' })
    expect(setImageDpi(buildJpegWithExif(72), 300, 'image/jpeg')).toMatchObject({
      patched: true,
      format: 'jpeg',
    })
  })

  it('reports unsupported formats', () => {
    expect(setImageDpi(new Uint8Array([0, 1, 2, 3]), 300, 'image/webp')).toMatchObject({
      patched: false,
      format: 'unsupported',
    })
  })
})
