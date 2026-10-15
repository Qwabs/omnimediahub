import { describe, expect, it } from 'vitest'
import {
  FALLBACK_QUALITY,
  MIN_SCALE,
  nextScale,
  PROBE_QUALITY,
  searchQuality,
} from './compress-search'

describe('searchQuality', () => {
  // A monotonic fake encoder: 50KB at q=1 up to 5MB at q=100.
  const sizeAtQuality = (quality: number) => Math.round(50_000 + quality * 49_500)

  it('finds the highest quality that fits the target', () => {
    const target = 500_000
    const result = searchQuality(target, sizeAtQuality)
    expect(result).not.toBeNull()
    expect(result!.bytes).toBeLessThanOrEqual(target)
    expect(sizeAtQuality(result!.quality + 1)).toBeGreaterThan(target)
  })

  it('returns null when nothing fits', () => {
    expect(searchQuality(10, sizeAtQuality)).toBeNull()
  })

  it('returns the maximum quality when the target is generous', () => {
    const result = searchQuality(100_000_000, sizeAtQuality)
    expect(result).toEqual({ quality: 95, bytes: sizeAtQuality(95) })
  })

  it('never exceeds the probe budget for the range 5..95', () => {
    let calls = 0
    searchQuality(500_000, (quality) => {
      calls += 1
      return sizeAtQuality(quality)
    })
    // 91 values in range 5..95 → binary search needs at most ~7 probes.
    expect(calls).toBeLessThanOrEqual(7)
  })

  it('honours custom quality bounds', () => {
    const result = searchQuality(3_500_000, sizeAtQuality, { min: 40, max: 60 })
    expect(result).not.toBeNull()
    expect(result!.quality).toBe(60)
  })
})

describe('nextScale', () => {
  it('steps down by 15%', () => {
    expect(nextScale(1)).toBeCloseTo(0.85, 3)
    // 0.85² = 0.7225 → 0.722 after float rounding; assert the ballpark.
    expect(nextScale(0.85)).toBeCloseTo(0.72, 2)
    expect(nextScale(0.85)).toBeLessThan(0.85)
  })

  it('floors at the minimum scale', () => {
    expect(nextScale(0.16)).toBe(MIN_SCALE)
    expect(nextScale(0.1)).toBe(MIN_SCALE)
  })

  it('reaches the floor in a bounded number of steps', () => {
    let scale = 1
    let steps = 0
    while (scale > MIN_SCALE && steps < 100) {
      const next = nextScale(scale)
      if (next === scale) break
      scale = next
      steps += 1
    }
    expect(steps).toBeLessThan(20)
  })
})

describe('constants', () => {
  it('probe quality sits inside the search range', () => {
    expect(PROBE_QUALITY).toBeGreaterThanOrEqual(5)
    expect(PROBE_QUALITY).toBeLessThanOrEqual(95)
  })

  it('fallback quality is below the probe quality', () => {
    expect(FALLBACK_QUALITY).toBeLessThan(PROBE_QUALITY)
  })
})
