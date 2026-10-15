import type { ReactNode } from 'react'

/**
 * Hairline grid.
 *
 * Draws 1px rules by giving the container `border-r/b` and every cell
 * `border-t/l` — so ragged final rows stay cream instead of exposing a
 * (gray) background peeking through gaps.
 */
export function HairlineGrid({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`grid border-r border-b border-hairline ${className}`}>{children}</div>
}

export function HairlineCell({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`border-t border-l border-hairline bg-canvas ${className}`}>{children}</div>
}
