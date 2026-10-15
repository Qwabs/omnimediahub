import { describe, expect, it } from 'vitest'
import { decodePipeline, encodePipeline, formatToolRef, summariseParams } from './pipeline-codec'

describe('pipeline codec', () => {
  const steps = [
    { toolRef: 'convert/to-webp', params: { quality: 82 } },
    { toolRef: 'resize/resize-image-to-512x512', params: {} },
    { toolRef: 'compress/compress-to-100kb', params: { strategy: 'quality-first', note: 'Währung ünïcode' } },
  ]

  it('round-trips a pipeline including unicode params', () => {
    const decoded = decodePipeline(encodePipeline(steps))
    expect(decoded).toEqual(steps)
  })

  it('produces url-safe output', () => {
    const encoded = encodePipeline(steps)
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('returns null for junk instead of throwing', () => {
    expect(decodePipeline('not-base64!!')).toBeNull()
    expect(decodePipeline('')).toBeNull()
    expect(decodePipeline(null)).toBeNull()
    expect(decodePipeline(encodePipeline([]))).toBeNull()
  })

  it('drops malformed steps but keeps valid ones', () => {
    const payload = encodePipeline([
      { toolRef: 'convert/to-webp', params: {} },
      { toolRef: 'nope', params: {} } as { toolRef: string; params: Record<string, unknown> },
    ])
    const decoded = decodePipeline(payload)
    expect(decoded).toEqual([{ toolRef: 'convert/to-webp', params: {} }])
  })

  it('defaults missing params to an empty object', () => {
    const payload = encodePipeline([{ toolRef: 'convert/to-webp', params: {} }])
    const raw = decodePipeline(payload)
    expect(raw![0].params).toEqual({})
  })
})

describe('display helpers', () => {
  it('formats tool refs for the strip', () => {
    expect(formatToolRef('convert/to-webp')).toBe('convert · to-webp')
  })

  it('summarises params compactly', () => {
    expect(summariseParams({})).toBe('defaults')
    expect(summariseParams({ quality: 82 })).toBe('quality: 82')
    expect(summariseParams({ a: 1, b: 2, c: 3, d: 4 })).toBe('a: 1 · b: 2 · c: 3 +1')
  })
})
