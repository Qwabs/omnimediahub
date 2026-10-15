import type { ReactNode } from 'react'
import { JOB_GLYPH, asciiBar, type JobState } from '@/design/ascii-core'

const stateTone: Record<JobState, string> = {
  queued: 'text-mute',
  running: 'text-accent',
  done: 'text-ink',
  error: 'text-danger',
}

/** `[✓] photo.png                     4.2MB → 812KB` */
export function FileRow({
  name,
  meta,
  state = 'queued',
  progress,
  error,
  onRemove,
}: {
  name: string
  /** Right-aligned annotation, e.g. `4.2MB → 812KB`. */
  meta?: string
  state?: JobState
  /** 0-100; renders an ASCII bar for running jobs. */
  progress?: number
  error?: string
  onRemove?: () => void
}) {
  const showBar = state === 'running' && typeof progress === 'number' && progress > 0
  return (
    <li className="hairline-b py-2 text-body-md">
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className={`shrink-0 font-medium ${stateTone[state]}`}>
            {JOB_GLYPH[state]}
          </span>
          <span className="truncate text-ink">{name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {showBar ? (
            <span aria-hidden="true" className="text-caption-md text-mute tabular-nums">
              {asciiBar(progress, 100, 10)} {Math.round(progress)}%
            </span>
          ) : null}
          {meta ? <span className="text-caption-md text-mute tabular-nums">{meta}</span> : null}
          {onRemove ? (
            <button
              type="button"
              className="text-caption-md text-mute hover:text-ink"
              aria-label={`Remove ${name}`}
              onClick={onRemove}
            >
              [x]
            </button>
          ) : null}
        </span>
      </div>
      {error ? <p className="pt-1 pl-8 text-caption-md text-danger">{error}</p> : null}
    </li>
  )
}

export function FileList({ children }: { children: ReactNode }) {
  return <ul className="border-t border-hairline">{children}</ul>
}
