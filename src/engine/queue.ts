/*
 * Job queue.
 *
 * A job is one engine call. Files are read from disk lazily — bytes are only
 * materialised when a lane picks the job up, so a 500-file batch never holds
 * 500 buffers in memory at once.
 */
import { EngineError } from './types'
import type { EngineName, EngineRunner, JobInput, JobOutput, JobRequest } from './types'

export type JobSpec = {
  id: string
  toolRef: string
  engine: EngineName
  op: string
  /** Source files; read lazily. */
  sources: { file: File; name: string; type: string }[]
  params: Record<string, unknown>
}

export type JobOutcome =
  | { id: string; ok: true; output: JobOutput; ms: number }
  | { id: string; ok: false; error: string; cancelled: boolean }

export type QueueHooks = {
  onStart?(job: JobSpec): void
  onProgress?(job: JobSpec, progress: number, note?: string): void
  onDone?(job: JobSpec, output: JobOutput, ms: number): void
  onError?(job: JobSpec, error: Error, cancelled: boolean): void
}

export async function runJobs(
  specs: JobSpec[],
  engines: Record<EngineName, EngineRunner>,
  hooks: QueueHooks = {},
  signal?: AbortSignal,
): Promise<JobOutcome[]> {
  const byEngine = new Map<EngineName, JobSpec[]>()
  for (const spec of specs) {
    const list = byEngine.get(spec.engine) ?? []
    list.push(spec)
    byEngine.set(spec.engine, list)
  }

  const outcomes: JobOutcome[] = []

  await Promise.all(
    [...byEngine.entries()].map(async ([engineName, list]) => {
      const engine = engines[engineName]
      const lanes = Math.max(1, Math.min(engine.concurrency, list.length))
      let cursor = 0

      const lane = async () => {
        while (cursor < list.length) {
          const spec = list[cursor]
          cursor += 1

          if (signal?.aborted) {
            outcomes.push({ id: spec.id, ok: false, error: 'cancelled', cancelled: true })
            continue
          }

          hooks.onStart?.(spec)
          const startedAt = performance.now()
          try {
            const inputs: JobInput[] = []
            for (const source of spec.sources) {
              inputs.push({
                name: source.name,
                type: source.type,
                data: await source.file.arrayBuffer(),
              })
            }
            const req: JobRequest = { id: spec.id, op: spec.op, inputs, params: spec.params }
            const output = await engine.run(req, {
              signal,
              onProgress: (progress, note) => hooks.onProgress?.(spec, progress, note),
            })
            const ms = performance.now() - startedAt
            outcomes.push({ id: spec.id, ok: true, output, ms })
            hooks.onDone?.(spec, output, ms)
          } catch (error) {
            const cancelled = signal?.aborted === true || error instanceof EngineError && error.message === 'cancelled'
            const message = error instanceof Error ? error.message : String(error)
            outcomes.push({ id: spec.id, ok: false, error: message, cancelled })
            hooks.onError?.(spec, error instanceof Error ? error : new Error(message), cancelled)
          }
        }
      }

      await Promise.all(Array.from({ length: lanes }, lane))
    }),
  )

  return outcomes
}

/** Serialise engine calls for main-thread engines (ffmpeg, audio). */
export function createSerialRunner(
  name: EngineName,
  run: (
    req: JobRequest,
    opts: { onProgress?: (progress: number, note?: string) => void; signal?: AbortSignal },
  ) => Promise<JobOutput>,
  abort: () => void,
): EngineRunner {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    name,
    concurrency: 1,
    run(req, opts = {}) {
      const result = tail.then(() => {
        if (opts.signal?.aborted) throw new EngineError('cancelled')
        return run(req, opts)
      })
      tail = result.catch(() => undefined)
      return result
    },
    abort,
  }
}
