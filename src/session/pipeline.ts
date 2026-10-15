/*
 * Pipeline runner.
 *
 * Applies an ordered chain of tool steps to every dropped file: the output
 * of step N becomes the input of step N+1, so nothing is written to disk
 * between steps and quality is only lost where a step re-encodes.
 *
 * Files run in lanes (a few at a time), each lane processing its file's
 * steps sequentially — two buffers per lane, whatever the batch size.
 */
import { getToolOp, typeForName } from '@/engine/ops'
import { getTool } from '@/tools/registry'
import type { EngineName, EngineRunner } from '@/engine/types'
import type { ToolDef } from '@/tools/registry/types'
import type { PipelineStep } from './pipeline-codec'

export type ResolvedStep = {
  tool: ToolDef
  engine: EngineName
  op: string
  params: Record<string, unknown>
  /** True when this op consumes every file at once (GIF maker, merge, …). */
  combine: boolean
}

/** Controls' defaults become the step's starting params. */
export const stepDefaults = (tool: ToolDef): Record<string, unknown> =>
  Object.fromEntries(tool.controls.map((control) => [control.id, control.default]))

export function resolveStep(step: PipelineStep): ResolvedStep | null {
  const [category, slug] = step.toolRef.split('/')
  if (!category || !slug) return null
  const tool = getTool(category, slug)
  if (!tool) return null
  const binding = getToolOp(step.toolRef)
  if (!binding) return null
  const settings = { ...stepDefaults(tool), ...step.params }
  const params = binding.translate
    ? binding.translate(settings)
    : { ...(binding.fixed ?? {}), ...settings }
  return {
    tool,
    engine: binding.engine,
    op: binding.op,
    params,
    combine: binding.combine === true,
  }
}

export type PipelineFile = { id: string; name: string; type: string; file: File }

export type PipelineResult = { name: string; type: string; size: number; blob: Blob }

export type PipelineHooks = {
  onFileStart?(fileId: string): void
  onStepStart?(fileId: string, stepIndex: number, step: PipelineStep): void
  onProgress?(fileId: string, stepIndex: number, progress: number, note?: string): void
  onFileDone?(fileId: string, result: PipelineResult, ms: number): void
  onFileError?(fileId: string, message: string, cancelled: boolean): void
}

export type PipelineOptions = {
  files: PipelineFile[]
  steps: PipelineStep[]
  hooks?: PipelineHooks
  signal?: AbortSignal
  /** How many files process at once. */
  lanes?: number
}

/** Guards against pipelines whose intermediates would exhaust WASM memory. */
export const MAX_INTERMEDIATE_BYTES = 400 * 1024 * 1024

export async function runPipeline(options: PipelineOptions): Promise<void> {
  const { files, steps, hooks = {}, signal } = options
  if (files.length === 0 || steps.length === 0) return

  const { getEngines } = await import('@/engine/engines')
  const engines: Record<EngineName, EngineRunner> = getEngines()

  const resolved = steps.map(resolveStep)
  const firstMissing = resolved.findIndex((step) => step === null)
  if (firstMissing !== -1) {
    hooks.onFileError?.(files[0]?.id ?? 'pipeline', `step ${firstMissing + 1} is not wired to an engine`, false)
    return
  }
  const chain = resolved as ResolvedStep[]

  if (chain.some((step) => step.combine)) {
    hooks.onFileError?.(
      files[0]?.id ?? 'pipeline',
      'combining tools (merge, GIF maker) cannot run inside a chain — use them on their own page',
      false,
    )
    return
  }

  const totalSteps = chain.length
  const lanes = Math.max(1, Math.min(options.lanes ?? 3, files.length))
  let cursor = 0

  const runFile = async (item: PipelineFile) => {
    const startedAt = performance.now()
    hooks.onFileStart?.(item.id)

    let data = await item.file.arrayBuffer()
    let name = item.name
    let type = item.type || typeForName(item.name)

    for (let index = 0; index < totalSteps; index += 1) {
      if (signal?.aborted) {
        hooks.onFileError?.(item.id, 'cancelled', true)
        return
      }
      if (data.byteLength > MAX_INTERMEDIATE_BYTES) {
        hooks.onFileError?.(
          item.id,
          `step ${index + 1} produced ${Math.round(data.byteLength / 1048576)}MB — too large to chain further`,
          false,
        )
        return
      }
      const step = chain[index]
      hooks.onStepStart?.(item.id, index, steps[index])
      try {
        const output = await engines[step.engine].run(
          {
            id: `${item.id}-${index}`,
            op: step.op,
            inputs: [{ name, type, data }],
            params: step.params,
          },
          {
            signal,
            onProgress: (progress, note) => hooks.onProgress?.(item.id, index, progress, note),
          },
        )
        data = output.data
        name = output.name
        type = output.type
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const cancelled = signal?.aborted === true || message === 'cancelled'
        hooks.onFileError?.(
          item.id,
          cancelled ? 'cancelled' : `step ${index + 1} (${steps[index].toolRef}): ${message}`,
          cancelled,
        )
        return
      }
    }

    hooks.onFileDone?.(
      item.id,
      { name, type, size: data.byteLength, blob: new Blob([data], { type }) },
      performance.now() - startedAt,
    )
  }

  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= files.length) return
        await runFile(files[index])
      }
    }),
  )
}
