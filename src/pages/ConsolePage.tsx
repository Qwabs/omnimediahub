import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AsciiProgress } from '@/design/ascii'
import { Console } from '@/components/Console'
import { ControlField } from '@/components/ControlField'
import { DropZone } from '@/components/DropZone'
import { FileList, FileRow } from '@/components/FileRow'
import { HairlineCell, HairlineGrid } from '@/components/HairlineGrid'
import { PageHeader } from '@/components/PageHeader'
import { Tabs } from '@/components/Tabs'
import { downloadBlob, downloadZipOf, formatBytes, sizeDelta } from '@/engine/io/download'
import { ALL_TOOLS, CATEGORIES, getTool } from '@/tools/registry'
import { runPipeline, stepDefaults } from '@/session/pipeline'
import { decodePipeline, encodePipeline, summariseParams, type PipelineStep } from '@/session/pipeline-codec'
import { useSession } from '@/session/store'
import { useSeo } from '@/lib/use-seo'
import { findRouteMeta } from '@/lib/seo'

/* ------------------------------------------------------------------ */
/* presets                                                            */
/* ------------------------------------------------------------------ */

const PRESETS: { id: string; label: string; steps: PipelineStep[] }[] = [
  {
    id: 'web-delivery',
    label: 'web delivery',
    steps: [
      { toolRef: 'convert/to-webp', params: { quality: 82 } },
      { toolRef: 'resize/image-resizer', params: { mode: 'longest', longest: 1920, neverUpscale: true } },
      { toolRef: 'compress/compress-to-200kb', params: {} },
    ],
  },
  {
    id: 'social-square',
    label: 'social square',
    steps: [
      { toolRef: 'crop/image-cropper', params: { ratio: '1:1', anchor: 'center' } },
      { toolRef: 'resize/resize-image-to-1080x1080', params: {} },
      { toolRef: 'compress/compress-to-500kb', params: {} },
    ],
  },
  {
    id: 'privacy-strip',
    label: 'privacy strip',
    steps: [
      { toolRef: 'exif/exif-editor', params: { stripAll: true } },
      { toolRef: 'convert/image-converter', params: { format: 'jpg', quality: 90 } },
    ],
  },
  {
    id: 'email-ready',
    label: 'email ready',
    steps: [
      { toolRef: 'resize/image-resizer', params: { mode: 'longest', longest: 1600, neverUpscale: true } },
      { toolRef: 'compress/compress-to-1mb', params: {} },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* page                                                               */
/* ------------------------------------------------------------------ */

export function ConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sharedKey = searchParams.get('p')
  const sharedSteps = useMemo(() => decodePipeline(sharedKey), [sharedKey])

  const storePipeline = useSession((state) => state.pipeline)
  const setPipeline = useSession((state) => state.setPipeline)

  const files = useSession((state) => state.files)
  const logs = useSession((state) => state.logs)
  const addFiles = useSession((state) => state.addFiles)
  const removeFile = useSession((state) => state.removeFile)
  const clearFiles = useSession((state) => state.clearFiles)
  const clearResults = useSession((state) => state.clearResults)
  const log = useSession((state) => state.log)
  const setRunning = useSession((state) => state.setRunning)
  const setProgress = useSession((state) => state.setProgress)
  const overallProgress = useSession((state) => state.progress)

  // The shared link wins until the user edits the chain.
  const steps = sharedSteps ?? storePipeline
  const [selected, setSelected] = useState(0)
  const [tab, setTab] = useState('files')
  const [query, setQuery] = useState('')
  const [running, setLocalRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const results = useMemo(
    () =>
      files
        .filter((file) => file.result)
        .map((file) => ({ key: file.id, name: file.result!.name, blob: file.result!.blob, size: file.result!.size, fromSize: file.size })),
    [files],
  )

  const applySteps = (next: PipelineStep[]) => {
    setPipeline(next)
    if (sharedSteps) {
      // Editing a shared pipeline detaches it from the URL.
      searchParams.delete('p')
      setSearchParams(searchParams, { replace: true })
    }
  }

  /** Reorder through applySteps so shared chains detach when edited. */
  const moveChainStep = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    applySteps(next)
    setSelected(target)
  }

  const removeChainStep = (index: number) => {
    applySteps(steps.filter((_, at) => at !== index))
    setSelected(0)
  }

  const chainableTools = useMemo(() => ALL_TOOLS.filter((tool) => tool.chainable), [])
  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = needle
      ? chainableTools.filter((tool) => `${tool.title} ${tool.slug} ${tool.category}`.toLowerCase().includes(needle))
      : chainableTools
    return list.slice(0, 40)
  }, [chainableTools, query])

  const share = () => {
    const url = `${window.location.origin}/console?p=${encodePipeline(steps)}`
    void navigator.clipboard?.writeText(url).then(
      () => log('ok', `[+] pipeline link copied (${steps.length} steps): ${url}`),
      () => log('warn', `[!] clipboard unavailable — copy this link: ${url}`),
    )
  }

  const run = async () => {
    if (steps.length === 0 || files.length === 0 || running) return
    const controller = new AbortController()
    abortRef.current = controller
    setLocalRunning(true)
    setRunning(true, 'console')
    setTab('console')
    log('info', `pipeline: ${steps.length} step(s) × ${files.length} file(s)`)
    const started = performance.now()

    const stepProgress = new Map<string, number>()
    useSession.setState((state) => ({
      files: state.files.map((file) => ({
        ...file,
        state: 'queued' as const,
        progress: 0,
        error: undefined,
        result: undefined,
        ms: undefined,
      })),
    }))

    await runPipeline({
      files: files.map((file) => ({ id: file.id, name: file.name, type: file.type, file: file.file })),
      steps,
      signal: controller.signal,
      lanes: 3,
      hooks: {
        onFileStart(fileId) {
          useSession.getState().patchFile(fileId, { state: 'running', progress: 2 })
        },
        onProgress(fileId, stepIndex, progress) {
          stepProgress.set(`${fileId}-${stepIndex}`, progress)
          const overall = Math.min(99, Math.round(((stepIndex + progress / 100) / steps.length) * 100))
          useSession.getState().patchFile(fileId, { progress: overall })
          const values = [...stepProgress.values()]
          if (values.length > 0) {
            useSession.getState().setProgress(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length))
          }
        },
        onFileDone(fileId, result, ms) {
          const file = useSession.getState().files.find((item) => item.id === fileId)
          useSession.getState().patchFile(fileId, { state: 'done', progress: 100, ms, result })
          log(
            'ok',
            `${file?.name ?? fileId} → ${result.name}   ${file ? sizeDelta(file.size, result.size) : formatBytes(result.size)}   ${Math.round(ms)}ms`,
          )
        },
        onFileError(fileId, message, cancelled) {
          const file = useSession.getState().files.find((item) => item.id === fileId)
          if (cancelled) {
            useSession.getState().patchFile(fileId, { state: 'queued', progress: 0, error: undefined })
            return
          }
          useSession.getState().patchFile(fileId, { state: 'error', progress: 0, error: message })
          log('error', `${file?.name ?? fileId} — ${message}`)
        },
      },
    })

    const elapsed = ((performance.now() - started) / 1000).toFixed(1)
    const state = useSession.getState()
    const ok = state.files.filter((file) => file.state === 'done').length
    const failed = state.files.filter((file) => file.state === 'error').length
    const cancelled = controller.signal.aborted
    log(
      cancelled ? 'warn' : failed > 0 ? 'warn' : 'ok',
      cancelled
        ? `cancelled after ${elapsed}s — ${ok} finished`
        : `done in ${elapsed}s · ${ok} ok${failed > 0 ? ` · ${failed} failed` : ''}`,
    )

    abortRef.current = null
    setLocalRunning(false)
    setRunning(false, 'console')
    setProgress(100)
    setTab('results')
  }

  const cancel = () => {
    abortRef.current?.abort()
    void import('@/engine/engines').then(({ abortAllEngines }) => abortAllEngines())
    log('warn', 'cancel requested — terminating engines')
  }

  const saveAll = () => {
    void downloadZipOf(
      results.map((result) => ({ name: result.name, blob: result.blob })),
      'omnimediahub-pipeline.zip',
    )
  }

  const selectedStep = steps[selected]
  const selectedTool = selectedStep ? getTool(...(selectedStep.toolRef.split('/') as [string, string])) : undefined

  useSeo(findRouteMeta('/console'))

  return (
    <div className="mx-auto max-w-page px-6 pb-section">
      <PageHeader
        title="Pipeline console"
        lead="Chain tools and run the whole chain over a batch — convert, resize, compress and clean up in one pass, without re-uploading or re-encoding by hand."
        breadcrumbs={[{ label: 'home', to: '/' }, { label: 'console' }]}
        aside={<span className="text-caption-md text-mute">[ {steps.length} steps · {files.length} files ]</span>}
      />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <span className="text-caption-md text-mute">[ presets ]</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="btn btn-secondary h-8 px-3 text-caption-md"
            data-testid={`preset-${preset.id}`}
            onClick={() => applySteps(preset.steps)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-secondary h-8 px-3 text-caption-md"
          onClick={share}
          disabled={steps.length === 0}
        >
          [ copy link ]
        </button>
        {steps.length > 0 ? (
          <button
            type="button"
            className="btn btn-secondary h-8 px-3 text-caption-md"
            onClick={() => applySteps([])}
          >
            [ clear chain ]
          </button>
        ) : null}
      </div>

      <div className="grid gap-px border border-hairline bg-hairline lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------- main column ---------------- */}
        <div className="bg-canvas">
          {/* pipeline strip */}
          <div className="hairline-b p-4">
            <div className="pb-2 text-caption-md text-mute">
              [ chain ]{' '}
              {steps.length === 0
                ? 'empty — add a step from the list below or start from a preset'
                : steps.map((step, index) => `${index + 1}. ${step.toolRef.split('/')[1]}`).join(' → ')}
            </div>
            <ul data-testid="pipeline-steps">
              {steps.map((step, index) => {
                const tool = getTool(...(step.toolRef.split('/') as [string, string]))
                return (
                  <li key={`${step.toolRef}-${index}`} className="hairline-b flex flex-wrap items-center gap-3 py-2">
                    <button
                      type="button"
                      className={`text-left text-body-md ${index === selected ? 'text-ink underline decoration-ash underline-offset-4' : 'text-body'}`}
                      onClick={() => setSelected(index)}
                    >
                      <span className="pr-2 text-mute">[{index + 1}]</span>
                      {tool?.title ?? step.toolRef}
                    </button>
                    <span className="text-caption-md text-mute">{summariseParams(step.params)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        className="text-caption-md text-mute hover:text-ink"
                        aria-label={`Move step ${index + 1} up`}
                        onClick={() => moveChainStep(index, -1)}
                      >
                        [↑]
                      </button>
                      <button
                        type="button"
                        className="text-caption-md text-mute hover:text-ink"
                        aria-label={`Move step ${index + 1} down`}
                        onClick={() => moveChainStep(index, 1)}
                      >
                        [↓]
                      </button>
                      <button
                        type="button"
                        className="text-caption-md text-mute hover:text-ink"
                        aria-label={`Remove step ${index + 1}`}
                        onClick={() => removeChainStep(index)}
                      >
                        [x]
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>

            {/* tool picker */}
            <div className="pt-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Add a step — search ${chainableTools.length} chainable tools…`}
                aria-label="Search chainable tools"
                data-testid="step-search"
                className="field"
              />
              <ul className="mt-2 max-h-48 overflow-y-auto border border-hairline">
                {filteredTools.map((tool) => (
                  <li key={`${tool.category}/${tool.slug}`} className="hairline-b">
                    <button
                      type="button"
                      className="row-hover flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-caption-md"
                      onClick={() => {
                        applySteps([...steps, { toolRef: `${tool.category}/${tool.slug}`, params: {} }])
                        setSelected(steps.length)
                        setQuery('')
                      }}
                    >
                      <span className="text-ink">
                        <span className="pr-2 text-mute">[+]</span>
                        {tool.title}
                      </span>
                      <span className="shrink-0 text-mute">{CATEGORIES.find((c) => c.id === tool.category)?.title ?? tool.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* action bar */}
          <div className="hairline-b flex flex-wrap items-center gap-3 px-4 py-3">
            <button
              type="button"
              className="btn btn-primary h-9"
              data-testid="run-pipeline"
              disabled={steps.length === 0 || files.length === 0 || running}
              onClick={() => void run()}
            >
              {running ? 'running…' : `[ run ${steps.length}×${files.length} ]`}
            </button>
            {running ? (
              <button type="button" className="btn btn-secondary h-9" onClick={cancel} data-testid="cancel-pipeline">
                [ cancel ]
              </button>
            ) : null}
            {!running && results.length > 0 ? (
              <button type="button" className="btn btn-secondary h-9" onClick={saveAll}>
                [ save all · zip ]
              </button>
            ) : null}
            {!running && results.length > 0 ? (
              <button type="button" className="btn btn-secondary h-9" onClick={clearResults}>
                [ reset ]
              </button>
            ) : null}
            {!running && files.length > 0 ? (
              <button type="button" className="btn btn-secondary h-9" onClick={clearFiles}>
                [ clear files ]
              </button>
            ) : null}
            <span className="ml-auto text-caption-md text-mute">
              {running ? <AsciiProgress value={overallProgress} width={12} /> : null}
            </span>
          </div>

          <Tabs
            label="Console workspace"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'files', label: `files [${files.length}]` },
              { id: 'results', label: `results [${results.length}]` },
              { id: 'console', label: 'console' },
            ]}
          />

          {tab === 'files' ? (
            <div className="p-4">
              <DropZone onFiles={addFiles} accept="image/*,video/*,audio/*,.zip" hint="images, GIFs, video or audio · folders & ZIP supported" />
              {files.length > 0 ? (
                <FileList>
                  {files.map((file) => (
                    <FileRow
                      key={file.id}
                      name={file.name}
                      state={file.state === 'running' ? 'running' : file.state === 'done' ? 'done' : file.state === 'error' ? 'error' : 'queued'}
                      progress={file.progress}
                      meta={file.result ? sizeDelta(file.size, file.result.size) : formatBytes(file.size)}
                      error={file.error}
                      onRemove={running ? undefined : () => removeFile(file.id)}
                    />
                  ))}
                </FileList>
              ) : null}
            </div>
          ) : null}

          {tab === 'results' ? (
            <div className="p-4">
              {results.length === 0 ? (
                <p className="text-caption-md text-mute">[ ] no results yet — build a chain, add files, then run</p>
              ) : (
                <ul className="border-t border-hairline">
                  {results.map((result) => (
                    <li
                      key={result.key}
                      data-testid="result"
                      data-name={result.name}
                      data-size={result.size}
                      className="hairline-b flex items-center justify-between gap-4 py-2 text-body-md"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="shrink-0 text-ink">
                          [✓]
                        </span>
                        <span className="truncate text-ink">{result.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-4">
                        <span className="text-caption-md tabular-nums text-mute">{sizeDelta(result.fromSize, result.size)}</span>
                        <button
                          type="button"
                          className="btn btn-secondary h-7 px-2 text-caption-md"
                          onClick={() => downloadBlob(result.blob, result.name)}
                        >
                          [ save ]
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'console' ? <Console lines={logs} status={running ? 'running' : 'idle'} /> : null}
        </div>

        {/* ---------------- settings column ---------------- */}
        <aside className="bg-canvas p-4">
          <h2 className="pb-3 text-heading-md text-ink">
            {selectedTool ? `[ step ${selected + 1} ] ${selectedTool.title}` : '[ step settings ]'}
          </h2>
          {selectedTool && selectedStep ? (
            <>
              <p className="pb-4 text-caption-md text-mute">{selectedTool.description}</p>
              <div className="flex flex-col gap-5" data-testid="step-settings">
                {selectedTool.controls.length === 0 ? (
                  <p className="text-caption-md text-mute">[ ] this step needs no settings</p>
                ) : (
                  selectedTool.controls.map((control) => {
                    const defaults = stepDefaults(selectedTool)
                    const current = { ...defaults, ...selectedStep.params }[control.id]
                    return (
                      <ControlField
                        key={control.id}
                        control={control}
                        value={current}
                        onChange={(value) =>
                          applySteps(
                            steps.map((step, index) =>
                              index === selected
                                ? { ...step, params: { ...step.params, [control.id]: value } }
                                : step,
                            ),
                          )
                        }
                      />
                    )
                  })
                )}
              </div>
            </>
          ) : (
            <p className="text-caption-md text-mute">
              [ ] select a step above to tune its settings — defaults come from the tool itself
            </p>
          )}
        </aside>
      </div>

      <HairlineGrid className="mt-6 md:grid-cols-3">
        {[
          ['chain, don’t re-upload', 'Each step feeds the next in memory, so files are read from disk once and only the final step re-encodes.'],
          ['batch across the chain', 'A 3-step chain over 100 files is 300 engine jobs, scheduled across your cores with per-file progress.'],
          ['shareable workflows', 'Copy a link with the whole chain encoded — great for teams or repeat jobs. Scenes use the same format.'],
        ].map(([title, copy]) => (
          <HairlineCell key={title} className="p-4">
            <h3 className="text-body-strong text-ink">{title}</h3>
            <p className="mt-1 text-caption-md leading-6 text-body">{copy}</p>
          </HairlineCell>
        ))}
      </HairlineGrid>
    </div>
  )
}
