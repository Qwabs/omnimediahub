/*
 * AI engine.
 *
 * A single worker (models are large — never load them twice) plus a
 * main-thread pre-step: speech recognition needs decoded 16kHz mono PCM,
 * and OfflineAudioContext only exists on the main thread.
 */
import { EngineError } from '../types'
import { createWorkerPool } from '../worker-pool'
import type { EngineRunner } from '../types'

/** Decode any audio/video file to 16kHz mono Float32 (Whisper's input). */
async function decodeToPcm(data: ArrayBuffer): Promise<Float32Array> {
  let buffer: AudioBuffer
  try {
    const context = new OfflineAudioContext(1, 16000, 16000)
    buffer = await context.decodeAudioData(data)
  } catch (error) {
    throw new EngineError(
      `could not decode audio for transcription (${error instanceof Error ? error.message : String(error)})`,
    )
  }
  const left = buffer.getChannelData(0)
  if (buffer.numberOfChannels === 1) return left.slice()
  const right = buffer.getChannelData(1)
  const mono = new Float32Array(left.length)
  for (let i = 0; i < left.length; i += 1) mono[i] = (left[i] + right[i]) / 2
  return mono
}

export function createAiEngine(): EngineRunner {
  const pool = createWorkerPool({
    name: 'ai',
    concurrency: 1,
    factory: () => new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' }),
  })

  return {
    name: 'ai',
    concurrency: 1,
    run(req, opts = {}) {
      if (req.op !== 'transcribe') return pool.run(req, opts)
      return (async () => {
        const input = req.inputs[0]
        if (!input) throw new EngineError('no input')
        opts.onProgress?.(3, 'decoding audio for transcription')
        const pcm = await decodeToPcm(input.data)
        const seconds = pcm.length / 16000
        if (seconds < 0.2) throw new EngineError('the audio track is too short to transcribe')
        opts.onProgress?.(8, `decoded ${seconds.toFixed(1)}s of audio`)
        return pool.run(
          {
            ...req,
            inputs: [
              {
                name: input.name,
                type: 'audio/raw-f32',
                data: pcm.buffer as ArrayBuffer,
              },
            ],
          },
          opts,
        )
      })()
    },
    abort() {
      pool.abort()
    },
  }
}
