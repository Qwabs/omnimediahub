import { useRef, useState } from 'react'
import { collectFiles, expandArchives } from '@/engine/io/intake'

/**
 * `[ + drop files here ]` — the intake surface.
 * Understands files, folders (webkitGetAsEntry) and ZIP archives.
 */
export function DropZone({
  onFiles,
  accept = 'image/*',
  multiple = true,
  hint = 'or click to browse · folders & ZIP supported · 100% local',
}: {
  onFiles?: (files: File[]) => void
  accept?: string
  multiple?: boolean
  hint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)

  const acceptFiles = async (list: File[] | FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    if (incoming.length === 0) return
    setBusy(true)
    try {
      const expanded = await expandArchives(incoming)
      if (expanded.length > 0) onFiles?.(expanded)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Add files"
      data-testid="dropzone"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void (async () => {
          const collected = await collectFiles(e.dataTransfer)
          await acceptFiles(collected)
        })()
      }}
      className={`cursor-pointer border border-dashed px-6 py-16 text-center ${
        over ? 'border-ink bg-surface-soft' : 'border-hairline-strong bg-canvas'
      }`}
    >
      <pre className="text-body-md text-ink">{busy ? '[ reading… ]' : '[ + drop files here ]'}</pre>
      <p className="mt-2 text-caption-md text-mute">{hint}</p>
      {/* stopPropagation prevents the synthetic click loop on the parent */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          void acceptFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
