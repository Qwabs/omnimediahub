/*
 * ASCII components. The brand's only iconography: a block-pixel wordmark,
 * bracketed status glyphs and bar-style progress. Everything is text —
 * never an SVG icon.
 */
import { asciiArt, asciiBar } from './ascii-core'

/**
 * A block-pixel ASCII title. Never render the brand as a vector logo.
 */
export function AsciiWordmark({
  text = 'OMNIMEDIAHUB',
  pixelSize = 6,
  className = '',
}: {
  text?: string
  /** Font size in px; the block grid scales linearly from here. */
  pixelSize?: number
  className?: string
}) {
  return (
    <pre
      role="img"
      aria-label={text}
      className={`select-none leading-none font-bold ${className}`}
      style={{ fontSize: `${pixelSize}px`, letterSpacing: 0 }}
    >
      {asciiArt(text).join('\n')}
    </pre>
  )
}

/** Compact mark for tight spaces (mobile nav). */
export function AsciiMark({
  text = 'OMH',
  className = '',
}: {
  text?: string
  className?: string
}) {
  return <AsciiWordmark text={text} pixelSize={5} className={className} />
}

/** `[████████░░░░░░░░] 42%` with an accessible progressbar role. */
export function AsciiProgress({
  value,
  max = 100,
  width = 16,
  label,
  className = '',
}: {
  value: number
  max?: number
  width?: number
  /** Overrides the default `NN%` readout (e.g. `42/100 files`). */
  label?: string
  className?: string
}) {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  const readout = label ?? `${Math.round(ratio * 100)}%`
  return (
    <span className={`inline-flex items-center gap-2 text-body-md ${className}`}>
      <span aria-hidden="true">{asciiBar(value, max, width)}</span>
      <span className="tabular-nums">{readout}</span>
      <span
        className="sr-only"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </span>
  )
}
