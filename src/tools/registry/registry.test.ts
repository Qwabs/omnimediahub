import { describe, expect, it } from 'vitest'
import { ALL_TOOLS, CATEGORIES, getToolByRef, resolveToolRef, TOOL_COUNT, toolPath } from './index'
import { getToolOp, TOOL_OPS } from '@/engine/ops'
import { allRouteMetas } from '@/lib/seo'
import { SCENES } from './scenes'

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))

describe('tool registry integrity', () => {
  it('has a healthy catalog', () => {
    expect(TOOL_COUNT).toBeGreaterThanOrEqual(40)
  })

  it('every tool belongs to a known category', () => {
    for (const tool of ALL_TOOLS) {
      expect(CATEGORY_IDS.has(tool.category), `${tool.slug} has category ${tool.category}`).toBe(true)
    }
  })

  it('tool paths are unique', () => {
    const paths = ALL_TOOLS.map(toolPath)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('control ids are unique within a tool and defaults are complete', () => {
    for (const tool of ALL_TOOLS) {
      const ids = tool.controls.map((c) => c.id)
      expect(new Set(ids).size, `${tool.slug} has duplicate control ids`).toBe(ids.length)
      for (const control of tool.controls) {
        expect(control.default, `${tool.slug}.${control.id} is missing a default`).toBeDefined()
      }
    }
  })

  it('every tool has a description and a chainable flag', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description.length, `${tool.slug} description too short`).toBeGreaterThan(40)
      expect(typeof tool.chainable).toBe('boolean')
    }
  })

  it('related tools resolve within their category', () => {
    for (const tool of ALL_TOOLS) {
      for (const related of tool.related ?? []) {
        expect(resolveToolRef(related, tool.category), `${tool.slug} → ${related}`).toBeDefined()
      }
    }
  })
})

describe('scene integrity', () => {
  it('every scene step resolves to a real tool', () => {
    for (const scene of SCENES) {
      for (const step of scene.steps) {
        expect(getToolByRef(step), `${scene.slug} → ${step}`).toBeDefined()
      }
    }
  })

  it('scene slugs are unique', () => {
    const slugs = SCENES.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('engine bindings', () => {
  it('every live tool has an engine binding', () => {
    for (const tool of ALL_TOOLS) {
      if (tool.status === 'live') {
        expect(getToolOp(`${tool.category}/${tool.slug}`), `${tool.category}/${tool.slug}`).toBeDefined()
      }
    }
  })

  it('every binding points at a real tool', () => {
    for (const ref of Object.keys(TOOL_OPS)) {
      expect(getToolByRef(ref), `dead binding: ${ref}`).toBeDefined()
    }
  })
})

describe('seo routes', () => {
  it('route paths are unique', () => {
    const paths = allRouteMetas().map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('every route has a non-empty title and description', () => {
    for (const route of allRouteMetas()) {
      expect(route.title.length, route.path).toBeGreaterThan(8)
      expect(route.description.length, route.path).toBeGreaterThan(20)
    }
  })

  it('covers every tool page', () => {
    const paths = new Set(allRouteMetas().map((r) => r.path))
    for (const tool of ALL_TOOLS) {
      expect(paths.has(toolPath(tool)), toolPath(tool)).toBe(true)
    }
  })
})
