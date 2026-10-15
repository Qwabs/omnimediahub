import { describe, expect, it } from 'vitest'
import {
  clampDelay,
  DEFAULT_DELAY_MS,
  describeSettings,
  INITIAL_GIF_SETTINGS,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  nextEscalation,
  retime,
  reverseDelays,
  skipIndices,
  sliceDelays,
  totalDuration,
  trimRange,
  type GifSettings,
} from './gif-timing'

describe('delays', () => {
  it('clamps to sane bounds', () => {
    expect(clampDelay(0)).toBe(MIN_DELAY_MS)
    expect(clampDelay(5)).toBe(MIN_DELAY_MS)
    expect(clampDelay(50_000)).toBe(MAX_DELAY_MS)
    expect(clampDelay(Number.NaN)).toBe(DEFAULT_DELAY_MS)
  })

  it('sums total duration with clamping', () => {
    expect(totalDuration([100, 100, 100])).toBe(300)
    expect(totalDuration([1, 1])).toBe(MIN_DELAY_MS * 2)
  })

  it('slices an arbitrary frame window', () => {
    expect(sliceDelays([1, 2, 3, 4], 1, 2)).toEqual([2, 3])
  })
})

describe('trimRange', () => {
  const delays = [200, 200, 200, 200, 200] // 1s total

  it('keeps frames overlapping the range', () => {
    expect(trimRange(delays, 0, 600)).toEqual({ from: 0, to: 2 })
    expect(trimRange(delays, 400, 900)).toEqual({ from: 2, to: 4 })
  })

  it('never returns an empty window', () => {
    expect(trimRange(delays, 0, 0)).toEqual({ from: 0, to: 0 })
    const past = trimRange(delays, 5000, 6000)
    expect(past.from).toBe(4)
    expect(past.to).toBe(4)
  })

  it('handles empty input', () => {
    expect(trimRange([], 0, 100)).toEqual({ from: 0, to: -1 })
  })
})

describe('retime', () => {
  it('halves delays at 2x speed', () => {
    expect(retime([100, 200], 2)).toEqual([50, 100])
  })

  it('doubles delays at half speed', () => {
    expect(retime([100, 200], 0.5)).toEqual([200, 400])
  })

  it('clamps extreme speeds', () => {
    expect(retime([40], 5)).toEqual([MIN_DELAY_MS])
    expect(retime([100], 0.05)).toEqual([2000])
    expect(retime([100], 0.001)).toEqual([MAX_DELAY_MS])
  })
})

describe('skipIndices', () => {
  it('keeps every frame at step 1', () => {
    expect(skipIndices(4, 1)).toEqual([0, 1, 2, 3])
  })

  it('drops frames at larger steps', () => {
    expect(skipIndices(6, 2)).toEqual([0, 2, 4])
    expect(skipIndices(7, 3)).toEqual([0, 3, 6])
  })

  it('always keeps at least one frame', () => {
    expect(skipIndices(1, 3)).toEqual([0])
    expect(skipIndices(0, 2)).toEqual([0])
  })
})

describe('reverse', () => {
  it('reverses without mutating', () => {
    const source = [1, 2, 3]
    expect(reverseDelays(source)).toEqual([3, 2, 1])
    expect(source).toEqual([1, 2, 3])
  })
})

describe('size ladder', () => {
  const walk = (settings: GifSettings): GifSettings[] => {
    const trail = [settings]
    let current: GifSettings | null = settings
    while ((current = nextEscalation(current)) !== null) trail.push(current)
    return trail
  }

  it('reduces palette before dimensions before frames', () => {
    const first = nextEscalation(INITIAL_GIF_SETTINGS)
    expect(first).toMatchObject({ colors: 128, scale: 1, skip: 1 })

    const atColorsFloor: GifSettings = { colors: 64, scale: 1, skip: 1 }
    expect(nextEscalation(atColorsFloor)!.scale).toBeLessThan(1)

    const atScaleFloor: GifSettings = { colors: 64, scale: 0.5, skip: 1 }
    expect(nextEscalation(atScaleFloor)).toMatchObject({ skip: 2 })
  })

  it('terminates instead of looping forever', () => {
    const trail = walk(INITIAL_GIF_SETTINGS)
    expect(trail.length).toBeGreaterThan(4)
    expect(trail.length).toBeLessThan(30)
    expect(nextEscalation(trail[trail.length - 1])).toBeNull()
  })

  it('describes what was given up', () => {
    expect(describeSettings(INITIAL_GIF_SETTINGS)).toBe('original quality')
    expect(describeSettings({ colors: 64, scale: 0.7, skip: 2 })).toBe('64 colours, 70% scale, every 2rd frame')
  })
})
