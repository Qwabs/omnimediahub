/*
 * Subtitle parsing (SRT and WebVTT).
 *
 * Pure text parsing — no DOM, no wasm — so cue timing is unit-testable.
 */

export type Cue = {
  index: number
  /** Seconds. */
  start: number
  end: number
  /** Cue text with newlines preserved. */
  text: string
}

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/

/** `00:01:02,500` / `00:01:02.500` → seconds. */
export function parseTimestamp(value: string): number | null {
  const match = TIME_RE.exec(value.trim())
  if (!match) return null
  const [, hours, minutes, seconds, millis] = match
  const ms = Number(millis.padEnd(3, '0'))
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + ms / 1000
}

/** Also accepts `01:02.500` (VTT short form). */
function parseAnyTimestamp(value: string): number | null {
  const text = value.trim()
  const long = parseTimestamp(text)
  if (long !== null) return long
  const short = /^(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(text)
  if (short) {
    const [, minutes, seconds, millis] = short
    return Number(minutes) * 60 + Number(seconds) + Number(millis.padEnd(3, '0')) / 1000
  }
  return null
}

/** Parse SRT or WebVTT into cues (sorted, non-overlapping-safe). */
export function parseSubtitles(source: string): Cue[] {
  const text = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  const blocks = text.split(/\n{2,}/)
  const cues: Cue[] = []

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || /^WEBVTT/i.test(trimmed) || /^NOTE\b/i.test(trimmed)) continue

    const lines = trimmed.split('\n')
    // An index line is optional in VTT and required in SRT.
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'))
    if (timeLineIndex === -1) continue

    const [rawStart, rawEnd] = lines[timeLineIndex].split('-->')
    const start = parseAnyTimestamp(rawStart ?? '')
    // Trailing VTT settings (e.g. `00:00:03.000 align:start`) are dropped.
    const end = parseAnyTimestamp((rawEnd ?? '').trim().split(/\s+/)[0] ?? '')
    if (start === null || end === null || end <= start) continue

    const body = lines
      .slice(timeLineIndex + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!body) continue

    cues.push({ index: cues.length + 1, start, end, text: body })
  }

  return cues.sort((a, b) => a.start - b.start)
}

/** Merge cues that share identical text and touch each other (cleaner overlays). */
export function mergeAdjacentCues(cues: Cue[], toleranceSeconds = 0.08): Cue[] {
  const merged: Cue[] = []
  for (const cue of cues) {
    const last = merged[merged.length - 1]
    if (last && last.text === cue.text && Math.abs(cue.start - last.end) <= toleranceSeconds) {
      last.end = Math.max(last.end, cue.end)
      continue
    }
    merged.push({ ...cue })
  }
  return merged
}

/** Wrap text so each line fits within `maxChars` (naive, breaks on spaces). */
export function wrapText(text: string, maxChars: number): string {
  const limit = Math.max(8, Math.round(maxChars))
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      if (line.length === 0) line = word
      else if (`${line} ${word}`.length <= limit) line = `${line} ${word}`
      else {
        out.push(line)
        line = word
      }
    }
    if (line) out.push(line)
  }
  return out.join('\n')
}
