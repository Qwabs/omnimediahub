# OmniMediaHub

A privacy-first, browser-based media toolbox — **images, GIFs, video and audio**, processed 100% locally with WebAssembly. No uploads, no accounts, no watermarks, free forever.

> Design language: OpenCode's terminal/manpage system — cream canvas, monospace everywhere, ASCII bracket markers, hairline rules, one dark console surface per page.

## Status

**Phase 0 — foundations — complete.**
**Phase 1 — engine vertical slice — complete:** four engines running locally (libvips, GIF, ffmpeg.wasm, Web Audio) with end-to-end browser verification.
**Phase 2 — image catalog — complete:** the image side of BulkPicTools is functionally covered — compression-to-target-size, passport/ID crops, metadata read/edit, adjustments, effects and compositing all on-device.
**Phase 3 — GIF catalog — complete:** 25 GIF tools on a shared frame pipeline — compressor with a size ladder, resizer/cropper/rotator/reverser/speed/trimmer/merger, text and blur, frame extraction, sprite sheets both ways, a typing-text generator, and GIF↔MP4/WebP/APNG via ffmpeg.
**Phase 4 — video catalog — complete:** 14 video tools — convert, lossless or frame-accurate trim, target-size compression, crop/resize/rotate, speed with pitch-preserved audio, volume/normalise/mute, text or logo watermarks, merge, thumbnails, audio extraction and burned-in subtitles. Watermarks and subtitles are canvas-rendered PNGs composited by ffmpeg, so no fonts are downloaded.
**Phase 5 — audio catalog — complete:** 10 audio tools — convert, trim with fades, join with crossfades, peak normalisation, volume boost, tape-style speed/pitch, reverse, silence removal, waveform PNG export and a lossless ID3v2.4 tag editor. Only AI transcription remains planned.
**Phase 6 — local AI — complete:** 8 on-device AI tools — background removal (MODNet), AI super-resolution (Swin2SR 2×/4×), unpixelate, mask-painted object/watermark removal, person detection for privacy blurring (YOLOS-tiny), and Whisper speech transcription to TXT/SRT/VTT. WebGPU when available, WASM otherwise; models download once and cache.
**Phase 7 — chain console + scenes — complete:** `/console` builds a chain of tools and runs it over a batch — each step feeds the next in memory, files are read once, and the whole workflow is shareable as a link. The 7 scenes open there as editable chains, and presets cover common delivery jobs.
**Phase 8 — hardening & launch — complete:** installable PWA with precached shell and NetworkFirst navigations, engines cached on first use (verified by a real network-cut test), Cloudflare Pages headers, an on-brand OG social card, and a full acceptance run across every phase.

**Launch state: 94 live tools · 154 prerendered pages · 7 scenes · 8 engines · installable & offline-capable · zero server-side processing.**

## Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite 8 |
| Routing | react-router 8 (static prerender for SEO) |
| Styling | Tailwind v4 with `@theme` tokens from DESIGN.md |
| State | Zustand session store |
| Engines | wasm-vips (libvips) · gifenc · ffmpeg.wasm · Web Audio + lamejs |
| Hosting | Cloudflare Pages (`public/_headers` sets COOP/COEP for SharedArrayBuffer) |

## Commands

```bash
npm run dev        # dev server (with cross-origin isolation headers)
npm run build      # vendor assets + tsc + client build + SSR build + prerender (→ dist/)
npm run test       # vitest — registry, engine bindings, SEO, codecs, math
npm run lint       # eslint
npm run preview    # serve the built site

# End-to-end probes (real WASM/AI in headless Chrome via CDP)
node scripts/e2e-runner.mjs http://localhost:4173/_probe.html   # after copying a probe into dist/
node scripts/e2e-offline.mjs                                    # PWA offline verification
```

`npm run build` writes **154 prerendered pages** plus `404.html`, `sitemap.xml`, `sw.js` and the web manifest. The client hydrates over the static HTML.

## Deploy (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 24 (set `NODE_VERSION=24`; matches CI) — the build copies WASM assets and prerenders |

`public/_headers` ships with the deployment and is the load-bearing file: **COOP `same-origin` + COEP `require-corp`** enable `SharedArrayBuffer`, which the multithreaded WASM engines need. Fonts, WASM binaries, models and the OG image are all same-origin, so `require-corp` breaks nothing. Long-lived immutable caching is set for `/assets`, `/fonts`, `/wasm`, `/ffmpeg` and `/models`; `sw.js` is `no-cache`.

