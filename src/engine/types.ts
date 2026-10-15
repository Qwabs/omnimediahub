/*
 * Engine layer types.
 *
 * A job is a single unit of work for one engine: inputs (one file for
 * per-file tools, several for combining tools like the GIF maker) plus
 * plain params that map 1:1 to a tool's control values.
 */

export type EngineName = 'vips' | 'raster' | 'gif' | 'ffmpeg' | 'audio' | 'ai' | 'exif'

export type JobInput = {
  /** Original file name (used for logging and output naming). */
  name: string
  /** MIME type, when known. */
  type: string
  /** Raw bytes. Transferred to the engine — do not reuse afterwards. */
  data: ArrayBuffer
}

export type JobRequest = {
  id: string
  op: string
  inputs: JobInput[]
  params: Record<string, unknown>
}

export type JobOutput = {
  name: string
  type: string
  data: ArrayBuffer
  /** Extra lines the runner logs to the console (e.g. metadata summary). */
  notes?: string[]
}

export type WorkerRequest = JobRequest

export type WorkerResponse =
  | { id: string; kind: 'progress'; progress: number; note?: string }
  | { id: string; kind: 'done'; output: JobOutput }
  | { id: string; kind: 'error'; message: string }

/** A running engine. Workers and main-thread engines implement this. */
export type EngineRunner = {
  name: EngineName
  /** How many jobs may run at once. */
  concurrency: number
  run(
    req: JobRequest,
    opts: {
      onProgress?: (progress: number, note?: string) => void
      signal?: AbortSignal
    },
  ): Promise<JobOutput>
  /** Hard-stop everything in flight (cancel). */
  abort(): void
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineError'
  }
}
