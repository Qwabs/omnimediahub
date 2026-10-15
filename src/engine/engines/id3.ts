/*
 * ID3v2.4 tag reading and writing (MP3).
 *
 * Pure byte manipulation — no DOM, no wasm — so tag layout is unit-testable.
 * v2.4 is used because it stores text as UTF-8 and syncsafe frame sizes.
 */

export type Id3Tags = {
  title?: string
  artist?: string
  album?: string
  year?: string
}

const HEADER_SIZE = 10

const isId3 = (bytes: Uint8Array): boolean =>
  bytes.length > HEADER_SIZE && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33

/** Syncsafe integer → number (7 bits per byte). */
const readSyncsafe = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] & 0x7f) << 21) |
  ((bytes[offset + 1] & 0x7f) << 14) |
  ((bytes[offset + 2] & 0x7f) << 7) |
  (bytes[offset + 3] & 0x7f)

const writeSyncsafe = (value: number): Uint8Array => {
  const safe = Math.max(0, value | 0)
  return new Uint8Array([
    (safe >> 21) & 0x7f,
    (safe >> 14) & 0x7f,
    (safe >> 7) & 0x7f,
    safe & 0x7f,
  ])
}

/** Size of an existing ID3v2 tag (header + body), or 0 when there is none. */
export function id3Size(bytes: Uint8Array): number {
  if (!isId3(bytes)) return 0
  return HEADER_SIZE + readSyncsafe(bytes, 6) + (bytes[5] & 0x10 ? 10 : 0) // + footer
}

/** Remove an ID3v2 tag from the front of an MP3. */
export function stripId3(bytes: Uint8Array): Uint8Array {
  const size = id3Size(bytes)
  return size === 0 ? bytes : bytes.slice(size)
}

/** Read the text frames we manage (title, artist, album, year). */
export function readId3(bytes: Uint8Array): Id3Tags & { frames: number } {
  const size = id3Size(bytes)
  if (size === 0) return { frames: 0 }
  const declared = readSyncsafe(bytes, 6)
  const version = bytes[3]
  let offset = HEADER_SIZE
  const end = Math.min(bytes.length, HEADER_SIZE + declared)
  const tags: Id3Tags = {}
  let frames = 0

  const decodeText = (start: number, length: number): string => {
    if (length <= 1) return ''
    const encoding = bytes[start]
    const data = bytes.subarray(start + 1, start + length)
    // 0 = latin1, 3 = utf-8 (v2.4)
    return new TextDecoder(encoding === 0 ? 'latin1' : 'utf-8').decode(data).replace(/\0+$/, '')
  }

  while (offset + 10 <= end) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const frameSize =
      version === 4 ? readSyncsafe(bytes, offset + 4) : (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7]
    if (frameSize <= 0) break
    frames += 1
    const dataStart = offset + 10
    if (id === 'TIT2') tags.title = decodeText(dataStart, frameSize)
    else if (id === 'TPE1') tags.artist = decodeText(dataStart, frameSize)
    else if (id === 'TALB') tags.album = decodeText(dataStart, frameSize)
    else if (id === 'TDRC' || id === 'TYER') tags.year = decodeText(dataStart, frameSize)
    offset = dataStart + frameSize
  }

  return { ...tags, frames }
}

const textFrame = (id: string, value: string): Uint8Array => {
  const text = new TextEncoder().encode(value)
  const frame = new Uint8Array(10 + 1 + text.length)
  for (let i = 0; i < 4; i += 1) frame[i] = id.charCodeAt(i)
  frame.set(writeSyncsafe(1 + text.length), 4)
  frame[10] = 0x03 // UTF-8
  frame.set(text, 11)
  return frame
}

/** Build a complete ID3v2.4 tag (header + frames). */
export function buildId3(tags: Id3Tags): Uint8Array {
  const frames: Uint8Array[] = []
  if (tags.title) frames.push(textFrame('TIT2', tags.title))
  if (tags.artist) frames.push(textFrame('TPE1', tags.artist))
  if (tags.album) frames.push(textFrame('TALB', tags.album))
  if (tags.year) frames.push(textFrame('TDRC', tags.year))

  const body = frames.reduce((sum, frame) => sum + frame.length, 0)
  const header = new Uint8Array(HEADER_SIZE)
  header[0] = 0x49
  header[1] = 0x44
  header[2] = 0x33
  header[3] = 4 // v2.4
  header[4] = 0
  header[5] = 0
  header.set(writeSyncsafe(body), 6)

  const out = new Uint8Array(HEADER_SIZE + body)
  out.set(header, 0)
  let offset = HEADER_SIZE
  for (const frame of frames) {
    out.set(frame, offset)
    offset += frame.length
  }
  return out
}

/**
 * Replace (or add) the ID3 tag on an MP3. `tags` empty → the tag is removed.
 * Audio data is copied byte-for-byte either way.
 */
export function applyId3(bytes: Uint8Array, tags: Id3Tags, strip = false): Uint8Array {
  const audio = strip ? stripId3(bytes) : stripId3(bytes)
  const hasTags = Boolean(tags.title || tags.artist || tags.album || tags.year)
  if (!hasTags) return audio
  const tag = buildId3(tags)
  const out = new Uint8Array(tag.length + audio.length)
  out.set(tag, 0)
  out.set(audio, tag.length)
  return out
}