The only assets not served from the deployment are the oversized engine binaries — the ~31 MB ffmpeg core wasm and the ONNX runtime builds — which exceed Pages' **25 MiB per-file limit** and are therefore pinned to jsDelivr (`src/engine/vendor.ts`; byte-identity verified, versions asserted in `vendor.test.ts`). The service worker caches them on first use like every other engine file, so offline behaviour is unchanged.

The site is fully static — no functions, no database, no server processing. `dist/` deploys anywhere that can serve files with the headers above.

### Git-connected auto-deploys

The repository is wired for Cloudflare Pages' Git integration: every push to `main` deploys the live site, and every pull request gets its own preview URL. Nothing secret is involved — the build is fully static, so no environment variables are required beyond the Node version.

To connect (or recreate) the deployment:

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick `Qwabs/omnimediahub`.
2. Production branch **`main`** · build command **`npm run build`** · output directory **`dist`**.
3. Set **`NODE_VERSION=24`** to match CI (an `.nvmrc` works too).

Both CI (`.github/workflows/ci.yml`) and Cloudflare build every push — CI is the correctness gate, Cloudflare the deployer. To make CI the only gate, pause Cloudflare's builds in **Settings → Builds & deployments**.

## Layout

```
src/
├─ design/        tokens.css · base.css · ascii-core.ts · ascii.tsx
├─ components/    Button · Tabs · fields · DropZone · FileRow · Console · Faq · QuickSearch …
├─ app/           App (routes) · layout/ (AppShell · Nav · Footer)
├─ engine/
│  ├─ types.ts · capabilities.ts · worker-pool.ts · queue.ts · ops.ts
│  ├─ io/         intake.ts (files/folders/ZIP) · download.ts (single + streaming ZIP)
│  ├─ workers/    vips.worker.ts · gif.worker.ts
│  └─ engines/    ffmpeg.ts · audio.ts · index.ts (assembly)
├─ session/       store.ts (Zustand) · run.ts (tool → jobs orchestration)
├─ tools/
│  ├─ registry/   tools as DATA: types · categories · convert · compress · resize · … · index
│  └─ pages/      ToolWorkspace (intake · settings · results · console)
├─ pages/         HomePage · ToolsIndexPage · CategoryPage · ToolPage · ScenesPage · SimplePage · NotFoundPage
├─ lib/           seo.ts (route metas + JSON-LD) · use-seo.ts
└─ entry-server.tsx   build-time SSR entry (used by scripts/prerender.mjs)
scripts/
├─ copy-vendor-assets.mjs   wasm/ffmpeg assets from node_modules → public/ (runs on predev/prebuild)
├─ prerender.mjs            static HTML + sitemap
├─ e2e-runner.mjs           CDP driver for the browser probes
└─ e2e-probe*.html          engine, batch and cancel acceptance probes
```

### The core idea

**Tools are data, engines are code.** A `ToolDef` in `src/tools/registry/` renders a full tool page — controls, copy, FAQ, SEO — and `src/engine/ops.ts` wires it to a shared engine op (with optional fixed params and a `translate` hook for preset families). That is how ~150 pages stay maintainable.

### The pipeline console

`/console` chains tools and runs the chain over a batch: `session/pipeline.ts` executes step N+1 on step N's in-memory output (files are read from disk once; only the final step re-encodes), with per-file lanes, live progress in the console panel, cancellation, and a 400MB intermediate guard. Chains encode to base64url JSON in the URL (`session/pipeline-codec.ts`), so presets, scenes and shared links all use one format — scenes open in the console as editable chains.

### Engines

