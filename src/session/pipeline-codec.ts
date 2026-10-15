/*
 * Pipeline encoding for shareable URLs.
 *
 * A pipeline is an ordered list of tool steps with params. It is encoded as
 * base64url JSON so a link can carry a full workflow. Pure logic — no DOM —
 * so the round trip is unit-testable.
 */

export type PipelineStep = {
  /** `category/slug`, e.g. `convert/to-webp`. */
  toolRef: string
  /** Control values; missing keys fall back to the tool's defaults. */
  params: Record<string, unknown>
}

const toBase64Url = (value: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

const fromBase64Url = (value: string): string => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(withPadding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodePipeline(steps: PipelineStep[]): string {
  return toBase64Url(JSON.stringify(steps))
}

/** Decode a shared pipeline, tolerating junk without throwing. */
export function decodePipeline(value: string | null | undefined): PipelineStep[] | null {
  if (!value || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(fromBase64Url(value.trim())) as unknown
    if (!Array.isArray(parsed)) return null
    const steps: PipelineStep[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as { toolRef?: unknown; params?: unknown }
      if (typeof record.toolRef !== 'string' || !record.toolRef.includes('/')) continue
      const params =
        typeof record.params === 'object' && record.params !== null
          ? (record.params as Record<string, unknown>)
          : {}
      steps.push({ toolRef: record.toolRef, params })
    }
    return steps.length > 0 ? steps : null
  } catch {
    return null
  }
}

/** `convert/to-webp` → `convert · to-webp` for compact display. */
export const formatToolRef = (toolRef: string): string => toolRef.replace('/', ' · ')

/** One-line summary of a step's non-default params (for the strip). */
export function summariseParams(params: Record<string, unknown>, max = 3): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (entries.length === 0) return 'defaults'
  const parts = entries
    .slice(0, max)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
  return parts.join(' · ') + (entries.length > max ? ` +${entries.length - max}` : '')
}
