/*
 * Typed worker pool.
 *
 * Each engine gets a pool of module workers. Every worker runs one job at a
 * time; the pool keeps idle workers and a waiting list, so N files process in
 * parallel up to `concurrency`. Cancelling terminates the workers (killing
 * the WASM instance outright) and they respawn lazily on the next run.
 */
import { EngineError } from './types'
import type { EngineName, EngineRunner, JobOutput, JobRequest, WorkerResponse } from './types'

type Waiter = {
  req: JobRequest
  resolve: (output: JobOutput) => void
  reject: (error: Error) => void
  onProgress?: (progress: number, note?: string) => void
  signal?: AbortSignal
}

type Slot = {
  worker: Worker
  busy: Waiter | null
}

export function createWorkerPool({
  name,
  concurrency,
  factory,
}: {
  name: EngineName
  concurrency: number
  factory: () => Worker
}): EngineRunner {
  const slots: Slot[] = []
  const idle: number[] = []
  const waiting: Waiter[] = []

  const ensureSlot = (): number => {
    if (idle.length > 0) return idle.pop() as number
    if (slots.length < concurrency) {
      const slot: Slot = { worker: factory(), busy: null }
      const index = slots.length
      slot.worker.onmessage = (event: MessageEvent<WorkerResponse>) => handleMessage(index, event.data)
      slot.worker.onerror = (event) => {
        const message = event.message || `${name} worker crashed`
        failSlot(index, new EngineError(message))
      }
      slots.push(slot)
      return index
    }
    return -1
  }

  const handleMessage = (index: number, message: WorkerResponse) => {
    const slot = slots[index]
    const job = slot?.busy
    if (!job || job.req.id !== message.id) return

    if (message.kind === 'progress') {
      job.onProgress?.(message.progress, message.note)
      return
    }
    if (message.kind === 'done') {
      slot.busy = null
      idle.push(index)
      job.resolve(message.output)
      dispatch()
      return
    }
    slot.busy = null
    idle.push(index)
    job.reject(new EngineError(message.message))
    dispatch()
  }

  /** Kill a broken or cancelled worker and drop the slot. */
  const failSlot = (index: number, error: Error) => {
    const slot = slots[index]
    if (!slot) return
    if (slot.busy) {
      const job = slot.busy
      slot.busy = null
      job.reject(error)
    }
    slot.worker.terminate()
    slots.splice(index, 1)
    // Re-index bookkeeping after splice.
    idle.length = 0
    slots.forEach((s, i) => {
      if (!s.busy) idle.push(i)
    })
    dispatch()
  }

  const dispatch = () => {
    while (waiting.length > 0) {
      const index = ensureSlot()
      if (index === -1) return
      const job = waiting.shift() as Waiter
      if (job.signal?.aborted) {
        idle.push(index)
        job.reject(new EngineError('cancelled'))
        continue
      }
      const slot = slots[index]
      slot.busy = job
      const transfer = job.req.inputs.map((input) => input.data)
      slot.worker.postMessage(job.req, transfer)
    }
  }

  return {
    name,
    concurrency,
    run(req, opts = {}) {
      return new Promise<JobOutput>((resolve, reject) => {
        const waiter: Waiter = { req, resolve, reject, onProgress: opts.onProgress, signal: opts.signal }
        const onAbort = () => {
          const at = waiting.indexOf(waiter)
          if (at !== -1) {
            waiting.splice(at, 1)
            reject(new EngineError('cancelled'))
          }
        }
        opts.signal?.addEventListener('abort', onAbort, { once: true })
        waiting.push(waiter)
        dispatch()
      })
    },
    abort() {
      for (const job of waiting.splice(0)) job.reject(new EngineError('cancelled'))
      for (const slot of slots) {
        if (slot.busy) {
          const job = slot.busy
          slot.busy = null
          job.reject(new EngineError('cancelled'))
        }
        slot.worker.terminate()
      }
      slots.length = 0
      idle.length = 0
    },
  }
}
