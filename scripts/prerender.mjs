/*
 * Build-time prerender.
 *
 * Runs after `vite build` and `vite build --ssr src/entry-server.tsx`.
 * For every route in the tool registry it writes dist/<route>/index.html
 * with baked meta tags, canonical, OpenGraph and JSON-LD — plus a 404.html
 * and sitemap.xml.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const serverEntry = join(here, '..', 'dist-server', 'entry-server.js')

const { render, routes, SITE_URL } = await import(serverEntry)

const template = await readFile(join(distDir, 'index.html'), 'utf8')

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const seoHead = (meta) => {
  const url = meta.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${meta.path}`
  const lines = [
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:site_name" content="OmniMediaHub" />`,
    `<meta property="og:image" content="${SITE_URL}/og.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="OmniMediaHub — your media never leaves your device" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${SITE_URL}/og.png" />`,
  ]
  for (const json of meta.jsonLd ?? []) {
    lines.push(`<script type="application/ld+json">${JSON.stringify(json)}</script>`)
  }
  return lines.join('\n    ')
}

const inject = ({ title, head, html }) => {
  let out = template
  if (!/<title>[^<]*<\/title>/.test(out)) throw new Error('template is missing <title>')
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
  if (!/<meta name="omh-seo"[^>]*>/.test(out)) throw new Error('template is missing seo marker')
  out = out.replace(/<meta name="omh-seo"[^>]*>/, head)
  const rootRe = /<div id="root">[\s\S]*?<\/div>/
  if (!rootRe.test(out)) throw new Error('template is missing #root')
  out = out.replace(rootRe, `<div id="root">${html}</div>`)
  return out
}

const targets = routes()
let written = 0

for (const meta of targets) {
  const page = inject({ title: meta.title, head: seoHead(meta), html: render(meta.path) })
  const outDir = meta.path === '/' ? distDir : join(distDir, meta.path)
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'index.html'), page)
  written += 1
}

// 404 (noindex)
await writeFile(
  join(distDir, '404.html'),
  inject({
    title: 'Page not found — OmniMediaHub',
    head: '<meta name="robots" content="noindex" />',
    html: render('/404-not-found'),
  }),
)

// sitemap
const urls = targets
  .map((meta) => `  <url><loc>${SITE_URL}${meta.path === '/' ? '/' : meta.path}</loc></url>`)
  .join('\n')
await writeFile(
  join(distDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
)

console.log(`prerender: wrote ${written} static pages + 404.html + sitemap.xml`)
