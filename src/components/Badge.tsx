import type { ReactNode } from 'react'

/** Small dark chip — news strips, status tags. The system's only filled chip. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center bg-surface-dark px-2 py-[2px] text-caption-md text-on-dark">
      {children}
    </span>
  )
}

/** Bracketed status label, e.g. `[ beta ]` / `[ live ]`. */
export function StatusTag({ status }: { status: 'planned' | 'beta' | 'live' }) {
  const label = status === 'planned' ? '[ soon ]' : status === 'beta' ? '[ beta ]' : '[ live ]'
  const tone =
    status === 'live' ? 'text-body' : status === 'beta' ? 'text-warning' : 'text-mute'
  return <span className={`shrink-0 text-caption-md ${tone}`}>{label}</span>
}
