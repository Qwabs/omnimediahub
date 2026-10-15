# OmniMediaHub — Implementation Plan

**Status:** Approved 2026-10-14 · Phase 0 complete (foundations landed)
**Working directory:** the repository root (`OmniMediaHub/`)
**Design source:** OpenCode's marketing design system (cream canvas · monospace · ASCII brackets)
**Feature reference:** bulkpictools.com (90+ browser-local image tools, batch processing, tool chaining, zero uploads)
**Package manager:** npm (repo already has `package-lock.json`)

---

## 1. Product summary

OmniMediaHub is a **privacy-first, 100% in-browser media toolbox**:

- **BulkPicTools feature parity** — 90+ image tools, batch processing of 100–1000+ files, tool chaining without re-uploading, works offline, free forever.
- **Extended to audio and video** — convert/compress/trim/merge/watermark/extract for video; convert/trim/merge/normalize/speed-pitch/ID3 for audio; AI transcription.
- **Rendered in the OpenCode design language** — terminal/manpage aesthetic: warm cream canvas, monospace everywhere, ASCII bracket markers as the only iconography, hairline rules, 4px radii, one dark surface per page.

**Zero server-side processing. No uploads. Ever.** This is a verifiable invariant (see §11).

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite 8 (existing scaffold; different from BulkPicTools' Nuxt 3) |
| SEO rendering | Vite SPA + **build-time prerender** of every registry route to static HTML (meta, JSON-LD, content); workspace hydrates client-side |
| Styling | **Tailwind v4** with `@theme` tokens mapped 1:1 from DESIGN.md + thin ASCII component layer |
| Build order | **Vertical slice across all engines first** (Phase 1 proves image/GIF/video/audio), then catalog breadth |
| Deployment | **Cloudflare Pages** + `_headers` (COOP/COEP for SharedArrayBuffer / multithreaded WASM) |
| i18n | English-only at launch; routes and `t()` prepared from day one; `/zh/*` mirror in Phase 8 |
| Brand | "OmniMediaHub" wordmark (block-pixel ASCII); routes at `/tools/<category>/<slug>` |
| Package manager | npm |

---

## 3. Design system application (DESIGN-opencode.ai.md → OmniMediaHub)

### 3.1 Tokens (verbatim from DESIGN.md)

- Colors: `canvas #fdfcfc`, `ink #201d1d`, `ink-deep #0f0000`, `charcoal #302c2c`, `body #424245`, `mute #646262`, `stone #6e6e73`, `ash #9a9898`, `surface-soft #f8f7f7`, `surface-card #f1eeee`, `surface-dark #201d1d`, `surface-dark-elevated #302c2c`, `hairline rgba(15,0,0,0.12)`, `hairline-strong #646262`.
- Semantic (in-TUI only): `accent #007aff` (+hover/active), `warning #ff9f0a`, `danger #ff3b30`, `success #30d158`.
- Typography: display-xl 38/700/1.5 · heading-md 16/700 · body-md 16/400 · body-strong 16/500 · body-tight 16/500/1 · button-md 16/500/2 · caption-md 14/400/2.
- Radii: `none 0px` (containers), `sm 4px` (all interactive), `full 9999px` (avatar circles only).
- Spacing: 1 / 4 / 8 / 12 / 16 / 24 / 32 / **section 96px** rhythm.
- Map all of the above into Tailwind v4 `@theme` in `src/design/tokens.css`. Sections separated only by 1px hairline rules; **no shadows, no gradients, no sans-serif anywhere in the chrome**.

### 3.2 Font

Berkeley Mono is a paid commercial font. Substitute (per the design doc's own guidance):

1. **JetBrains Mono** (self-hosted woff2, weights 400/500/700) — closest metric match
2. IBM Plex Mono → ui-monospace → SFMono-Regular → Menlo → Monaco → Consolas → Courier New

Line-heights preserved: body 1.5, buttons 2.0.

### 3.3 Signature primitives (all ASCII, no SVG icons)

| Primitive | Rendering |
|---|---|
| Wordmark | Block-pixel ASCII `OMNIMEDIAHUB` in nav + hero mockup |
| Progress | `[████████░░░░] 62%` |
| File row | `[✓] photo.png 4.2MB → 812KB (−81%)` |
| Queue status | `[>] running` · `[ ] queued` · `[!] error` · `[✓] done` |
| Drop zone | `[ + drop files here ]` inside dashed hairline box |
| FAQ | `[+]` / `[−]` toggles, plain text rows, 1px hairline bottom rule |
| Feature bullets | `[+] Label    Description` list rows |
| Jobs counter | `[ 42 / 100 processed ]` |

### 3.4 Dark surface policy (documented extension)

- Marketing pages: exactly **one** dark surface — the hero TUI mockup (per DESIGN.md). On OmniMediaHub it mocks up a processing console: ASCII wordmark, a command row (`chain  convert → compress → resize`), keybinding hints (`tab switch tool  ctrl-p commands`).
- Workspace: the **Console** panel (live job log) is the one dark surface per tool page — the DESIGN.md explicitly reserves the Apple semantic ramp for "the in-product TUI," so `[>]`/`[✓]`/`[!]` log tokens use accent/success/warning/danger there and nowhere else.
- This extension will be documented in a repo `DESIGN.md` so future contributors don't violate the system.

### 3.5 Component kit (Phase 0)

Button (primary/secondary/tab/disabled), Badge, Tabs strip, TextInput, Textarea, Select, Slider, ColorPicker, Toggle, DropZone, FileRow, ProgressBar (ASCII), Console, Dialog, Toast, FAQ accordion, Kbd, Stat/ChartTile (sparse ASCII plots), SectionHeader (`heading-md` + hairline rule), Nav (56px, hamburger < 768px), Footer (5-up → 2-up → 1-up grid), QuickSearch (`⌘K`).

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | React 19 + TypeScript + Vite 8 | Existing scaffold, cleaned of demo content |
| Routing | react-router v7 (library mode) | Code-split per tool page |
| Styling | Tailwind v4 + `@theme` tokens | `@tailwindcss/vite` plugin |
| State | Zustand + `idb-keyval` (IndexedDB) | Session files/jobs/pipeline; resumable sessions |
| Image engine | **wasm-vips** (libvips WASM) | JPEG/PNG/WebP/TIFF built in; **HEIF decode + AVIF/HEIC save via libheif** (verified); one API for resize/crop/rotate/format/quality |
| Image compression extras | `@jsquash/oxipng`, `@jsquash/mozjpeg`, `@jsquash/avif` | Best-in-class size reduction where wasm-vips presets underperform |
| HEIC fallback | `libheif-js` | If wasm-vips HEIF path fails the Phase 1 spike |
| GIF engine | `gifenc` (encode) + `ImageDecoder` API / `gifuct-js` (decode) | Full per-frame access for ~32 GIF tools |
| Video engine | **ffmpeg.wasm 0.12** (`@ffmpeg/core-mt` when `crossOriginIsolated`, `@ffmpeg/core` fallback) + WebCodecs fast path (`mp4box.js` + `mp4-muxer` / `webm-muxer`) | Multithread needs SharedArrayBuffer → COOP/COEP |
| Audio engine | `OfflineAudioContext` + `@breezystack/lamejs` (MP3) + `webm-muxer` (Opus) + WAV; ffmpeg.wasm for exotic formats | Precise, fast, no server |
| AI | **transformers.js v3** + `onnxruntime-web` (WebGPU → WASM fallback) | RMBG-1.4 (~45MB quantized) bg removal, MODNet, super-resolution, LaMa inpainting, face detection, Whisper for audio transcription |
| Workers | Typed RPC pool (comlink-style), per engine, transferable ArrayBuffers, AbortSignal cancellation | UI stays 60fps |
| Large files | **OPFS** scratch (`navigator.storage.getDirectory()`) + IndexedDB spill > 32MB | 1GB+ video without RAM blowup |
| Archives | `client-zip` (streaming ZIP output), `fflate` (ZIP import) | Download-all and folder/ZIP intake |
| EXIF | `exifr` (read), `piexifjs` (edit/strip) | |
| Offline | Workbox via `vite-plugin-pwa` | App shell precache + runtime cache for WASM/models |
| i18n | `react-i18next` | `/zh/*` mirror in Phase 8 |
| Testing | Vitest + Playwright + `pixelmatch`/`pngjs` golden images | Plus network-egress assertion for "0 uploads" |
| Hosting | Cloudflare Pages (`_headers`, optional R2 for AI models) | |

---

## 5. Architecture

### 5.1 Core insight: tools are data, engines are code

One `ToolDef` registry item renders a whole tool page; presets generate families (fixed sizes, compress targets, social formats) as data rows instead of new code.

```ts
type ToolDef = {
  slug: string;                        // 'heic-to-jpg'
  category: ToolCategory;              // 'convert' | 'compress' | 'resize' | 'crop' | 'rotate'
                                       // | 'gif' | 'watermark' | 'exif' | 'adjust' | 'edit'
                                       // | 'ai' | 'video' | 'audio'
  path: string;                        // '/tools/convert/heic-to-jpg'
  title: string; seoTitle: string; description: string;
  engine: 'vips' | 'gif' | 'ffmpeg' | 'audio' | 'ai' | 'exif';
  accepts: string[]; produces: string[];
  controls: Control[];                 // schema-driven UI: slider | select | toggle | color | text | dimensions | time-range
  defaults: Record<string, unknown>;
  chainable: boolean;                  // usable inside multi-step pipelines
  ai?: { model: string; bytes: number; runtime: 'webgpu' | 'wasm' };
  faq: { q: string; a: string }[];
  related: string[];
};
```

### 5.2 Worker + job model

- `engine/pool.ts` — lazily spawns N workers per engine (`min(hardwareConcurrency − 1, cap)`), typed RPC, model/wasm caching.
- `engine/queue.ts` — job queue with priorities, concurrency caps, per-job `AbortSignal`, progress events.
- `engine/pipeline.ts` — the chain core: `Session { files[], steps[] }`, execution = `for file → for step → enqueue engine job`; intermediate artifacts spill to OPFS when > 32MB; final artifacts as Blobs with object-URL lifecycle management.
- `engine/opfs.ts` — scratch storage, streaming reads for ffmpeg inputs/outputs.
- `engine/capabilities.ts` — detect WebGPU, WebCodecs, SharedArrayBuffer/`crossOriginIsolated`, OPFS; drive UI messaging and fallbacks.

### 5.3 File I/O

- Intake: drag & drop, folder drop (`webkitGetAsEntry`), file picker, ZIP import (`fflate`); duplicate + type filtering.
- Output: single download, streaming ZIP for "download all" (never materialize the whole archive in memory), File System Access API when available with anchor-download fallback.

### 5.4 Session state

- Zustand store: files, per-file status, jobs, results, pipeline steps, tool params (params also mirrored to URL query for shareable/SSR-friendly pages).
- IndexedDB persistence: session survives reload; input files referenced via OPFS handles where possible.

---

## 6. Directory structure

```
src/
├─ design/            # tokens.css, base.css, ascii.tsx (Progress, Wordmark, Brackets)
├─ components/        # kit from §3.5
├─ app/               # router.tsx, providers.tsx, layout/ (AppShell, Nav, Footer)
├─ tools/
│  ├─ registry/
│  │  ├─ types.ts
│  │  ├─ convert.ts · compress.ts · crop.ts · resize.ts · rotate.ts
│  │  ├─ gif.ts · watermark.ts · exif.ts · adjust.ts · edit.ts
│  │  ├─ ai.ts · video.ts · audio.ts · scenes.ts
│  │  └─ index.ts     # aggregate + lookup helpers
│  ├─ presets/        # fixed-size families, compress targets, social sizes
│  └─ pages/          # ToolPage, CategoryPage, ToolsIndexPage, ScenePage
├─ engine/
│  ├─ pool.ts · queue.ts · pipeline.ts · opfs.ts · capabilities.ts
│  └─ workers/        # vips.worker.ts · gif.worker.ts · ffmpeg.worker.ts
│                     # audio.worker.ts · ai.worker.ts · exif.worker.ts
├─ session/           # store.ts (Zustand) · persist.ts (IndexedDB)
├─ i18n/              # en (launch), zh (Phase 8)
├─ content/           # MDX SEO copy, FAQs, how-tos
└─ pages/             # home · tools-index · scenes · about · privacy · terms · contact · 404
scripts/
├─ prerender.tsx      # react-dom/server → dist/<route>/index.html + meta + JSON-LD
├─ sitemap.ts         # from registry
└─ og-images.ts       # ASCII-style OG cards (satori + resvg wasm)
public/
├─ fonts/             # JetBrains Mono woff2 (self-hosted)
├─ models/            # AI models (or R2), same-origin for COEP
├─ _headers           # COOP/COEP, cache policy (Cloudflare Pages)
└─ robots.txt
```

---

## 7. Routing & SEO

Routes: `/` · `/tools` · `/tools/:category` · `/tools/:category/:slug` · `/scenes/:slug` · `/about` `/privacy` `/terms` `/contact` · `/zh/*` (Phase 8).

- Build-time prerender of every registry route → static HTML (crawlable without JS); workspace hydrates on top.
- Per tool page: title/description/canonical/hreflang, JSON-LD (`SoftwareApplication` + `FAQPage` + `BreadcrumbList`), generated ASCII-style OG images, breadcrumb, FAQ, related tools.
- `sitemap.xml` generated from the registry at build.
- Perf budget: shell JS < 200KB gz; engines + models lazy-load and cache; `Content-Security-Policy` strict (no third-party origins).

---

## 8. Tool catalog (registry inventory)

**Image (~120 pages; "90+" easily covered):**

| Category | Count | Contents |
|---|---|---|
| Convert | 18 | image-converter (universal), heic-to-jpg, to-jpg, to-png, to-webp, to-avif, to-bmp, to-ico, avif→(jpg/png/webp/gif/bmp/ico/svg), png-to-jpg, svg-to-png, webp-to-jpg/gif/png |
| Compress | 9 | image-compressor, compress-to-2mb/1mb/500kb/200kb/100kb/50kb/20kb, reddit-pfp |
| Resize | ~27 | image-resizer, instagram, facebook, twitter/x, youtube-thumbnail, linkedin, tiktok, 4x6-photo + 19 fixed-size presets (64×64 … 3000×3000, generated) |
| Crop | 4 | image-cropper, passport-photo, 2x2-photo, circle |
| Rotate | 2 | rotator, flipper (+ auto-orient) |
| GIF | ~32 | gif-maker/editor, gif-compressor, images-to-gif, video-to-gif, gif→mp4/webp/apng, apng→gif, cropper, resizer, rotator, reverser, speed, trimmer, merger, text-adder, frame-extractor, sprite-sheet (both ways), webp→gif, svg→gif, live-photo→gif, gif→live-photo, discord-sticker, 3d-spinner, typing-text, blur-gif, compress-gif-to-{256kb,512kb,1mb,5mb,10mb} |
| Watermark/overlay | 3 | image-watermark, image-overlay, merge-images |
| EXIF | 4 | viewer, editor, dpi-checker, dpi-converter |
| Adjust | 7 | brightness, contrast, grayscale, invert, saturation, sepia, auto-enhance |
| Edit/effects | 7 | blur-image, blur-screenshot, pixelate, glitch, round-corners, split-image, add-text |
| AI | 7 | remove-background, image-upscaler (2×/4×), image-to-hd, remove-object, remove-watermark, unpixelate, blur-faces |

**Video (~16):** converter (mp4/webm/mov/mkv), compressor, trimmer, cropper, resizer, rotator, speed, mute/volume, watermark, merger, thumbnail/frame extractor, extract-audio, video→gif, gif→video, video→webm, subtitle burn-in (SRT/VTT).

**Audio (~16):** converter (mp3/wav/ogg/m4a/flac/aac), trimmer, merger, normalizer, volume booster, speed/pitch, reverser, fade in/out, extract-from-video, ringtone maker, waveform viewer, ID3 viewer/editor, silence remover, (AI) transcription, (AI) vocal remover.

**Scenes (7):** ID & passport photos · App icon export (iOS/Android/web) · E-commerce batch (Shopify/Amazon) · Social media sizes · Podcast cleanup · Vertical video pack (9:16) · Discord emoji/sticker pack.

**Totals at completion:** ~150 tool pages + 7 scene workflows.

---

## 9. Phases (each ends in something usable)

### Phase 0 — Foundations
Design tokens + fonts; ASCII component kit (§3.5); app shell (Nav/Footer/404); routing; `ToolDef` registry + 3 sample defs; home + `/tools` + one tool page rendered per DESIGN.md; `scripts/prerender.tsx` spike; dev + build COOP/COEP headers; scaffold cleanup; add Tailwind v4, react-router, Zustand, idb-keyval, Vitest, Playwright; strict TS/ESLint.
**Accept:** pages match the design doc; a11y/SEO ≥ 95 on shell pages.

### Phase 1 — Engine vertical slice (de-risk)
Worker pool + queue + pipeline core; drag-drop/folder/ZIP intake; results grid; streaming ZIP download; plus one tool per engine:

| Engine | Spike tool | Proves |
|---|---|---|
| wasm-vips | HEIC → JPG | HEIF/AVIF decode+encode, EXIF passthrough, quality params |
| GIF | Images → GIF | frame decode/encode, timing, palette |
| ffmpeg.wasm | Video trimmer | `core-mt`+SAB, OPFS scratch, progress parsing, cancel |
| Web Audio | Audio converter | decode/encode MP3/WAV/WebM, waveform preview |

**Accept:** 100-file image batch; 1GB video trim with progress+cancel; no crash on 8GB RAM; zero network egress verified.

### Phase 2 — Image catalog
All image categories from §8 live, incl. preset-generated families and golden-image tests.

### Phase 3 — GIF catalog
All ~32 GIF tools on the GIF engine; frame-precise verification.

### Phase 4 — Video catalog
~16 tools; WebCodecs fast paths for trim/convert/remux; OPFS streaming for large files.

### Phase 5 — Audio catalog
~16 tools; waveform UI; extraction from video.

### Phase 6 — Local AI
Model manager (ASCII download console, WebGPU/WASM capability messaging, cache after first download); 7 image AI tools + Whisper transcription + vocal remover.

### Phase 7 — Console/chaining + scenes
Pipeline builder (add/reorder steps, per-step params, apply-to-all); presets; shareable pipeline URLs; job dashboard (the dark Console); 7 scene workflows.

### Phase 8 — PWA, i18n, SEO, deploy
Workbox offline; `/zh` translation; sitemap/OG/JSON-LD; Cloudflare Pages deploy with `_headers`; full e2e + golden-image suite; Lighthouse ≥ 95.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| HEIC/AVIF encode in wasm-vips | Phase 1 spike confirms; fallback `@jsquash/avif` + `libheif-js` |
| COOP/COEP breaks external assets | Self-host fonts/models/OG images; no third-party origins; `_headers` with `require-corp` |
| ffmpeg.wasm 2GB WASM32 ceiling | OPFS streaming + WebCodecs fast path; chunked processing; clear size guidance |
| AI model download UX (40–200MB) | Explicit opt-in, cached in OPFS/Cache API, ASCII progress console, capability fallback |
| Berkeley Mono licensing | Substitute per doc (§3.2); one-line swap later |
| Safari/WebGPU gaps | Capability detection + WASM fallbacks; cross-browser matrix in Phase 8 |
| Scope (150 pages) | Registry-driven generation; engines shared; presets as data |
| Memory blowup on big batches | Concurrency caps, transferable buffers, OPFS spill, URL revocation, memory smoke tests |

---

## 11. Verification & "0 uploads" invariant

- Unit: param resolution, preset generation, size estimation, registry integrity (every page resolves, related links valid).
- E2E (Playwright): drop file → process → download per engine; cancel mid-run; folder/ZIP intake; large-batch smoke.
- Golden images: deterministic fixtures per tool compared with `pixelmatch`.
- **Privacy test:** Playwright intercepts all network traffic during processing and asserts zero outbound requests (models/assets counted as cached same-origin only).
- A11y: axe checks on shell + tool pages; contrast AA; 36–44px touch targets per DESIGN.md.

---

## 12. Dependency additions by phase

- **P0:** `tailwindcss@4` + `@tailwindcss/vite`, `react-router`, `zustand`, `idb-keyval`, `vitest`, `@playwright/test`
- **P1:** `wasm-vips`, `comlink`, `gifenc`, `gifuct-js`, `@ffmpeg/ffmpeg` `@ffmpeg/util` `@ffmpeg/core` `@ffmpeg/core-mt`, `@breezystack/lamejs`, `webm-muxer`, `exifr`, `client-zip`, `fflate`
- **P2:** `@jsquash/oxipng`, `@jsquash/mozjpeg`, `@jsquash/avif`, `piexifjs`, `libheif-js` (fallback)
- **P4:** `mp4box.js`, `mp4-muxer`, `webm-muxer`
- **P6:** `@huggingface/transformers`, `onnxruntime-web`
- **P8:** `vite-plugin-pwa` (Workbox), `react-i18next`

---

## 13. Open items (revisit during build)

- Exact AI model selection per task (e.g., RMBG-1.4 vs MODNet; super-res model; LaMa vs alternative inpainting) — decide in Phase 6 spike with size/quality benchmarks.
- Cloudflare R2 vs repo-hosted models (depends on total model bytes).
- Whether `/blog` MDX section ships (BulkPicTools has one) — optional, defer past Phase 8.
- Analytics: default none (privacy-first); reconsider only if self-hosted/aggregate.

---

## 14. Progress log

### Phase 0 — Foundations — **delivered 2026-10-14**

- **Design system**: all DESIGN.md tokens mapped into Tailwind v4 `@theme` (`src/design/tokens.css`); JetBrains Mono self-hosted (3 weights, latin subset) with the documented fallback stack; base layer + component layer (`base.css`).
- **ASCII primitives**: 3×5 block-pixel font (`ascii-core.ts`) rendering the `OMNIMEDIAHUB` wordmark, `OMH` mark, `[████░░]` progress, `[ ]/[>]/[✓]/[!]` job glyphs.
- **Component kit**: Button/ButtonLink, Tabs, Badge + StatusTag, Section + SectionHeader, HairlineGrid/HairlineCell, fields (TextInput, Textarea, Select, Slider, Toggle, ColorInput), DropZone, FileRow/FileList, Console, Faq, ChartTile, Kbd, QuickSearch (⌘K), PageHeader + Breadcrumbs, HeroTuiMockup.
- **App shell**: sticky Nav (wordmark, links, ⌘K, CTA, hamburger), 5-up footer, skip link, 404 page.
- **Registry**: `ToolDef` schema + 13 categories + **78 tools** across convert/compress/resize/crop/rotate/gif/watermark/exif/adjust/edit/ai/video/audio, including preset-generated families (fixed sizes, target-size compressors); 7 scene definitions.
- **Tool pages**: registry-driven ToolPage with breadcrumbs, engine chips, and a live ToolWorkspace (file intake, schema-driven settings, console tab) ready for Phase 1 engines.
- **SEO/prerender**: `scripts/prerender.mjs` writes **104 static pages** + `404.html` + `sitemap.xml` at build; per-page title/description/canonical/OG/JSON-LD (SoftwareApplication + FAQPage).
- **Ops**: COOP/COEP headers in dev, preview and `public/_headers`; strict CSP-friendly (zero third-party origins); `.gitignore` for `dist-server`.
- **Verification**: ESLint clean · 11/11 Vitest tests (registry integrity, references, scene steps, SEO route coverage) · `tsc -b` clean · build clean · headless-Chrome responsive audit clean across **5 pages × 8 widths (360→1440)** · interaction probe verified hydration, tab switching, ASCII toggle and ⌘K filtering · zero page console errors.

**Next (Phase 1)**: worker pool + queue + pipeline core; wasm-vips, GIF, ffmpeg.wasm and Web Audio spikes — one live tool per engine (HEIC→JPG, images→GIF, video trim, audio convert).

### Phase 1 — Engine vertical slice — **delivered 2026-10-14**

Four engines running locally, verified end-to-end in a real browser:

| Engine | Implementation | Verified output |
|---|---|---|
| **vips** | wasm-vips 0.0.19 in a module worker pool (concurrency = cores−1, cap 4). Assets served same-origin from `/wasm` (`vips-es6.js`, `vips.wasm`, `vips-heif.wasm`, `vips-resvg.wasm`) so COEP holds and the pthread workers resolve. Ops: `convert`, `resize`, `rotate`, `flip`. | PNG→JPG `ff d8 ff e1` 240×160 (−88%), PNG→WebP `52 49 46 46` (−97%), exact-size resize 512×512, rotate 90° → 160×240, SVG→PNG 200×120 |
| **gif** | gifenc + `createImageBitmap`/OffscreenCanvas in a worker. Op: `images-to-gif` (combining tool → one job, many inputs). | 3 frames → GIF `47 49 46 38`, −86%, 12ms |
| **ffmpeg** | ffmpeg.wasm 0.12 (single-thread core, 32MB) with explicit same-origin core/worker URLs; serialised runner. Ops: `trim` (stream copy or re-encode), `convert` (mp4/webm/mov). | WebM trim `1a 45 df a3`, EBML intact |
| **audio** | OfflineAudioContext decode + lamejs MP3 / hand-rolled WAV; cooperative cancellation. Ops: `convert`, `trim` (fades). | 1.5s WAV → MP3 `ff fb` 36KB (−72%), 58ms |

**Infrastructure**
- `engine/worker-pool.ts` — typed RPC over postMessage, transferable buffers, per-engine concurrency, cancel = terminate + respawn.
- `engine/queue.ts` — lanes per engine, **lazy file reads** (a 100-file batch never holds 100 buffers), serial runner for main-thread engines.
- `session/run.ts` — tool → job orchestration, per-file state machine, live console log, size deltas, cancel that returns files to the queue.
- `engine/io/` — intake (files, folders via `webkitGetAsEntry`, ZIP via fflate) and output (single download + streaming ZIP via client-zip).
- `engine/ops.ts` — tool→engine bindings, including pattern-generated bindings for the fixed-size resize family and a `translate` hook (Instagram presets → engine params).
- `scripts/copy-vendor-assets.mjs` — copies wasm/ffmpeg assets from node_modules into `public/` on `predev`/`prebuild` (idempotent).

**Tools live (24)**: all 8 converters (incl. HEIC→JPG, SVG→PNG), bulk compressor, resizer + 8 fixed-size presets, Instagram resizer, rotator, flipper, GIF maker, video trimmer, video converter, audio converter, audio trimmer.

**Verification (headless Chrome, real WASM, real files)**
- `scripts/e2e-runner.mjs` + three probes drive the real UI: drop → process → inspect actual output blobs (magic bytes, decoded dimensions).
- 100-file batch: **100 done, 0 failed, 407ms** (4ms/file, 4 parallel workers), JS heap 5MB.
- Cancel mid-run: worker-pool path (images) and cooperative path (audio) — files return to the queue, results kept, UI alive, no false errors.
- Unsupported input: mixed batch → 1 converted, `notes.txt: unsupported input for this tool`.
- Bugs found and fixed by these tests: `locateFile`/pthread filename resolution for wasm-vips, `optimizeCoding` option removed in libvips 8.17, `.get()` unavailable in wasm-vips (format now derived from the file), audio engine ignoring cancel.

**Deliberately deferred**: OPFS staging and WebCodecs fast paths (Phase 4, with large-file video), progress bars per file for very small jobs, service-worker caching of wasm (Phase 8).

### Phase 2 — Image catalog to parity — **delivered 2026-10-14**

The image side of BulkPicTools is now functionally covered: **43 tools live**, 123 static pages.

**New engine ops**
- **vips worker** — `compress` (target-size search), `crop-ratio`, `crop-standard` (passport/ID at exact DPI + 4×6 print sheet via `insert`), `circle-crop` (supersampled anti-aliased mask + bandjoin), plus the Phase 1 ops.
- **raster worker (new)** — OffscreenCanvas ops: `adjust` (grayscale modes incl. colour-keep, invert, brightness, contrast), `blur` (gaussian/pixelate/cover), `pixelate` (Game Boy / NES / C64 palettes), `glitch` (seeded RGB split, row shifts, scanlines), `round-corners` (circular + squircle paths), `split` (tiles → ZIP), `watermark` (text or logo, tiled/positioned), `merge` (side-by-side/stacked/grid), `overlay` (background + layers).
- **exif engine (new)** — `read` (exifr: tags, GPS, camera, DPI, print size → JSON report with console summary) and `edit` (piexifjs tag edits for JPEG; lossless strip; canvas re-encode for other formats), plus `set-dpi`.

**Compression search** (`workers/compress-search.ts`, pure + unit-tested) — binary search for the highest quality under a byte target, then a 15% dimension ladder; two strategies (quality-first / dimensions-first). Verified: a 1.76MB noisy JPEG → **97KB** with dimensions stepped to 1360×1020.

**DPI, correctly** — libvips savers ignore resolution metadata and copy source EXIF verbatim, so `engine/dpi.ts` patches containers directly: EXIF APP1 rationals and JFIF density for JPEG, `pHYs` insert/replace (with CRC) for PNG. 11 unit tests cover the byte layouts. Verified round trip: write 300 → read 300.

**Secondary assets** — tools can declare an `asset` (e.g. the watermark logo); the workspace renders a picker, the session store holds it, and the runner attaches it as a second job input.

**Result previews** — text/JSON results (EXIF and DPI reports) render inline with `[ view ]`, so metadata is readable without downloading.

**Catalog growth** — 7 compress-to-X pages (20KB → 2MB), Reddit PFP compressor, 5 social resizers (Facebook, X, LinkedIn, TikTok, 4×6 print), 16 fixed-size resizers, circle/passport/2×2 crop pages, EXIF viewer/editor/DPI checker/converter, 4 adjustment pages, 5 effect pages, 3 watermark/merge pages.

**Verification (headless Chrome, real files)**
- `scripts/e2e-probe-phase2.html`, 10 acceptance tests: exact-size compression, 4×6 passport sheet at 1200×1800, circle alpha at the corner (0) and centre (255), true grayscale pixels, EXIF artist write→read, DPI write→read, split ZIP, 736×160 merge grid, rounded-corner transparency, watermark dimensions.
- Phase 1 probes re-run after the phase: all 8 engine tests, the 100-file batch (100/100 in **407ms**, 4MB heap) and both cancel paths still pass.

**Bugs found and fixed by these tests**: alpha channel dropped when the source already had transparency (bandjoin appended a 5th band), `xres`/`yres` removed from libvips savers (replaced with the DPI byte patcher), `image.get`/`image.set` absent at runtime in wasm-vips (use extension-based format detection and `setDouble`/`setString`), and a probe race that masked whether the print-sheet toggle reached the engine.

**Still `planned` (28 tools)**: the AI suite (Phase 6), the GIF catalog beyond the maker (Phase 3), and the remaining video/audio tools (Phases 4–5).

### Phase 3 — GIF catalog — **delivered 2026-10-14**

The GIF side is now the deepest part of the catalog: **25 GIF tools live** (was 1), bringing the total to **65 live tools across 149 static pages**.

**Frame pipeline** — the gif worker was rewritten around a shared animation model: decode with `ImageDecoder` (disposal-aware, native, worker-capable — decoding frame-by-frame until exhaustion rather than trusting `frameCount`), transform per frame on `OffscreenCanvas`, re-encode with gifenc (global palette by default, per-frame palettes on request).

**Ops (16)** — `images-to-gif`, `compress` (palette → dimensions → frame-dropping ladder), `resize`, `crop`, `rotate`, `reverse`, `speed`, `trim`, `merge`, `text`, `blur` (gaussian/pixelate/cover), `extract-frames`, `sprite-sheet`, `sprite-to-gif`, `typing-text` (generator), `discord-sticker`.

**Pure timing logic** (`workers/gif-timing.ts`, 16 unit tests) — delay clamping, total duration, frame-window trimming, speed retiming, frame skipping, and the size-reduction ladder. Verified end-to-end: 2× speed turned 100ms frames into 50ms, trimming 0–0.3s kept frames 1-3 of 5.

**ffmpeg GIF ops (2)** — `to-gif` (video/animated WebP/APNG → GIF with the two-pass palettegen/paletteuse recipe, trim, FPS and width control) and `from-gif` (GIF → MP4/WebP/APNG).

**Generators** — tools can now declare `generator: true` and run with no input files at all (the typing-text GIF maker). The workspace swaps the files tab for settings and tells the user no input is needed.

**Catalog** — GIF maker, compressor + 5 compress-to-X pages (256KB→10MB), resizer with emote presets, cropper, rotator, reverser, speed changer, trimmer, merger, text adder, blur, frame extractor, sprite sheet both ways, typing-text maker, Discord sticker, video/WebP/APNG→GIF, GIF→MP4/WebP/APNG. Three tools stay `planned` (Live Photo pair, 3D spinner).

**Verification (headless Chrome, real files)** — `scripts/e2e-probe-phase3.html`, 20 acceptance tests, all passing: maker (5 frames), compression ladder hitting a 30KB target, preset resize to 128×128, 1:1 crop of a 300×120 GIF → 120×120, rotate, reverse, speed/trim notes, frame extraction (ZIP `PK` magic + first-frame PNG), sprite sheet `1000×200` and its reverse (`5×1 grid → 5 frames`), typing-text generator (`4 frames · 120ms per character`), Discord sticker `320×320`, text adder, pixelate blur, two-clip merge (`2 clips · 8 frames`), video→GIF, and GIF→MP4 (`ftyp isom`), GIF→WebP (`RIFF…WEBP`) and GIF→APNG (PNG signature). Phase 1 and Phase 2 probes re-run unchanged: no regressions.

**Bug found and fixed**: an early "no files queued" guard silently shadowed the new generator path — caught by the typing-text test.

**Still `planned` (28 tools)**: the AI suite (Phase 6), Live Photo pairing, and the remaining video/audio catalog (Phases 4–5).

### Phase 4 — Video catalog — **delivered 2026-10-14**

**14 video tools live** (was 2), bringing the project to **77 live tools across 152 static pages**.

**Eleven new ffmpeg ops** — `compress` (CRF bisection then a resolution ladder: 1080p → 720p → 480p), `crop`, `resize` (contain/cover/stretch via `force_original_aspect_ratio`), `rotate`/mirror, `speed` (setpts + an atempo chain on audio), `volume` (gain, EBU loudnorm, mute), `watermark`, `merge` (normalise to 1280×720@30 + concat filter), `thumbnails` (single frame / interval ZIP / contact sheet), `to-audio` (MP3, WAV, M4A, Opus) and `subtitles` — plus video→animated WebP.

**No font dependencies.** The wasm core ships no fonts, so text watermarks and burned-in subtitles are **rendered to transparent PNGs on a canvas** and composited with `overlay` — which also gives full styling control (shadows, backing bands, wrapped text) and needs no downloads. Subtitle cues come from a pure SRT/VTT parser (`engines/srt.ts`, 12 unit tests) and are shown only inside their own `enable='between(t,…)'` window, up to 200 cues per file.

**Graceful degradation for real-world media** — sources without audio hit a video-only fallback graph with a clear console note; extracting audio from a silent clip reports "this video has no audio track to extract" instead of an ffmpeg error dump.

**Honest size limits** — files over 1.2GB are refused with an explanation (WebAssembly's 32-bit memory space, input + output both resident); over 300MB gets a warning note. The WebCodecs/OPFS streaming path in the plan is **deliberately deferred**: `-c copy` trim already gives instant lossless cuts for large files, and a streaming re-encode path is a large, risky build for a narrow case — it belongs in a dedicated performance pass rather than a blocker here.

**Verification (headless Chrome, real clips)** — `scripts/e2e-probe-phase4.html`, 17 acceptance tests, all passing: MP4 conversion (`ftyp isom`), lossless trim, target-size compression (`target met at CRF 26`), crop/resize/rotate verified by **extracting a frame from the output with our own tool** (120×120, 240×240, 120×160), 2× speed with and without audio, volume gain, text watermark (`watermark rendered 68×58`), two burned-in subtitle cues, a two-clip merge (`1280×720`), single/interval/contact-sheet thumbnails, MP3 extraction (`ID3` magic) plus the silent-clip message, and animated WebP (`RIFF…WEBP`). Phase 1 and Phase 3 probes re-run unchanged: no regressions.

**Bugs found and fixed by these tests**: audio filter pads crash on silent sources (added the video-only fallback), `-c:v copy` from VP8 into MP4 is invalid (volume/mute re-encode instead), looped PNG inputs make the filtergraph never end (`overlay=…:shortest=1`, since `-shortest` alone is a muxer option), and `writeFile` transfers buffers so merge's second write detached them.

**Still `planned` (19 tools)**: the AI suite (7, Phase 6) and the remaining audio catalog (9, Phase 5), plus Live Photo pairing and the 3D GIF spinner.

### Phase 5 — Audio catalog — **delivered 2026-10-14**

**10 audio tools live** (was 2), bringing the project to **86 live tools across 153 static pages**. Only the AI transcription tool remains `planned` in this category.

**Eight new ops in the audio engine** — `merge` (crossfade + auto-resample to the first file's rate + optional normalise), `normalize` (measured peak → target dBFS with soft limiting), `boost` (gain with clipping protection), `speed-pitch` (tape-style resampling), `reverse`, `silence-remove` (50ms window analysis with 120ms padding at each cut), `waveform` (min/max envelope rendered to PNG) and `id3` (pure byte manipulation, no decode).

**ID3v2.4 writer** (`engines/id3.ts`, 9 unit tests) — builds UTF-8 text frames with syncsafe sizes, replaces an existing tag rather than stacking, and strips on request. Audio bytes are copied unchanged, so tagging is lossless.

**Ringtone maker** runs on ffmpeg (`afade` in/out + AAC for iPhone's M4A, MP3 for Android) — the one audio tool where the ffmpeg encoder is the right tool rather than the Web Audio pipeline.

**Verification (headless Chrome, real analysis)** — `scripts/e2e-probe-phase5.html`, 11 acceptance tests, all passing with numeric proof: MP3 conversion (`ff fb b4 c4`, 2.04s), trim to 0.53s, **crossfade arithmetic exact** (1s + 1s − 300ms = 1.73s), normalise measured by decoding the output (`peak 0.10 → 0.69`), boost `−14.0 → −8.4dBFS`, speed `2.0s → 1.03s`, **reverse sample-exact** (`reversedFirst === sourceLast`), silence removal (`removed 1.3s` → 1.73s remains), waveform `960×240` PNG, ID3 write (`ID3` header + `TIT2` + title text, +55 bytes) and strip (`ff fb b4`), and an M4A ringtone. Phase 1 and Phase 4 probes re-run unchanged: no regressions.

**Scope note**: the speed/pitch tool is deliberately **tape-style** (pitch moves with speed) rather than a phase-vocoder time-stretch — the control and the FAQ say so, instead of pretending pitch preservation exists.

**Still `planned` (19 tools)**: the AI suite (7, Phase 6) and the remaining audio catalog (9, Phase 5), plus Live Photo pairing and the 3D GIF spinner.

### Phase 6 — Local AI — **delivered 2026-10-14**

**8 AI tools live**, taking the project to **94 live tools · 153 pages · 3 planned** (only Live Photo pairing and the 3D GIF spinner remain).

**On-device inference** (`workers/ai.worker.ts` + `engines/ai.ts`) — transformers.js 4.3.1 with WebGPU when the browser exposes an adapter and WASM otherwise; ONNX runtime wasm binaries are self-hosted (`public/models/onnx/`, all three build variants so the runtime can pick), models download once from the Hugging Face hub and are cached by the browser. Every download reports progress into the ASCII console.

**Ops** — `remove-background` (MODNet: subject mask → alpha composite, optional background replace), `upscale` (Swin2SR 2×/4×, output dimensions reported), `unpixelate` (super-resolve then scale back, so dimensions are unchanged), `inpaint` (object/watermark removal), `blur-people` (YOLOS-tiny person detection), `transcribe` (Whisper tiny/base/small → TXT/SRT/VTT with timestamps).

**Mask painting UI** (`components/MaskEditor.tsx`) — inpainting tools get a real canvas: paint over an object, the mask exports as a PNG into the session store, and the process button stays disabled until a mask exists. Masked regions are rebuilt with a distance-ordered fill plus localised smoothing (no model download, instant, excellent for text/watermarks/thin objects) — the FAQ says exactly where a diffusion model would beat it.

**An honest pivot worth recording**: the plan called for face blur via MediaPipe. Google's model bucket returns 404 for every documented path today, and no face-detector weights are reachable offline in this build — so rather than ship a fake "AI" detector I shipped **`blur-people`**: YOLOS-tiny detects people and the whole body is covered, which is stronger privacy than face-only masking. The tool's FAQ explains the substitution.

**Verification (headless Chrome, real models, WASM inference)** — `scripts/e2e-probe-phase6.html`, 6 acceptance tests, all passing:
- **Background removal**: 65% of pixels transparent, corner alpha **0**, subject centre opaque — MODNet genuinely segmented the test silhouette.
- **Upscale**: 160×120 → **320×240** (exactly 2×).
- **Unpixelate**: output dimensions unchanged at 160×120.
- **Inpaint**: the mask was painted through real pointer events on the canvas ("mask ready — press process"), **1,154 pixels repaired**, painted region changed, untouched region byte-identical.
- **Blur people**: detector ran and honestly reported no people in a synthetic scene.
- **Whisper transcription**: a real macOS-`say` speech fixture transcribed **exactly** — *"Hello World, this is a test of local transcription running entirely in the browser."*

Phase 2 and Phase 4 probes re-ran unchanged (the asset-gating change needed one probe fix, not an app fix): no regressions.

**Known limits, stated plainly**: models download from the Hugging Face hub (so the first run needs network, and model weights are not yet self-hosted); WASM inference is seconds per image versus sub-second on WebGPU; the inpainting fill is classical rather than diffusion-based.

**Remaining planned (3)**: Live Photo pairing, GIF → Live Photo, and the 3D GIF spinner.

### Phase 7 — Chain console + scenes — **delivered 2026-10-14**

**The console** (`/console`, 154 pages now) — a real pipeline builder:

- **Chain strip** — add steps from a searchable list of every chainable tool, reorder with `[↑]`/`[↓]`, remove with `[x]`, and tune the selected step in a side column (the same `ControlField` renderer the tool pages use, now extracted to `components/ControlField.tsx`).
- **Batch execution** (`session/pipeline.ts`) — files run in lanes; each file's steps run sequentially with the output of step N feeding step N+1 **in memory**, so a batch is read from disk once and only the final step re-encodes. Two buffers per lane whatever the batch size, per-file progress in the console, cancel via `abortAllEngines`, and a hard guard when an intermediate exceeds 400MB.
- **Shareable workflows** (`session/pipeline-codec.ts`, 9 unit tests) — the whole chain encodes to base64url JSON in `?p=…`; `[ copy link ]` writes it to the clipboard *and* to the console, and editing a shared chain detaches it from the URL.
- **Presets** — web delivery, social square, privacy strip, email ready.
- **Scenes are live** — each of the 7 scenes opens in the console as an editable chain via that same link format; the scenes pages read `[ ready ]` instead of `[ soon ]`.

**Verification (headless Chrome)** — `scripts/e2e-probe-phase7.html`, 6 acceptance tests, all passing:
- **Chain**: a 3-step pipeline (webp → resize 512 → compress ≤50KB) over 3 files produced 3 outputs at **512×512**, **19/18/15KB — all under the 50KB target**, in 0.3s.
- **Preset**, **scene → console** (3 steps each), **reorder** (step 1 changed identity after moving), **remove** (3 → 2 steps).
- **Round trip**: the copied link re-opened the *edited* 2-step chain exactly — the app's own encoder and decoder in a full loop.

Phase 2 and Phase 6 probes re-ran unchanged: no regressions from the `ControlField` extraction.

**Bug found and fixed by these tests**: moving or removing a step in a *shared* chain mutated the store while the view kept rendering the URL payload — the console now routes every edit through the detaching helper.

### Phase 8 — Hardening & launch — **delivered 2026-10-14**

**PWA / offline** — `vite-plugin-pwa` with a deliberate strategy (all configured in `vite.config.ts`):
- the **app shell** (154 HTML pages, JS, CSS, fonts, icons) is precached, so the toolbox boots with no network at all;
- **navigations are NetworkFirst** — online you always get the prerendered page from the host, offline the last visit or the shell is served from cache;
- **engines and models are never precached** (they are hundreds of megabytes) — they use CacheFirst on first use, so "works offline after first load" is literal;
- a web manifest (standalone, ASCII icon) and an `[+] app shell cached — OmniMediaHub now works offline` console line complete the install story.

**Headers & deploy hardening** — `public/_headers` now carries the full policy: COOP/COEP (SharedArrayBuffer → multithreaded WASM), `nosniff`, a restrictive `Permissions-Policy`, immutable caching for `/assets`, `/fonts`, `/wasm`, `/ffmpeg`, `/models`, `no-cache` for `sw.js`, and `must-revalidate` for HTML. The README gained a deploy section (Cloudflare Pages: build `npm run build`, output `dist`).

**Social card** — an on-brand 1200×630 OG image (`public/og.png`, generated from `scripts/og-template.html` by headless Chrome) wired into every page's head with `og:image`, dimensions, alt text and `twitter:card: summary_large_image`.

**Offline verification** (`scripts/e2e-offline.mjs`) — service-worker APIs are unreliable inside the probe iframes, so this script drives the app at the top level over CDP: it waits for the SW + precache, converts a file online (warming the engine), **cuts the network**, then navigates to a *fresh* route and converts again. Result: the page rendered and the conversion produced a real JPEG **with no network**, and `/wasm/vips.wasm` was confirmed in the `omh-engines` runtime cache.

**Launch acceptance** — every phase re-run against the built site, **81 checks across seven browser probes plus the offline script, all green**:

| Phase | Checks | Coverage |
|---|---|---|
| 1 — engines | 8 | vips (JPG/WebP/PNG/AVIF), GIF maker, ffmpeg trim, MP3 |
| 2 — image catalog | 10 | target-size search (1.76MB → 97KB), 4×6 passport sheet, circle alpha, grayscale, EXIF write→read, DPI 300→300, split ZIP, merge grid, rounded corners, watermark |
| 3 — GIF catalog | 21 | maker, size ladder, presets resize/crop/rotate, reverse, speed, trim, extraction, sprite sheets both ways, typing-text generator, Discord sticker, video→GIF, GIF→MP4/WebP/APNG |
| 4 — video | 18 | conversion, lossless trim, target-size CRF search, crop/resize/rotate (verified by extracting frames), speed with and without audio, volume, watermark, subtitles, merge, three thumbnail modes, MP3 extraction, animated WebP |
| 5 — audio | 12 | MP3 conversion, trim, crossfade arithmetic (1.73s), peak normalisation, gain, speed, sample-exact reverse, silence removal, waveform PNG, ID3 write/strip, M4A ringtone |
| 6 — local AI | 6 | MODNet cutout (65% transparent, corner alpha 0), Swin2SR 2×, unpixelate at original size, paint-mask inpaint (1,154 px repaired), YOLOS person detection, Whisper transcript word-perfect |
| 7 — console | 6 | 3×3 chain (512×512, all under 50KB), presets, scene→console, reorder, remove, copy-link round trip |
| 8 — offline | — | shell precache (engines excluded), online warm-up, network cut, fresh route rendered, conversion succeeded offline, zero errors |

Plus `npm run lint` clean and **77 unit tests** passing (registry/engine bindings, SEO route coverage, compression search maths, GIF timing, subtitle parsing, DPI byte patching, ID3 layout, pipeline codec).

**Post-launch fix — scroll position on navigation.** Reported: clicking `view all →` in the home page's "Every tool, one place" section landed mid-page on `/tools` (offset ≈1,400px). Cause: SPA navigation never touches the window scroll offset and the app had no scroll handling at all — every mid-page link had the same bug. Fix: a `ScrollToTop` component (`src/app/layout/ScrollToTop.tsx`, mounted in the shell) resets to the top on PUSH/REPLACE navigations, leaves POP (back/forward) to the browser's native history restoration, and scrolls hash targets into view instead. Verified by `scripts/e2e-probe-scroll.html`: `view all →` clicked at offset 1,422 lands at 0 on `/tools`; a tool-card link lands at 0; `history.back()` restores 600 → 600 (POP untouched). Phase 7 regression re-run on the rebuilt site: **ALL PASS (6 checks)**.

A follow-up added smooth in-page scrolling — applied via `scroll-behavior` under `prefers-reduced-motion: no-preference`, so reduced-motion users keep instant jumps, and route changes still snap by design — plus a floating `[ ↑ top ]` control (`src/app/layout/BackToTop.tsx`) that appears once the page is scrolled past the first viewport. The scroll probe now runs **9 checks** (control hidden at top, appears when scrolled, smooth-scrolls back to 0, hides again, plus the original four and a no-fatal guard) — all green, with the Phase 7 regression re-run again: **ALL PASS (6 checks)**.

**Deliberately deferred: the `/zh` mirror.** The plan listed it for this phase, but a real Chinese locale is a *content* project (94 tool descriptions, FAQs, how-tos), not a code task — and a half-translated tool catalog would be worse than an honest English-only launch. The seams are in place for it (registry-driven pages, one metadata source, a locale-agnostic design), and the work is scoped: a `LocaleProvider` + `/zh/*` route mirror + hreflang alternates + translated copy.

**Launch state: 94 live tools · 154 prerendered pages · 7 scenes · 8 engines · PWA-installable · offline-capable · zero server-side processing.**

**Repository published.** `github.com/Qwabs/omnimediahub` — MIT licensed (`LICENSE`), history starting at the verified root commit `f7ffd4c`, tag `v0.1.0`, 129 files / 1.55 MB (generated engine assets stay out of git via `.gitignore`). CI workflow (`.github/workflows/ci.yml`): lint → tests → full build on every push/PR, pinned to `ubuntu-24.04`. The first Actions attempt was blocked by a GitHub account billing lock; once cleared, a re-run went **green** — `npm ci` → lint → 77 tests → full build in 35 s (run `38711469253`). Every push to `main` now verifies itself.
