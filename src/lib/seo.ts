/*
 * SEO metadata for every route.
 *
 * Imported by the prerender step (Node) to bake static HTML per route, and
 * by pages (client) through `useSeo` to keep titles fresh on SPA navigation.
 * Must stay free of browser globals.
 */

import { CATEGORIES, ALL_TOOLS, getTool, toolPath } from '@/tools/registry'
import { SCENES } from '@/tools/registry/scenes'
import type { ToolDef } from '@/tools/registry/types'

export const SITE_URL = 'https://omnimediahub.com'
export const SITE_NAME = 'OmniMediaHub'

export type RouteMeta = {
  path: string
  title: string
  description: string
  jsonLd?: Record<string, unknown>[]
}

const softwareApplication = (name: string, description: string): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name,
  description,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
})

const faqPage = (faq: { q: string; a: string }[]): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
})

const toolMeta = (tool: ToolDef): RouteMeta => {
  const jsonLd: Record<string, unknown>[] = [
    softwareApplication(`${tool.title} — ${SITE_NAME}`, tool.description),
  ]
  if (tool.faq?.length) jsonLd.push(faqPage(tool.faq))
  return {
    path: toolPath(tool),
    title: `${tool.title} — free, local, no upload | ${SITE_NAME}`,
    description: tool.description,
    jsonLd,
  }
}

export const STATIC_ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: `${SITE_NAME} — private, browser-based media toolbox`,
    description:
      'Convert, compress, crop, resize, edit and generate images, GIFs, video and audio in unlimited batches — 100% locally in your browser. No uploads, no signup, free forever.',
    jsonLd: [
      softwareApplication(SITE_NAME, 'Privacy-first batch media toolbox for images, video and audio.'),
    ],
  },
  {
    path: '/tools',
    title: `All tools — ${SITE_NAME}`,
    description:
      'Every OmniMediaHub tool in one place: convert, compress, crop, resize, GIF, video, audio and local AI. All processing runs on your device.',
  },
  {
    path: '/scenes',
    title: `Guided workflows — ${SITE_NAME}`,
    description:
      'Ready-made workflows that chain several tools into one flow: ID photos, app icons, e-commerce batches, social sizes and more.',
  },
  {
    path: '/console',
    title: `Pipeline console — chain tools, batch everything | ${SITE_NAME}`,
    description:
      'Build a chain of tools — convert, resize, compress, clean metadata — and run it over a whole batch. Each step feeds the next in memory, entirely on your device.',
    jsonLd: [
      softwareApplication(`${SITE_NAME} pipeline console`, 'Chain local media tools into a batch pipeline.'),
    ],
  },
  {
    path: '/about',
    title: `About — ${SITE_NAME}`,
    description:
      'Why OmniMediaHub exists: a privacy-first media toolbox that runs entirely in your browser, with zero server uploads and no accounts.',
  },
  {
    path: '/privacy',
    title: `Privacy — ${SITE_NAME}`,
    description:
      'Our privacy model in one sentence: your media never leaves your device. No uploads, no accounts, no tracking of your files.',
  },
  {
    path: '/terms',
    title: `Terms of service — ${SITE_NAME}`,
    description: 'The terms that govern your use of OmniMediaHub.',
  },
  {
    path: '/contact',
    title: `Contact — ${SITE_NAME}`,
    description: 'Get in touch with the OmniMediaHub team.',
  },
]

export const categoryRoutes = (): RouteMeta[] =>
  CATEGORIES.map((c) => ({
    path: `/tools/${c.id}`,
    title: `${c.title} — ${SITE_NAME}`,
    description: c.blurb,
  }))

export const toolRoutes = (): RouteMeta[] => ALL_TOOLS.map(toolMeta)

export const sceneRoutes = (): RouteMeta[] =>
  SCENES.map((s) => ({
    path: `/scenes/${s.slug}`,
    title: `${s.title} — ${SITE_NAME}`,
    description: s.description,
  }))

export const allRouteMetas = (): RouteMeta[] => [
  ...STATIC_ROUTES,
  ...categoryRoutes(),
  ...toolRoutes(),
  ...sceneRoutes(),
]

export const findToolMeta = (category: string, slug: string): RouteMeta | undefined => {
  const tool = getTool(category, slug)
  return tool ? toolMeta(tool) : undefined
}

export const findRouteMeta = (path: string): RouteMeta | undefined =>
  allRouteMetas().find((r) => r.path === path)
