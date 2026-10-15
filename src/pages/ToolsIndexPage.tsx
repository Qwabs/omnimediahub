import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Section, SectionHeader } from '@/components/Section'
import { ToolCard, ToolGrid } from '@/components/ToolCard'
import { findRouteMeta } from '@/lib/seo'
import { useSeo } from '@/lib/use-seo'
import { CATEGORIES_WITH_TOOLS, TOOL_COUNT } from '@/tools/registry'

export function ToolsIndexPage() {
  useSeo(findRouteMeta('/tools'))

  return (
    <div className="mx-auto max-w-page px-6 pb-section">
      <PageHeader
        title="All tools"
        lead={`${TOOL_COUNT} free tools for images, GIFs, video and audio — every one of them running locally in your browser. No upload, no sign-up, no file size limit.`}
        breadcrumbs={[{ label: 'home', to: '/' }, { label: 'tools' }]}
        aside={<span className="text-caption-md text-mute">[ {TOOL_COUNT} tools ]</span>}
      />

      <nav aria-label="Categories" className="flex flex-wrap gap-x-6 gap-y-2 pb-6 text-caption-md">
        {CATEGORIES_WITH_TOOLS.map((c) => (
          <Link key={c.id} to={`/tools/${c.id}`} className="text-mute underline-offset-2 hover:underline">
            [+] {c.title} [{c.tools.length}]
          </Link>
        ))}
      </nav>

      {CATEGORIES_WITH_TOOLS.map((c, i) => (
        <Section key={c.id} first={i === 0}>
          <SectionHeader
            label={c.title}
            aside={
              <Link to={`/tools/${c.id}`} className="underline">
                {c.tools.length} tools →
              </Link>
            }
          />
          <p className="max-w-prose pb-4 text-body-md text-body">{c.blurb}</p>
          <ToolGrid>
            {c.tools.map((t) => (
              <ToolCard key={t.slug} tool={t} />
            ))}
          </ToolGrid>
        </Section>
      ))}
    </div>
  )
}
