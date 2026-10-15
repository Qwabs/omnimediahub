/*
 * Session runner.
 *
 * Turns a tool + its settings into engine jobs, streams progress into the
 * store, and produces downloadable results. Cancelling aborts the queue and
 * hard-terminates the engines.
 */
import { formatBytes, sizeDelta } from '@/engine/io/download'
import { fileMatchesTool, getToolOp, typeForName } from '@/engine/ops'
import { runJobs } from '@/engine/queue'
import type { JobSpec } from '@/engine/queue'
import type { ToolDef } from '@/tools/registry/types'
import { useSession } from './store'
import type { SessionFile } from './store'

let controller: AbortController | null = null
let runSeq = 0

export const isRunning = (): boolean => controller !== null

export function cancelRun(): void {
  if (!controller) return
  controller.abort()
  controller = null
  void import('@/engine/engines').then(({ abortAllEngines }) => abortAllEngines())
  const store = useSession.getState()
  store.setRunning(false, null)
  store.log('warn', 'cancel requested — terminating engines')
}

const sourceOf = (file: SessionFile) => ({
  file: file.file,
  name: file.name,
  type: file.type || typeForName(file.name),
})

export async function runTool(tool: ToolDef, settings: Record<string, unknown>): Promise<void> {
  const toolRef = `${tool.category}/${tool.slug}`
  const store = useSession.getState()

  if (isRunning()) return

  const binding = getToolOp(toolRef)
  if (!binding) {
    store.log('warn', `engine not wired for ${toolRef} yet — this tool is still [ soon ]`)
    return
  }

  const usable = store.files.filter((f) => fileMatchesTool(tool.accepts, f.file))
  const unsupported = store.files.filter((f) => !fileMatchesTool(tool.accepts, f.file))
  const isGenerator = tool.generator === true

  if (!isGenerator && store.files.length === 0) {
    store.log('warn', 'no files queued — add files first')
    return
  }
  if (!isGenerator && usable.length === 0) {
    store.log('error', `none of the ${store.files.length} file(s) match ${tool.accepts.join(' · ')}`)
    return
  }
  if (tool.generator && store.files.length > 0) {
    store.log('info', 'this tool generates its output from settings — dropped files are ignored')
  }

  // Some tools need a secondary file (e.g. a watermark logo or a painted mask).
  const assetId = tool.asset?.id ?? (tool.mask ? 'mask' : undefined)
  const assetFile = assetId ? store.assets[assetId] : undefined
  const needsAsset =
    Boolean(tool.asset || tool.mask) &&
    (binding.op === 'watermark' ? settings.type === 'image' : true)
  if (needsAsset && !assetFile) {
    store.log(
      'error',
      `${tool.title} needs ${tool.asset?.label ?? 'a painted mask'} — add one first`,
    )
    return
  }

  const { getEngines } = await import('@/engine/engines')
  const engines = getEngines()

  const seq = (runSeq += 1)
  const current = new AbortController()
  controller = current
  const signal = current.signal

  const usableIds = new Set(usable.map((f) => f.id))
  useSession.setState((state) => ({
    running: true,
    activeToolRef: toolRef,
    progress: 0,
    combinedResults: [],
    files: isGenerator
      ? state.files
      : state.files.map((f) => {
          if (usableIds.has(f.id)) {
            return { ...f, state: 'queued' as const, progress: 0, error: undefined, result: undefined, ms: undefined }
          }
          return { ...f, error: 'unsupported input for this tool', state: 'error' as const }
        }),
  }))

  const { log } = useSession.getState()
  log(
    'info',
    `run ${toolRef} · engine ${binding.engine} · op ${binding.op} · ${
      binding.combine ? `${usable.length} inputs → 1 output` : `${usable.length} file(s)`
    }`,
  )
  if (unsupported.length > 0) {
    log('warn', `${unsupported.length} file(s) skipped — unsupported input`)
  }

  const params = binding.translate
    ? binding.translate(settings)
    : { ...(binding.fixed ?? {}), ...settings }
  const assetSource = assetFile
    ? { file: assetFile, name: assetFile.name, type: assetFile.type || typeForName(assetFile.name) }
    : undefined
  const specs: JobSpec[] = binding.combine || isGenerator
    ? [
        {
          id: 'combine',
          toolRef,
          engine: binding.engine,
          op: binding.op,
          sources: isGenerator
            ? assetSource
              ? [assetSource]
              : []
            : assetSource
              ? [...usable.map(sourceOf), assetSource]
              : usable.map(sourceOf),
          params,
        },
      ]
    : usable.map((file) => ({
        id: file.id,
        toolRef,
        engine: binding.engine,
        op: binding.op,
        sources: assetSource ? [sourceOf(file), assetSource] : [sourceOf(file)],
        params,
      }))

  const fileByJob = new Map(usable.map((f) => [f.id, f]))
  const progressByJob = new Map<string, number>()
  const startedAt = performance.now()

  const reportProgress = () => {
    if (seq !== runSeq) return
    const values = [...progressByJob.values()]
    const average = values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length
    useSession.getState().setProgress(Math.round(average))
  }

  const outcomes = await runJobs(
    specs,
    engines,
    {
      onStart(job) {
        if (seq !== runSeq) return
        const file = fileByJob.get(job.id)
        if (file) useSession.getState().patchFile(file.id, { state: 'running', progress: 1 })
        else log('run', `combining ${job.sources.length} inputs…`)
      },
      onProgress(job, progress, note) {
        if (seq !== runSeq) return
        progressByJob.set(job.id, progress)
        const file = fileByJob.get(job.id)
        if (file) useSession.getState().patchFile(file.id, { state: 'running', progress })
        reportProgress()
        if (note && job.sources.length === 1) {
          // Surface engine notes for slow single-file jobs only.
          const file2 = fileByJob.get(job.id)
          if (file2 && file2.size > 20_000_000) log('run', `${file2.name} — ${note}`)
        }
      },
      onDone(job, output, ms) {
        if (seq !== runSeq) return
        progressByJob.set(job.id, 100)
        reportProgress()
        const blob = new Blob([output.data], { type: output.type })
        const result = { name: output.name, type: output.type, size: output.data.byteLength, blob }
        const file = fileByJob.get(job.id)
        if (file) {
          useSession.getState().patchFile(file.id, {
            state: 'done',
            progress: 100,
            ms,
            result,
          })
          log(
            'ok',
            `${file.name} → ${output.name}   ${sizeDelta(file.size, output.data.byteLength)}   ${Math.round(ms)}ms`,
          )
        } else {
          useSession.getState().addCombinedResult(result)
          log(
            'ok',
            `${output.name}   ${formatBytes(output.data.byteLength)}   ${job.sources.length} inputs   ${Math.round(ms)}ms`,
          )
        }
        for (const note of output.notes ?? []) log('info', note)
      },
      onError(job, error, cancelled) {
        if (seq !== runSeq) return
        const file = fileByJob.get(job.id)
        if (cancelled) {
          // Put the file back in the queue — cancel is not a failure.
          if (file) {
            useSession.getState().patchFile(file.id, {
              state: 'queued',
              progress: 0,
              error: undefined,
            })
          }
          return
        }
        const message = error.message
        if (file) {
          useSession.getState().patchFile(file.id, { state: 'error', error: message, progress: 0 })
        }
        log('error', `${file?.name ?? job.toolRef} — ${message}`)
      },
    },
    signal,
  )

  if (seq !== runSeq) return

  controller = null

  const ok = outcomes.filter((outcome) => outcome.ok).length
  const failed = outcomes.length - ok
  const cancelled = outcomes.some((outcome) => !outcome.ok && outcome.cancelled)
  const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1)
  const inBytes = usable.reduce((sum, file) => sum + file.size, 0)
  const outBytes = outcomes.reduce(
    (sum, outcome) => sum + (outcome.ok ? outcome.output.data.byteLength : 0),
    0,
  )

  if (cancelled) {
    log('warn', `cancelled after ${elapsed}s — ${ok} completed`)
  } else {
    log(
      failed > 0 ? 'warn' : 'ok',
      `done in ${elapsed}s · ${ok} ok${failed > 0 ? ` · ${failed} failed` : ''}${
        outBytes > 0 ? ` · ${sizeDelta(inBytes, outBytes)}` : ''
      }`,
    )
  }

  const finalStore = useSession.getState()
  finalStore.setRunning(false, toolRef)
  finalStore.setProgress(100)
}
