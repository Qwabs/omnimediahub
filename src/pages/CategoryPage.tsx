import { Link, useParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Section, SectionHeader } from '@/components/Section'
import { ToolCard, ToolGrid } from '@/components/ToolCard'
import { findRouteMeta } from '@/lib/seo'
import { useSeo } from '@/lib/use-seo'
import { CATEGORIES, getCategory, toolsByCategory } from '@/tools/registry'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function CategoryPage() {
  const { category } = useParams()
  const cat = category ? getCategory(category) : undefined

  useSeo(cat ? findRouteMeta(`/tools/${cat.id}`) : undefined)

  if (!cat) return <NotFoundPage />

  const tools = toolsByCategory(cat.id)
  const others = CATEGORIES.filter((c) => c.id !== cat.id).sort((a, b) => a.order - b.order)

  return (
    <div className="mx-auto max-w-page px-6 pb-section">
      <PageHeader
        title={cat.title}
        lead={cat.blurb}
        breadcrumbs={[
          { label: 'home', to: '/' },
          { label: 'tools', to: '/tools' },
          { label: cat.id },
        ]}
        aside={<span className="text-caption-md text-mute">[ {tools.length} tools ]</span>}
      />

      <ToolGrid>
        {tools.map((t) => (
          <ToolCard key={t.slug} tool={t} />
        ))}
      </ToolGrid>

      <Section>
        <SectionHeader label="Other categories" />
        <ul className="border-t border-hairline">
          {others.map((c) => (
            <li key={c.id} className="hairline-b">
              <Link to={`/tools/${c.id}`} className="row-hover flex items-baseline justify-between gap-4 py-3 text-body-md">
                <span className="text-ink">
                  <span aria-hidden="true" className="pr-3 text-mute">
                    [+]
                  </span>
                  {c.title}
                </span>
                <span className="shrink-0 text-caption-md text-mute">{c.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
