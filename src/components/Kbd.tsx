import type { ReactNode } from 'react'

/** Keybinding hint. Rendered as a real `<kbd>`, no icon. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-hairline bg-surface-soft px-1.5 text-caption-md text-mute">
      {children}
    </kbd>
  )
}
