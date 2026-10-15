/*
 * Target-size compression search.
 *
 * Pure logic (no wasm, no DOM) so the strategy can be unit-tested. The vips
 * worker drives the actual encoders; this module decides *what* to encode.
 */

export type QualitySearchResult = { quality: number; bytes: number }

/**
 * Find the highest quality whose encoded size fits `targetBytes`.
 *
 * Assumes encoded size grows monotonically with quality — true for
 * JPEG/WebP/AVIF. Returns null when even the lowest quality overshoots.
 */
export function searchQuality(
  targetBytes: number,
  sizeAtQuality: (quality: number) => number,
  options: { min?: number; max?: number } = {},
): QualitySearchResult | null {
  let low = options.min ?? 5
  let high = options.max ?? 95
  let best: QualitySearchResult | null = null

  while (low <= high) {
    const quality = Math.floor((low + high) / 2)
    const bytes = sizeAtQuality(quality)
    if (bytes <= targetBytes) {
      best = { quality, bytes }
      low = quality + 1
    } else {
      high = quality - 1
    }
  }
  return best
}

/** Dimension fallback ladder: step down 15% at a time, floor at 15%. */
export const MIN_SCALE = 0.15

export function nextScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.round(scale * 0.85 * 1000) / 1000)
}

/** Quality used when probing whether a smaller image fits at all. */
export const PROBE_QUALITY = 85

/** Quality used for the give-up encode when nothing fits the target. */
export const FALLBACK_QUALITY = 45
