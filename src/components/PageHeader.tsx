import { Link } from 'react-router'
import type { ReactNode } from 'react'

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-caption-md">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-2">
          {i > 0 ? (
            <span aria-hidden="true" className="text-stone">
              /
            </span>
          ) : null}
          {item.to ? (
            <Link to={item.to} className="text-mute underline-offset-2 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** Page header: display-xl title (the page's hero headline), lead, breadcrumb. */
export function PageHeader({
  title,
  lead,
  breadcrumbs,
  aside,
}: {
  title: string
  lead?: string
  breadcrumbs?: { label: string; to?: string }[]
  aside?: ReactNode
}) {
  return (
    <header className="pt-12 pb-8">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="max-w-[42ch] text-[28px] font-bold leading-normal text-ink sm:text-display-xl">
          {title}
        </h1>
        {aside}
      </div>
      {lead ? <p className="mt-4 max-w-[76ch] text-body-md text-body">{lead}</p> : null}
    </header>
  )
}
