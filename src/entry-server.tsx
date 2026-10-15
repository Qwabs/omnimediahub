import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import App from './app/App'
import { allRouteMetas, SITE_URL } from './lib/seo'
import type { RouteMeta } from './lib/seo'

/**
 * Server entry used only at build time by `scripts/prerender.mjs`.
 * Renders each route to static HTML so every tool page is crawlable
 * without JavaScript; the client hydrates over it.
 */
export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  )
}

export function routes(): RouteMeta[] {
  return allRouteMetas()
}

export { SITE_URL }
