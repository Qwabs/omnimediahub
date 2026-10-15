import { Link } from 'react-router'

const FOOTER_LINKS = [
  { to: '/tools', label: 'All tools' },
  { to: '/scenes', label: 'Scenes' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/contact', label: 'Contact' },
]

export function Footer() {
  return (
    <footer className="hairline-t">
      <div className="mx-auto max-w-page px-6">
        <nav aria-label="Footer" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {FOOTER_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="row-hover hairline-b px-4 py-3 text-center text-caption-md text-body lg:border-l lg:first:border-l-0"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-3 py-6 text-caption-md text-mute sm:flex-row sm:items-center sm:justify-between">
          <span>©2026 OmniMediaHub</span>
          <span className="flex flex-wrap gap-4">
            <span>[ 0 uploads · ever ]</span>
            <span>[ works offline ]</span>
            <span>[ free forever ]</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
