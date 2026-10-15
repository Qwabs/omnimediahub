import { useParams } from 'react-router'
import { Faq } from '@/components/Faq'
import { PageHeader } from '@/components/PageHeader'
import { Section, SectionHeader } from '@/components/Section'
import { StatusTag } from '@/components/Badge'
import { ToolCard, ToolGrid } from '@/components/ToolCard'
import { findToolMeta } from '@/lib/seo'
import { useSeo } from '@/lib/use-seo'
import { getCategory, getRelated, getTool } from '@/tools/registry'
import { ToolWorkspace } from '@/tools/pages/ToolWorkspace'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function ToolPage() {
  const { category, slug } = useParams()
  const tool = category && slug ? getTool(category, slug) : undefined
  const meta = tool ? findToolMeta(tool.category, tool.slug) : undefined

  useSeo(meta ? { title: meta.title, description: meta.description } : undefined)

  if (!tool) return <NotFoundPage />

  const cat = getCategory(tool.category)
  const related = getRelated(tool)

  return (
    <div className="mx-auto max-w-page px-6 pb-section">
      <PageHeader
        title={tool.title}
        lead={tool.description}
        aside={<StatusTag status={tool.status} />}
        breadcrumbs={[
          { label: 'home', to: '/' },
          { label: 'tools', to: '/tools' },
          { label: cat?.title ?? tool.category, to: `/tools/${tool.category}` },
          { label: tool.slug },
        ]}
      />

      <p className="flex flex-wrap gap-x-6 gap-y-2 pb-6 text-caption-md text-mute">
        <span>[ engine: {tool.engine} ]</span>
        <span>[ {tool.chainable ? 'chainable' : 'single file'} ]</span>
        <span>
          [ {tool.accepts.join(' · ')} → {tool.produces} ]
        </span>
      </p>

      <ToolWorkspace tool={tool} />

      {tool.howTo?.length ? (
        <Section>
          <SectionHeader label="How to use it" />
          <ol className="border-t border-hairline">
            {tool.howTo.map((step, i) => (
              <li key={step} className="hairline-b flex gap-4 py-3 text-body-md text-body">
                <span className="shrink-0 text-mute">[{i + 1}]</span>
                <span className="max-w-prose">{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {tool.faq?.length ? (
        <Section>
          <SectionHeader label="FAQ" />
          <Faq items={tool.faq} />
        </Section>
      ) : null}

      {related.length > 0 ? (
        <Section>
          <SectionHeader label="Related tools" />
          <ToolGrid>
            {related.map((r) => (
              <ToolCard key={r.slug} tool={r} />
            ))}
          </ToolGrid>
        </Section>
      ) : null}
    </div>
  )
}
