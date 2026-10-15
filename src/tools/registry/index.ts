import { CATEGORIES, getCategory } from './categories'
import { convertTools } from './convert'
import { compressTools } from './compress'
import { resizeTools } from './resize'
import { cropTools } from './crop'
import { rotateTools } from './rotate'
import { gifTools } from './gif'
import { watermarkTools } from './watermark'
import { exifTools } from './exif'
import { adjustTools } from './adjust'
import { editTools } from './edit'
import { aiTools } from './ai'
import { videoTools } from './video'
import { audioTools } from './audio'
import type { ToolCategoryDef, ToolDef } from './types'

export const ALL_TOOLS: ToolDef[] = [
  ...convertTools,
  ...compressTools,
  ...resizeTools,
  ...cropTools,
  ...rotateTools,
  ...gifTools,
  ...watermarkTools,
  ...exifTools,
  ...adjustTools,
  ...editTools,
  ...aiTools,
  ...videoTools,
  ...audioTools,
]

export const TOOL_COUNT = ALL_TOOLS.length

export const toolsByCategory = (category: string): ToolDef[] =>
  ALL_TOOLS.filter((t) => t.category === category)

export const getTool = (category: string, slug: string): ToolDef | undefined =>
  ALL_TOOLS.find((t) => t.category === category && t.slug === slug)

/** Fetch a tool from a `category/slug` reference (used by scenes). */
export const getToolByRef = (ref: string): ToolDef | undefined => {
  const [category, slug] = ref.split('/')
  if (!category || !slug) return undefined
  return getTool(category, slug)
}

/**
 * Resolve a `related` reference: bare slugs resolve within the tool's own
 * category, `category/slug` references resolve absolutely.
 */
export const resolveToolRef = (ref: string, category: string): ToolDef | undefined =>
  ref.includes('/') ? getToolByRef(ref) : getTool(category, ref)

export const getRelated = (tool: ToolDef): ToolDef[] =>
  (tool.related ?? [])
    .map((ref) => resolveToolRef(ref, tool.category))
    .filter((t): t is ToolDef => t !== undefined)

export type CategoryWithTools = ToolCategoryDef & { tools: ToolDef[] }

export const CATEGORIES_WITH_TOOLS: CategoryWithTools[] = [...CATEGORIES]
  .sort((a, b) => a.order - b.order)
  .map((c) => ({ ...c, tools: toolsByCategory(c.id) }))

export { CATEGORIES, getCategory }
export type { ToolCategoryDef, ToolDef }

/** Human-readable path for a tool page. */
export const toolPath = (tool: Pick<ToolDef, 'category' | 'slug'>) =>
  `/tools/${tool.category}/${tool.slug}`
