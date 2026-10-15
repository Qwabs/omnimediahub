/*
 * Tool registry types.
 *
 * Core idea: tools are DATA, engines are CODE. A ToolDef renders one tool
 * page (controls, copy, FAQ, SEO) and points at a shared processing engine.
 * Preset families (fixed sizes, compress targets, social formats) are rows
 * in these arrays, not hand-written pages.
 */

export type ToolEngine = 'vips' | 'raster' | 'gif' | 'ffmpeg' | 'audio' | 'ai' | 'exif'

/** `planned` = page + UI shell only; `beta` = engine works, rough edges; `live` = verified. */
export type ToolStatus = 'planned' | 'beta' | 'live'

export type Control =
  | {
      kind: 'select'
      id: string
      label: string
      options: { value: string; label: string }[]
      default: string
      hint?: string
    }
  | {
      kind: 'slider'
      id: string
      label: string
      min: number
      max: number
      step?: number
      default: number
      unit?: string
      hint?: string
    }
  | { kind: 'toggle'; id: string; label: string; default: boolean; hint?: string }
  | {
      kind: 'text'
      id: string
      label: string
      default: string
      placeholder?: string
      hint?: string
    }
  | { kind: 'color'; id: string; label: string; default: string; hint?: string }
  | {
      kind: 'dimensions'
      id: string
      label: string
      default: { width: number; height: number }
      hint?: string
    }
  | {
      kind: 'timerange'
      id: string
      label: string
      default: { start: number; end: number }
      hint?: string
    }

export type FaqEntry = { q: string; a: string }

export type ToolDef = {
  slug: string
  category: string
  /** SEO/heading title, sentence case. */
  title: string
  /** Meta description (~150 chars). */
  description: string
  engine: ToolEngine
  /** Accepted input MIME/extension hints, e.g. `image/*`, `.heic`. */
  accepts: string[]
  /** Output description, e.g. `JPG`. */
  produces: string
  controls: Control[]
  /** Steps of the on-page how-to, rendered as `[1]`.. rows. */
  howTo?: string[]
  chainable: boolean
  status: ToolStatus
  /** True for tools that create media from settings alone (no input files). */
  generator?: boolean
  /** True when the tool needs a painted mask (inpainting tools). */
  mask?: boolean
  /** Secondary file the tool needs (e.g. a watermark logo). */
  asset?: { id: string; label: string; hint?: string }
  /** On-device AI model metadata (drives the model-download console). */
  ai?: { model: string; bytes: number; runtime: 'webgpu' | 'wasm' }
  faq?: FaqEntry[]
  /** Related tools: bare slug (same category) or `category/slug`. */
  related?: string[]
}

export type ToolCategoryDef = {
  /** URL segment: /tools/<id> */
  id: string
  title: string
  blurb: string
  /** Display order on /tools. */
  order: number
  /** Group label for the homepage grid. */
  group: 'media' | 'video' | 'audio' | 'ai'
}
