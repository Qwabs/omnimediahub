import { describe, expect, it } from 'vitest'
import { applyId3, buildId3, id3Size, readId3, stripId3 } from './id3'

/** A fake MP3: a few bytes of "audio" after an optional tag. */
const AUDIO = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x11, 0x22, 0x33, 0x44])

describe('buildId3 / readId3', () => {
  it('round-trips tags as UTF-8', () => {
    const tag = buildId3({ title: 'Café Solaire', artist: 'Ünicode Band', album: 'Prüfung', year: '2026' })
    const bytes = new Uint8Array([...tag, ...AUDIO])
    const parsed = readId3(bytes)
    expect(parsed.title).toBe('Café Solaire')
    expect(parsed.artist).toBe('Ünicode Band')
    expect(parsed.album).toBe('Prüfung')
    expect(parsed.year).toBe('2026')
    expect(parsed.frames).toBe(4)
  })

  it('writes a v2.4 header with a syncsafe body size', () => {
    const tag = buildId3({ title: 'x' })
    expect(String.fromCharCode(tag[0], tag[1], tag[2])).toBe('ID3')
    expect(tag[3]).toBe(4)
    expect(tag[6] & 0x80).toBe(0) // syncsafe: high bit must be clear
  })

  it('reports no frames for untagged audio', () => {
    expect(readId3(AUDIO).frames).toBe(0)
    expect(id3Size(AUDIO)).toBe(0)
  })
})

describe('stripId3', () => {
  it('removes only the tag, keeping audio bytes', () => {
    const tagged = applyId3(AUDIO, { title: 'Remove me' })
    const stripped = stripId3(tagged)
    expect(Array.from(stripped)).toEqual(Array.from(AUDIO))
  })

  it('is a no-op on untagged bytes', () => {
    expect(Array.from(stripId3(AUDIO))).toEqual(Array.from(AUDIO))
  })
})

describe('applyId3', () => {
  it('adds a tag in front of the audio', () => {
    const tagged = applyId3(AUDIO, { title: 'Song', artist: 'Band' })
    expect(id3Size(tagged)).toBeGreaterThan(0)
    expect(tagged.slice(id3Size(tagged))).toEqual(AUDIO)
    expect(readId3(tagged).title).toBe('Song')
  })

  it('replaces an existing tag rather than stacking', () => {
    const once = applyId3(AUDIO, { title: 'First' })
    const twice = applyId3(once, { title: 'Second' })
    expect(readId3(twice).title).toBe('Second')
    expect(readId3(twice).frames).toBe(1)
    expect(twice.slice(id3Size(twice))).toEqual(AUDIO)
  })

  it('strips when asked explicitly', () => {
    const tagged = applyId3(AUDIO, { title: 'Gone' })
    const stripped = applyId3(tagged, {}, true)
    expect(id3Size(stripped)).toBe(0)
    expect(Array.from(stripped)).toEqual(Array.from(AUDIO))
  })

  it('treats an empty tag set as a strip', () => {
    const tagged = applyId3(AUDIO, { title: 'Gone' })
    expect(id3Size(applyId3(tagged, {}))).toBe(0)
  })
})
