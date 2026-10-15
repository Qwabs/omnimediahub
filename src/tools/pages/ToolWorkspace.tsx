import { useMemo, useRef, useState } from 'react'
import { AsciiProgress } from '@/design/ascii'
import { Console } from '@/components/Console'
import { DropZone } from '@/components/DropZone'
import { FileList, FileRow } from '@/components/FileRow'
import { ControlField } from '@/components/ControlField'
import { MaskEditor } from '@/components/MaskEditor'
import { Tabs } from '@/components/Tabs'
import { downloadBlob, downloadZipOf, formatBytes, sizeDelta } from '@/engine/io/download'
import { getToolOp } from '@/engine/ops'
import { cancelRun, runTool } from '@/session/run'
import { useSession } from '@/session/store'
import type { ToolDef } from '@/tools/registry/types'

const initialSettings = (tool: ToolDef): Record<string, unknown> =>
  Object.fromEntries(tool.controls.map((c) => [c.id, c.default]))

type ResultRow = {
  key: string
  name: string
  size: number
  blob: Blob
  fromName?: string
  fromSize?: number
}

/**
 * The working surface of a tool page: intake, settings, results, console.
 * Processing runs through the session runner; engines load lazily.
 */
export function ToolWorkspace({ tool }: { tool: ToolDef }) {
  const files = useSession((s) => s.files)
  const logs = useSession((s) => s.logs)
  const running = useSession((s) => s.running)
  const progress = useSession((s) => s.progress)
  const combinedResults = useSession((s) => s.combinedResults)
  const assets = useSession((s) => s.assets)
  const addFiles = useSession((s) => s.addFiles)
  const removeFile = useSession((s) => s.removeFile)
  const clearFiles = useSession((s) => s.clearFiles)
  const clearResults = useSession((s) => s.clearResults)
  const setAsset = useSession((s) => s.setAsset)

  const [tab, setTab] = useState(tool.generator ? 'settings' : 'files')
  const [settings, setSettings] = useState<Record<string, unknown>>(() => initialSettings(tool))
  const [preview, setPreview] = useState<{ key: string; text: string } | null>(null)
  const assetInput = useRef<HTMLInputElement>(null)

  const binding = getToolOp(`${tool.category}/${tool.slug}`)
  const isGenerator = tool.generator === true
  const assetId = tool.asset?.id ?? (tool.mask ? 'mask' : undefined)
  const asset = assetId ? assets[assetId] : undefined
  const needsAsset =
    Boolean(tool.asset || tool.mask) &&
    (binding?.op === 'watermark' ? settings.type === 'image' : true)

  const results = useMemo<ResultRow[]>(() => {
    const fromFiles = files
      .filter((f) => f.result)
      .map<ResultRow>((f) => ({
        key: f.id,
        name: f.result?.name ?? f.name,
        size: f.result?.size ?? 0,
        blob: f.result?.blob ?? new Blob(),
        fromName: f.name,
        fromSize: f.size,
      }))
    const combined = combinedResults.map<ResultRow>((r, i) => ({
      key: `combined-${i}-${r.name}`,
      name: r.name,
      size: r.size,
      blob: r.blob,
    }))
    return [...fromFiles, ...combined]
  }, [files, combinedResults])

  const saveAll = () => {
    void downloadZipOf(
      results.map((result) => ({ name: result.name, blob: result.blob })),
      `omnimediahub-${tool.slug}.zip`,
    )
  }

  /** Follow the job: console while running, results once it finishes. */
  const handleProcess = async () => {
    setTab('console')
    await runTool(tool, settings)
    const state = useSession.getState()
    const hasResults = state.files.some((file) => file.result) || state.combinedResults.length > 0
    setTab(hasResults ? 'results' : 'console')
  }

  const canProcess =
    Boolean(binding) && (isGenerator || files.length > 0) && (!needsAsset || Boolean(asset)) && !running

  return (
    <div className="border border-hairline" data-testid="workspace">
      <Tabs
        label="Tool workspace"
        value={tab}
        onChange={setTab}
        tabs={
          isGenerator
            ? [
                { id: 'settings', label: 'settings' },
                { id: 'results', label: `results [${results.length}]` },
                { id: 'console', label: 'console' },
              ]
            : [
                { id: 'files', label: `files [${files.length}]` },
                { id: 'settings', label: 'settings' },
                { id: 'results', label: `results [${results.length}]` },
                { id: 'console', label: 'console' },
              ]
        }
      />

      {/* action bar */}
      <div className="hairline-b flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="btn btn-primary h-9"
          disabled={!canProcess}
          onClick={() => void handleProcess()}
          data-testid="process"
        >
          {running ? 'processing…' : `[ process${files.length > 0 ? ` ${files.length}` : ''} ]`}
        </button>
        {running ? (
          <button
            type="button"
            className="btn btn-secondary h-9"
            onClick={cancelRun}
            data-testid="cancel"
          >
            [ cancel ]
          </button>
        ) : null}
        {!running && results.length > 0 ? (
          <button
            type="button"
            className="btn btn-secondary h-9"
            onClick={saveAll}
            data-testid="save-all"
          >
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
            [ clear ]
          </button>
        ) : null}
        {!binding ? (
          <span className="text-caption-md text-mute">[ soon ] engine not wired for this tool yet</span>
        ) : null}
        <span className="ml-auto text-caption-md text-mute">
          {running ? <AsciiProgress value={progress} width={12} /> : null}
          {!running && results.length > 0 ? `${results.length} results ready` : null}
        </span>
      </div>

      {tab === 'files' ? (
        <div className="p-4">
          <DropZone
            accept={tool.accepts.join(',')}
            onFiles={addFiles}
            hint={`accepts ${tool.accepts.join(' · ')} · output ${tool.produces}`}
          />
          {tool.mask && files.length > 0 && files[0].file.type.startsWith('image/') ? (
            <div className="mt-3">
              <MaskEditor
                image={files[0].file}
                brush={Number(settings.brush) || 40}
                onMask={(mask) => {
                  if (assetId) setAsset(assetId, mask)
                }}
              />
              <p className="pt-2 text-caption-md text-mute" data-testid="mask-status">
                [ {asset ? 'mask ready — press process' : 'paint over what should be removed'} ]
              </p>
            </div>
          ) : null}
          {tool.asset && needsAsset ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 border border-hairline px-4 py-3">
              <input
                ref={assetInput}
                type="file"
                accept="image/*,.srt,.vtt,text/plain"
                data-testid="asset-input"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file && tool.asset) setAsset(tool.asset.id, file)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                className="btn btn-secondary h-8 px-3 text-caption-md"
                data-testid="choose-asset"
                onClick={() => assetInput.current?.click()}
              >
                {asset ? '[ replace ]' : '[ choose file ]'}
              </button>
              <span className="text-caption-md text-mute">
                {asset ? asset.name : tool.asset.label}
              </span>
              {asset ? (
                <button
                  type="button"
                  className="text-caption-md text-mute hover:text-ink"
                  aria-label="Remove file"
                  onClick={() => tool.asset && setAsset(tool.asset.id, null)}
                >
                  [x]
                </button>
              ) : tool.asset.hint ? (
                <span className="text-caption-md text-stone">{tool.asset.hint}</span>
              ) : null}
            </div>
          ) : null}
          {files.length > 0 ? (
            <FileList>
              {files.map((file) => {
                const result = file.result
                const meta = result
                  ? sizeDelta(file.size, result.size)
                  : file.ms
                    ? `${formatBytes(file.size)} · ${Math.round(file.ms)}ms`
                    : formatBytes(file.size)
                return (
                  <FileRow
                    key={file.id}
                    name={file.name}
                    state={file.state === 'running' ? 'running' : file.state === 'done' ? 'done' : file.state === 'error' ? 'error' : 'queued'}
                    progress={file.progress}
                    meta={meta}
                    error={file.error}
                    onRemove={running ? undefined : () => removeFile(file.id)}
                  />
                )
              })}
            </FileList>
          ) : null}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="grid gap-6 p-4 sm:grid-cols-2">
          {isGenerator ? (
            <p className="text-caption-md text-mute sm:col-span-2">
              [ ] this tool generates its output from these settings — no input files needed
            </p>
          ) : null}
          {tool.controls.length === 0 ? (
            <p className="text-caption-md text-mute">[ ] this tool needs no settings</p>
          ) : (
            tool.controls.map((control) => (
              <ControlField
                key={control.id}
                control={control}
                value={settings[control.id]}
                onChange={(v) => setSettings((s) => ({ ...s, [control.id]: v }))}
              />
            ))
          )}
        </div>
      ) : null}

      {tab === 'results' ? (
        <div className="p-4">
          {results.length === 0 ? (
            <p className="text-caption-md text-mute">
              [ ] no results yet — add files and press process
            </p>
          ) : (
            <ul className="border-t border-hairline">
              {results.map((result) => {
                const previewable =
                  result.blob.type.startsWith('text/') || result.blob.type === 'application/json'
                return (
                  <li
                    key={result.key}
                    data-testid="result"
                    data-name={result.name}
                    data-size={result.size}
                    className="hairline-b py-2 text-body-md"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="shrink-0 text-ink">
                          [✓]
                        </span>
                        <span className="truncate text-ink">{result.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-4">
                        <span className="text-caption-md text-mute tabular-nums">
                          {result.fromSize !== undefined
                            ? sizeDelta(result.fromSize, result.size)
                            : formatBytes(result.size)}
                        </span>
                        {previewable ? (
                          <button
                            type="button"
                            className="btn btn-secondary h-7 px-2 text-caption-md"
                            onClick={() => {
                              void (async () => {
                                if (preview?.key === result.key) {
                                  setPreview(null)
                                  return
                                }
                                const text = await result.blob.text()
                                setPreview({ key: result.key, text: text.slice(0, 40_000) })
                              })()
                            }}
                          >
                            {preview?.key === result.key ? '[ hide ]' : '[ view ]'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-secondary h-7 px-2 text-caption-md"
                          onClick={() => downloadBlob(result.blob, result.name)}
                        >
                          [ save ]
                        </button>
                      </span>
                    </div>
                    {preview?.key === result.key ? (
                      <pre className="mt-2 max-h-80 overflow-auto border border-hairline bg-surface-soft p-3 text-caption-md leading-6">
                        {preview.text}
                      </pre>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'console' ? (
        <Console lines={logs} status={running ? 'running' : 'idle'} />
      ) : null}

      <div className="hairline-t flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-caption-md text-mute">
        <span>[ engine: {binding ? binding.engine : '—'} · local ]</span>
        <span>
          [ {files.length} file{files.length === 1 ? '' : 's'} · {results.length} result
          {results.length === 1 ? '' : 's'} ]
        </span>
      </div>
    </div>
  )
}
