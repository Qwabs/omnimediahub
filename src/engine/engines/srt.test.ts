import { describe, expect, it } from 'vitest'
import { mergeAdjacentCues, parseSubtitles, parseTimestamp, wrapText } from './srt'

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello world
second line

2
00:00:04,000 --> 00:00:06,000
Another cue
`

const VTT = `WEBVTT

00:01.000 --> 00:03.000
Short form cue

NOTE this is a comment

cue-id
00:04.000 --> 00:05.500
<c.yellow>Styled</c> cue
`

describe('parseTimestamp', () => {
  it('parses SRT timestamps', () => {
    expect(parseTimestamp('00:00:01,500')).toBeCloseTo(1.5, 3)
    expect(parseTimestamp('01:02:03,250')).toBeCloseTo(3723.25, 3)
  })

  it('rejects junk', () => {
    expect(parseTimestamp('not a time')).toBeNull()
    expect(parseTimestamp('')).toBeNull()
  })
})

describe('parseSubtitles', () => {
  it('parses SRT cues with multi-line text', () => {
    const cues = parseSubtitles(SRT)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toMatchObject({ index: 1, start: 1, end: 3.5 })
    expect(cues[0].text).toBe('Hello world\nsecond line')
  })

  it('parses WebVTT including short timestamps and ids', () => {
    const cues = parseSubtitles(VTT)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toMatchObject({ start: 1, end: 3 })
    expect(cues[1].text).toBe('Styled cue')
  })

  it('drops malformed blocks', () => {
    const broken = `1
00:00:05,000 --> 00:00:03,000
Backwards cue

2
no timing here

3
00:00:07,000 --> 00:00:09,000
`
    expect(parseSubtitles(broken)).toHaveLength(0)
  })

  it('returns cues sorted by start time', () => {
    const unordered = `1
00:00:05,000 --> 00:00:06,000
later

2
00:00:01,000 --> 00:00:02,000
earlier
`
    const cues = parseSubtitles(unordered)
    expect(cues.map((c) => c.start)).toEqual([1, 5])
  })

  it('handles CRLF and a BOM', () => {
    const windows = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n'
    expect(parseSubtitles(windows)).toHaveLength(1)
  })
})

describe('mergeAdjacentCues', () => {
  it('joins identical touching cues', () => {
    const merged = mergeAdjacentCues([
      { index: 1, start: 0, end: 1, text: 'same' },
      { index: 2, start: 1.02, end: 2, text: 'same' },
      { index: 3, start: 3, end: 4, text: 'other' },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0].end).toBe(2)
  })

  it('keeps cues with different text separate', () => {
    const merged = mergeAdjacentCues([
      { index: 1, start: 0, end: 1, text: 'a' },
      { index: 2, start: 1, end: 2, text: 'b' },
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('wrapText', () => {
  it('wraps on word boundaries', () => {
    expect(wrapText('one two three four', 7)).toBe('one two\nthree\nfour')
  })

  it('preserves explicit line breaks', () => {
    expect(wrapText('a\nb', 20)).toBe('a\nb')
  })

  it('never returns empty lines for empty input', () => {
    expect(wrapText('', 10)).toBe('')
  })
})
