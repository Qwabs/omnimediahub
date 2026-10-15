/**
 * Runtime capability detection. Drives fallbacks and honest messaging.
 */
export type Capabilities = {
  crossOriginIsolated: boolean
  sharedArrayBuffer: boolean
  webgpu: boolean
  webcodecs: boolean
  opfs: boolean
  hardwareConcurrency: number
}

let cached: Capabilities | null = null

export function capabilities(): Capabilities {
  if (cached) return cached
  cached = {
    crossOriginIsolated:
      typeof globalThis.crossOriginIsolated === 'boolean' ? globalThis.crossOriginIsolated : false,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webgpu: 'gpu' in navigator,
    webcodecs: typeof globalThis.VideoDecoder !== 'undefined',
    opfs: typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage,
    hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
  }
  return cached
}

/** Concurrency per engine, sized to the machine. */
export function poolSize(engine: 'vips' | 'gif'): number {
  const cores = capabilities().hardwareConcurrency
  const cap = engine === 'vips' ? 4 : 2
  return Math.max(1, Math.min(cap, cores - 1))
}
