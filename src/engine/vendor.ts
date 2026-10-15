/*
 * Engine binaries that Cloudflare Pages would reject.
 *
 * Pages caps a single site asset at 25 MiB. The ffmpeg core wasm (≈31 MB) and
 * three of the ONNX runtime builds exceed that, so they are served from pinned
 * jsDelivr URLs instead — the exact versions package-lock installs, verified
 * byte-identical (`vendor.test.ts` asserts the versions stay in lockstep).
 *
 * Everything else stays same-origin. The service worker caches these URLs on
 * first use (see `vite.config.ts`), so offline behaviour is unchanged.
 */

/** ffmpeg core wasm — the JS loader and worker stay same-origin. */
export const FFMPEG_CORE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm'

/**
 * ONNX runtime dist prefix. A prefix (not a `{mjs, wasm}` object) keeps the
 * runtime's own variant selection — jsep / threaded / asyncify — intact.
 */
export const ORT_WASM_PREFIX =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/'
