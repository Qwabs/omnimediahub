import { useEffect, useRef } from 'react'

export type ConsoleLevel = 'info' | 'run' | 'ok' | 'warn' | 'error'

export type ConsoleLine = {
  id: string | number
  level?: ConsoleLevel
  text: string
}

const GLYPH: Record<ConsoleLevel, string> = {
  info: '[ ]',
  run: '[>]',
  ok: '[✓]',
  warn: '[!]',
  error: '[x]',
}

const TONE: Record<ConsoleLevel, string> = {
  info: 'text-on-dark-mute',
  run: 'text-accent',
  ok: 'text-success',
  warn: 'text-warning',
  error: 'text-danger',
}

/**
 * The workspace console — the single dark surface inside the app, and the
 * only place the semantic colour ramp is allowed (per DESIGN.md, those
 * colours belong to the in-product TUI).
 */
export function Console({
  title = '[ console ]',
  status,
  lines,
  className = '',
}: {
  title?: string
  status?: string
  lines: ConsoleLine[]
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  return (
    <section className={`console ${className}`} aria-label="Processing console">
      <header className="flex items-center justify-between border-b border-[rgba(253,252,252,0.12)] px-4 py-2">
        <span className="text-caption-md text-on-dark-mute">{title}</span>
        <span className="text-caption-md text-on-dark-mute">
          {status ?? `${lines.length} lines`}
        </span>
      </header>
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto p-4 text-caption-md leading-6"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <p className="text-on-dark-mute">[ ] console idle — no jobs yet</p>
        ) : (
          lines.map((line) => {
            const level = line.level ?? 'info'
            return (
              <div key={line.id} className="flex gap-3">
                <span aria-hidden="true" className={`shrink-0 ${TONE[level]}`}>
                  {GLYPH[level]}
                </span>
                <span className="whitespace-pre-wrap text-on-dark">{line.text}</span>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
