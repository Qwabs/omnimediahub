import { Link, useParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Section, SectionHeader } from '@/components/Section'
import { HairlineGrid } from '@/components/HairlineGrid'
import { ButtonLink } from '@/components/Button'
import { encodePipeline } from '@/session/pipeline-codec'
import { findRouteMeta } from '@/lib/seo'
import { useSeo } from '@/lib/use-seo'
import { getToolByRef } from '@/tools/registry'
import { SCENES } from '@/tools/registry/scenes'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function ScenesPage() {
  useSeo(findRouteMeta('/scenes'))

  return (
    <div className="mx-auto max-w-page px-6 pb-section">
      <PageHeader
        title="Guided workflows"
        lead="Scene pages chain several tools into a single flow — drop your files once and walk out with finished output. No jumping between pages."
        breadcrumbs={[{ label: 'home', to: '/' }, { label: 'scenes' }]}
        aside={<span className="text-caption-md text-mute">[ {SCENES.length} workflows ]</span>}
      />

      <p className="max-w-prose pb-6 text-body-md text-body">
        Each scene opens in the pipeline console as an editable chain — tune any step, then run the
        whole workflow over a batch. Everything happens on your device.
      </p>

      <HairlineGrid className="md:grid-cols-2">
        {SCENES.map((scene) => (
          <Link
            key={scene.slug}
            to={`/scenes/${scene.slug}`}
            className="row-hover border-t border-l border-hairline bg-canvas p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-body-strong text-ink">{scene.title}</h2>
              <span className="text-caption-md text-mute">[ ready ]</span>
            </div>
            <p className="mt-2 text-caption-md leading-6 text-body">{scene.description}</p>
            <p className="mt-3 text-caption-md text-mute">
              {scene.steps.length} steps · {scene.audience}
            </p>
          </Link>
        ))}
      </HairlineGrid>

      <Section>
        <SectionHeader label="How scenes work" />
        <ul className="border-t border-hairline">
          {[
            'A scene is a saved pipeline: it applies several tools in order to every file you drop.',
            'Each step keeps its own settings, and you can tweak any of them before running the batch.',
            'Because everything is local, a scene over 200 files is as fast as over one.',
          ].map((line, i) => (
            <li key={line} className="hairline-b flex gap-4 py-3 text-body-md text-body">
              <span className="shrink-0 text-mute">[{i + 1}]</span>
              <span className="max-w-prose">{line}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

export function ScenePage() {
  const { slug } = useParams()
  const scene = SCENES.find((s) => s.slug === slug)

  useSeo(
    scene
      ? {
          title: `${scene.title} — OmniMediaHub`,
          description: scene.description,
        }
      : undefined,
  )

  if (!scene) return <NotFoundPage />

  return (
    <div className="mx-auto max-w-page px-6 pb-section">
      <PageHeader
        title={scene.title}
        lead={scene.description}
        breadcrumbs={[
          { label: 'home', to: '/' },
          { label: 'scenes', to: '/scenes' },
          { label: scene.slug },
        ]}
        aside={<span className="text-caption-md text-mute">[ ready ]</span>}
      />

      <Section first>
        <SectionHeader label="Pipeline" aside={`${scene.steps.length} steps`} />
        <ol className="border-t border-hairline">
          {scene.steps.map((ref, i) => {
            const tool = getToolByRef(ref)
            return (
              <li key={ref} className="hairline-b flex items-baseline gap-4 py-3 text-body-md">
                <span className="shrink-0 text-mute">[{i + 1}]</span>
                {tool ? (
                  <Link to={`/tools/${ref}`} className="text-ink underline-offset-2 hover:underline">
                    {tool.title}
                  </Link>
                ) : (
                  <span className="text-ink">{ref}</span>
                )}
                <span className="ml-auto shrink-0 text-caption-md text-mute">{tool?.produces}</span>
              </li>
            )
          })}
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <ButtonLink to={`/console?p=${encodePipeline(scene.steps.map((toolRef) => ({ toolRef, params: {} })))}`}>
            Open in the console
          </ButtonLink>
          <span className="text-caption-md text-mute">
            [ the whole workflow loads as an editable chain — tune any step before running it ]
          </span>
        </div>
      </Section>
    </div>
  )
}
