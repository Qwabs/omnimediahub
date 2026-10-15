/*
 * Engine assembly.
 *
 * vips + gif are real worker pools (terminating a worker is our cancel
 * primitive). ffmpeg and audio are main-thread engines serialised by a lane
 * of one — the ffmpeg core runs in its own worker internally.
 */
import { poolSize } from '../capabilities'
import { createSerialRunner } from '../queue'
import { createWorkerPool } from '../worker-pool'
import type { EngineName, EngineRunner } from '../types'
import { createAudioEngine } from './audio'
import { createAiEngine } from './ai'
import { createExifEngine } from './exif'
import { createFFmpegEngine } from './ffmpeg'

let engines: Record<EngineName, EngineRunner> | null = null

export function getEngines(): Record<EngineName, EngineRunner> {
  if (engines) return engines

  const ffmpegEngine = createFFmpegEngine()
  const audioEngine = createAudioEngine()
  const exifEngine = createExifEngine()

  engines = {
    vips: createWorkerPool({
      name: 'vips',
      concurrency: poolSize('vips'),
      factory: () => new Worker(new URL('../workers/vips.worker.ts', import.meta.url), { type: 'module' }),
    }),
    raster: createWorkerPool({
      name: 'raster',
      concurrency: poolSize('vips'),
      factory: () => new Worker(new URL('../workers/raster.worker.ts', import.meta.url), { type: 'module' }),
    }),
    gif: createWorkerPool({
      name: 'gif',
      concurrency: poolSize('gif'),
      factory: () => new Worker(new URL('../workers/gif.worker.ts', import.meta.url), { type: 'module' }),
    }),
    ai: createAiEngine(),
    ffmpeg: createSerialRunner('ffmpeg', ffmpegEngine.run, ffmpegEngine.abort),
    audio: createSerialRunner('audio', audioEngine.run, audioEngine.abort),
    exif: createSerialRunner('exif', exifEngine.run, exifEngine.abort),
  }

  return engines
}

/** Hard-stop everything in flight (used by the session's cancel action). */
export function abortAllEngines(): void {
  if (!engines) return
  for (const engine of Object.values(engines)) engine.abort()
}
