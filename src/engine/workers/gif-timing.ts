/*
 * GIF timing and target-size ladders.
 *
 * Pure logic (no canvas, no wasm) so the frame maths is unit-testable.
 * The worker owns decoding/encoding; everything here is arithmetic.
 */

export const MIN_DELAY_MS = 20
export const MAX_DELAY_MS = 10_000
export const DEFAULT_DELAY_MS = 100

export const clampDelay = (delay: number): number => {
  if (!Number.isFinite(delay)) return DEFAULT_DELAY_MS
  return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, Math.round(delay)))
}

/** Total playback time in milliseconds. */
export const totalDuration = (delays: number[]): number =>
  delays.reduce((sum, delay) => sum + clampDelay(delay), 0)

/**
 * Frame window covering [startMs, endMs]. Returns inclusive indices; when the
 * range falls outside the animation, the nearest frame is kept so the output
 * is never empty.
 */
export function trimRange(
  delays: number[],
  startMs: number,
  endMs: number,
): { from: number; to: number } {
  if (delays.length === 0) return { from: 0, to: -1 }
  const start = Math.max(0, startMs)
  const end = Math.max(start, endMs)
  let elapsed = 0
  let from = -1
  let to = -1
  for (let i = 0; i < delays.length; i += 1) {
    const next = elapsed + clampDelay(delays[i])
    // Frame i covers [elapsed, next)
    if (next > start && from === -1) from = i
    if (elapsed < end) to = i
    elapsed = next
  }
  if (from === -1) from = delays.length - 1
  if (to === -1 || to < from) to = from
  return { from, to }
}

/** Slice of delays for a trimmed range (inclusive). */
export const sliceDelays = (delays: number[], from: number, to: number): number[] =>
  delays.slice(from, to + 1)

/** Speed multiplier: 2× plays twice as fast, so delays halve. */
export function retime(delays: number[], speed: number): number[] {
  const factor = speed > 0 ? speed : 1
  return delays.map((delay) => clampDelay(clampDelay(delay) / factor))
}

/** Indices to keep when dropping every `every`-th frame (1 = keep all). */
export function skipIndices(count: number, every: number): number[] {
  const step = Math.max(1, Math.round(every))
  if (step === 1) return Array.from({ length: count }, (_, i) => i)
  const kept: number[] = []
  for (let i = 0; i < count; i += step) kept.push(i)
  return kept.length > 0 ? kept : [0]
}

/** Reverse playback order. */
export const reverseDelays = (delays: number[]): number[] => [...delays].reverse()

/* ------------------------------------------------------------------ */
/* target-size ladder                                                 */
/* ------------------------------------------------------------------ */

export type GifSettings = { colors: number; scale: number; skip: number }

export const INITIAL_GIF_SETTINGS: GifSettings = { colors: 256, scale: 1, skip: 1 }

/**
 * Escalate size reduction in a fixed order — palette, then dimensions, then
 * frame dropping — which keeps the animation recognisable for as long as
 * possible. Returns null when there is nothing left to give.
 */
export function nextEscalation(settings: GifSettings): GifSettings | null {
  if (settings.colors > 64) return { ...settings, colors: Math.max(64, settings.colors / 2) }
  if (settings.scale > 0.5) return { ...settings, scale: Math.max(0.4, Math.round(settings.scale * 0.85 * 100) / 100) }
  if (settings.skip < 3) return { ...settings, skip: settings.skip + 1 }
  return null
}

/** Human-readable summary of what the ladder gave up. */
export function describeSettings(settings: GifSettings): string {
  const parts: string[] = []
  if (settings.colors < 256) parts.push(`${settings.colors} colours`)
  if (settings.scale < 1) parts.push(`${Math.round(settings.scale * 100)}% scale`)
  if (settings.skip > 1) parts.push(`every ${settings.skip}rd frame`)
  return parts.length > 0 ? parts.join(', ') : 'original quality'
}
