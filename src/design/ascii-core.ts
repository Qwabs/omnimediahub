/*
 * Pure ASCII helpers — no JSX in this file (keeps fast-refresh happy and
 * lets the prerender script import the maths without touching React).
 */

/** 3x5 block-pixel glyphs. '#' fills a cell, '.' leaves it empty. */
export const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '#.#', '#.#', '.##'],
  K: ['#.#', '##.', '#..', '##.', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '##.', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '##.', '..#', '##.'],
  ' ': ['...', '...', '...', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
}

const ROWS = 5
const FILL = '\u2588' // █
const EMPTY = ' '

/** Render `text` as rows of block characters. Uppercase; unknown chars fall back to space. */
export function asciiArt(text: string): string[] {
  const letters = [...text.toUpperCase()]
  return Array.from({ length: ROWS }, (_, row) =>
    letters
      .map((ch) => (GLYPHS[ch] ?? GLYPHS[' '])[row].replaceAll('#', FILL).replaceAll('.', EMPTY))
      .join(' '),
  )
}

/** `[████████░░░░░░░░]` — the system's only progress indicator. */
export function asciiBar(value: number, max = 100, width = 16): string {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  const filled = Math.round(ratio * width)
  return `[${FILL.repeat(filled)}${EMPTY.repeat(width - filled)}]`
}

export type JobState = 'queued' | 'running' | 'done' | 'error'

export const JOB_GLYPH: Record<JobState, string> = {
  queued: '[ ]',
  running: '[>]',
  done: '[✓]',
  error: '[!]',
}

export const JOB_LABEL: Record<JobState, string> = {
  queued: 'queued',
  running: 'running',
  done: 'done',
  error: 'error',
}
