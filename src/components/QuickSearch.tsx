import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ALL_TOOLS, toolPath } from '@/tools/registry'
import { Kbd } from './Kbd'

/**
 * `⌘K` tool search.
 *
 * The dialog is a separate component so opening it mounts fresh state —
 * no reset effects, no stale queries.
 */
export function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <QuickSearchDialog onClose={onClose} />
}

function QuickSearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? ALL_TOOLS.filter((t) => `${t.title} ${t.slug} ${t.category}`.toLowerCase().includes(q))
      : ALL_TOOLS
    return list.slice(0, 10)
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const target = results[index]
        if (target) {
          e.preventDefault()
          navigate(toolPath(target))
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, index, navigate, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Search tools"
    >
      <div className="absolute inset-0 bg-[rgba(15,0,0,0.4)]" onClick={onClose} aria-hidden="true" />
      <div className="relative w-[min(640px,92vw)] border border-hairline-strong bg-canvas">
        <div className="hairline-b flex items-center gap-3 px-4 py-3">
          <span aria-hidden="true" className="text-mute">
            [?]
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            placeholder={`Search ${ALL_TOOLS.length} tools…`}
            aria-label="Search tools"
            className="w-full bg-transparent outline-none placeholder:text-ash"
          />
          <Kbd>esc</Kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {results.map((t, i) => (
            <li key={`${t.category}/${t.slug}`}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  navigate(toolPath(t))
                  onClose()
                }}
                className={`flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-body-md ${
                  i === index ? 'bg-surface-soft' : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="text-mute">
                    [+]
                  </span>
                  <span className="truncate text-ink">{t.title}</span>
                </span>
                <span className="shrink-0 text-caption-md text-mute">{t.category}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-caption-md text-mute">
              no tools match “{query}”
            </li>
          ) : null}
        </ul>
        <div className="hairline-t flex flex-wrap items-center gap-4 px-4 py-2 text-caption-md text-mute">
          <span>↑↓ navigate</span>
          <span>enter open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
