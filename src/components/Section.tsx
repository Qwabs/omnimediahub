import type { ReactNode } from 'react'

/**
 * Section header: a `heading-md` label followed by a 1px hairline rule.
 * The system has no chip background for section labels.
 */
export function SectionHeader({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pb-3">
      <h2 className="text-heading-md text-ink">{label}</h2>
      {aside ? <span className="text-caption-md text-mute">{aside}</span> : null}
    </div>
  )
}

/** A full section: hairline top rule + 96px rhythm, content flush left. */
export function Section({
  children,
  className = '',
  first = false,
}: {
  children: ReactNode
  className?: string
  first?: boolean
}) {
  return (
    <section className={`${first ? '' : 'hairline-t'} pt-section ${className}`}>{children}</section>
  )
}
