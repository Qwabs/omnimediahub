import { useState } from 'react'
import type { FaqEntry } from '@/tools/registry/types'

/** FAQ rows with `[+]` / `[−]` ASCII toggles. No chevrons, no animation chrome. */
export function Faq({ items }: { items: FaqEntry[] }) {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <ul className="border-t border-hairline">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <li key={item.q} className="hairline-b">
            <button
              type="button"
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 py-3 text-left text-body-strong text-ink"
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span aria-hidden="true" className="text-mute">
                {isOpen ? '[−]' : '[+]'}
              </span>
              <span>{item.q}</span>
            </button>
            {isOpen ? <p className="max-w-prose pr-4 pb-4 pl-8 text-body-md text-body">{item.a}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}