- **vips** (`vips.worker.ts`) — libvips in a worker pool: convert, resize (dimensions/percent/longest, cover/contain/inside/stretch), rotate, flip, compress-to-target, aspect and passport crops (with 4×6 print sheets), circle crops. HEIC decode and AVIF/SVG support load as dynamic libraries.
- **raster** (`raster.worker.ts`) — OffscreenCanvas effects and compositing: adjustments, blur/pixelate (retro palettes), seeded glitch, rounded corners (circular + squircle), split-into-ZIP, text/logo watermarks, merge and overlay.
- **exif** (`engines/exif.ts`) — metadata read (exifr) and edit (piexifjs for JPEG), plus byte-level DPI writing for JPEG/PNG (`engine/dpi.ts`).
- **gif** (`gif.worker.ts`) — animated frame pipeline: decode via `ImageDecoder`, transform per frame on `OffscreenCanvas`, encode via gifenc. Compression walks a palette → dimensions → frame-count ladder (`gif-timing.ts`, unit-tested). Sixteen ops covering the whole GIF catalog, plus ffmpeg-backed `to-gif`/`from-gif` for MP4/WebP/APNG conversions.
- **ffmpeg** (`engines/ffmpeg.ts`) — ffmpeg.wasm 0.12 — the core loader and wrapper are same-origin, while the ~31 MB core wasm comes from a pinned jsDelivr URL (Cloudflare Pages' 25 MiB per-file limit); 15 ops covering the video catalog (convert, trim, compress-to-target, crop, resize, rotate, speed, volume, watermark, merge, thumbnails, to-audio, subtitles) plus GIF↔MP4/WebP/APNG. Text watermarks and subtitles are rendered to PNGs on a canvas and composited with `overlay` — the build ships no fonts. Sources without audio transparently fall back to video-only graphs, and files above 1.2GB are refused with an explanation of the 32-bit memory budget.
- **audio** (`engines/audio.ts`) — OfflineAudioContext decode, lamejs MP3 and hand-rolled WAV encode, cooperative cancellation. Ten ops: convert, trim with fades, merge with crossfade, peak normalisation with soft limiting, gain boost, tape-style speed/pitch, reverse, silence removal, waveform rendering and ID3 tagging (`engines/id3.ts`, pure + unit-tested).
- **ai** (`workers/ai.worker.ts` + `engines/ai.ts`) — transformers.js 4.3.1 on-device inference: MODNet background removal, Swin2SR super-resolution, a distance-ordered inpainting fill, YOLOS-tiny person detection, and Whisper transcription. WebGPU when an adapter exists, WASM otherwise; ONNX runtime binaries come from a pinned jsDelivr prefix (byte-identical to the installed version, asserted by a unit test), models download once from the Hugging Face hub and cache. Whisper input is decoded to 16kHz mono PCM on the main thread (OfflineAudioContext is main-thread only).

### Offline behaviour

The service worker (Workbox, configured in `vite.config.ts`) precaches the app shell — every prerendered page plus the JS/CSS/fonts — and uses **NetworkFirst** for navigations, so online users always get the fresh prerendered HTML while offline visits are served from cache. Engine binaries and AI models are deliberately *not* precached; they use CacheFirst on first use, which makes "works offline after the first load" literally true. `scripts/e2e-offline.mjs` proves it by cutting the network with CDP and running a conversion.

### Privacy model

No upload endpoint exists. Files are read from disk, processed in browser memory, written back as downloads. AI models download once from the Hugging Face hub and then run on-device. The `[ 0 uploads · ever ]` claim is testable: open DevTools → Network and process a batch.

Files are also read lazily: bytes are materialised **only when a job lane picks a file up**, so a 1000-file batch never holds 1000 buffers, and cancelling terminates workers (vips/gif/raster/ai) or aborts cooperatively (audio/ffmpeg), keeps completed results and returns the rest to the queue.

### Compression to an exact size

`workers/compress-search.ts` is pure logic (unit-tested): binary-search the highest quality that fits the byte target, then step dimensions down 15% at a time. Two strategies are exposed in the UI — quality-first (best-looking result) and dimensions-first (keeps pixel size as long as possible). Verified: 1.76MB → 97KB.

### Design rules (do not bend)

- Cream canvas `#fdfcfc` is the only page background; no shadows, no gradients, no sans-serif.
- 4px radius on interactive elements, 0px on containers.
- ASCII brackets are the only iconography: `[+]` `[✓]` `[>]` `[ ]` `[1]` `[ live ]`.
- One dark surface per page. On marketing pages it is the hero console mockup; in the workspace it is the Console panel — the only place the semantic colour ramp appears.
- Engines and tool status are never faked: a tool without an engine binding renders `[ soon ]` and its process button stays disabled.
- Claims are verified end-to-end: every engine has a browser probe that checks real bytes, dimensions and bytes-on-disk.

## License

MIT — see [LICENSE](LICENSE).

