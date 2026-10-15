import { useLocation } from 'react-router'
import { asciiArt } from '@/design/ascii-core'
import { ButtonLink } from '@/components/Button'

export function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <div className="mx-auto max-w-page px-6 py-24">
      <pre role="img" aria-label="404" className="text-[10px] leading-none text-ink">
        {asciiArt('404').join('\n')}
      </pre>
      <h1 className="mt-8 text-heading-md text-ink">Page not found</h1>
      <p className="mt-3 max-w-prose text-body-md text-body">
        <code className="rounded-sm bg-surface-card px-2 py-0.5 text-caption-md">{pathname}</code>{' '}
        does not resolve to a tool or page. It may have moved, or the link may be wrong.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink to="/tools">Browse all tools</ButtonLink>
        <ButtonLink to="/" variant="secondary">
          Back home
        </ButtonLink>
      </div>
    </div>
  )
}
