import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FFMPEG_CORE_WASM_URL, ORT_WASM_PREFIX } from './vendor'

/*
 * The oversized engine binaries live on jsDelivr (see vendor.ts) rather than
 * in the repository, so nothing forces the pinned versions to track
 * package-lock automatically. These tests fail the moment a dependency bump
 * makes the URLs lie.
 */

const installedVersion = (pkg: string): string =>
  (JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')) as { version: string }).version

describe('pinned vendor URLs', () => {
  it('ffmpeg core points at the installed @ffmpeg/core version', () => {
    expect(FFMPEG_CORE_WASM_URL).toBe(
      `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${installedVersion('@ffmpeg/core')}/dist/esm/ffmpeg-core.wasm`,
    )
  })

  it('ONNX runtime prefix points at the installed onnxruntime-web version', () => {
    expect(ORT_WASM_PREFIX).toBe(
      `https://cdn.jsdelivr.net/npm/onnxruntime-web@${installedVersion('onnxruntime-web')}/dist/`,
    )
  })
})
