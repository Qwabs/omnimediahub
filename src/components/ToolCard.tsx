import { Link } from 'react-router'
import { StatusTag } from './Badge'
import { HairlineGrid } from './HairlineGrid'
import type { ReactNode } from 'react'
import type { ToolDef } from '@/tools/registry/types'
import { toolPath } from '@/tools/registry'

/**
 * Tool card. Borderless by design — the hairline grid around it provides
 * the rules (see `<ToolGrid>`).
 */
export function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <Link
      to={toolPath(tool)}
      className="row-hover flex flex-col gap-2 border-t border-l border-hairline bg-canvas p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-body-strong text-ink">{tool.title}</h3>
        <StatusTag status={tool.status} />
      </div>
      <p className="text-caption-md leading-6 text-body">{tool.description}</p>
      <span className="mt-auto pt-2 text-caption-md text-mute">
        {tool.accepts.join(' · ')} → {tool.produces}
      </span>
    </Link>
  )
}

/** Hairline grid, 3-up on desktop. */
export function ToolGrid({ children }: { children: ReactNode }) {
  return <HairlineGrid className="sm:grid-cols-2 lg:grid-cols-3">{children}</HairlineGrid>
}
