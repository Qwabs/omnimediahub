import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { AsciiMark, AsciiWordmark } from '@/design/ascii'
import { ButtonLink } from '@/components/Button'
import { Kbd } from '@/components/Kbd'

const NAV_LINKS = [
  { to: '/tools', label: 'Tools' },
  { to: '/console', label: 'Console' },
  { to: '/scenes', label: 'Scenes' },
  { to: '/about', label: 'About' },
  { to: '/privacy', label: 'Privacy' },
]

export function Nav({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 hairline-b bg-canvas">
      <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-6 lg:gap-6">
        <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="OmniMediaHub home">
          <AsciiWordmark className="hidden text-ink sm:block" />
          <AsciiMark text="OMH" className="text-ink sm:hidden" />
        </Link>
        <span className="hidden text-caption-md text-mute lg:inline">[ local · 0 uploads ]</span>

        <nav className="ml-auto hidden items-center gap-5 md:flex" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `text-body-strong ${isActive ? 'text-ink' : 'text-mute'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="btn btn-secondary hidden h-8 gap-2 px-3 text-caption-md lg:inline-flex"
          onClick={onOpenSearch}
        >
          Quick search <Kbd>⌘K</Kbd>
        </button>

        <ButtonLink to="/tools" className="hidden h-8 px-3 text-caption-md sm:inline-flex">
          Browse tools
        </ButtonLink>

        <button
          type="button"
          className="btn btn-secondary h-8 px-3 md:hidden"
          aria-expanded={open}
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '[x]' : '[≡]'}
        </button>
      </div>

      {open ? (
        <nav className="hairline-t md:hidden" aria-label="Mobile">
          <ul className="mx-auto max-w-page space-y-3 px-6 py-4">
            {NAV_LINKS.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className="flex items-center gap-3 text-body-md text-ink"
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden="true" className="text-mute">
                    [+]
                  </span>
                  {l.label}
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="flex items-center gap-3 text-body-md text-ink"
                onClick={() => {
                  setOpen(false)
                  onOpenSearch()
                }}
              >
                <span aria-hidden="true" className="text-mute">
                  [?]
                </span>
                Quick search <Kbd>⌘K</Kbd>
              </button>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
