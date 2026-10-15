import { Link } from 'react-router'
import { Badge } from '@/components/Badge'
import { ButtonLink } from '@/components/Button'
import { ChartTile } from '@/components/ChartTile'
import { Faq } from '@/components/Faq'
import { HairlineCell, HairlineGrid } from '@/components/HairlineGrid'
import { HeroTuiMockup } from '@/components/HeroTuiMockup'
import { Section, SectionHeader } from '@/components/Section'
import { findRouteMeta } from '@/lib/seo'
import { useSeo } from '@/lib/use-seo'
import { CATEGORIES_WITH_TOOLS, TOOL_COUNT } from '@/tools/registry'

/* ------------------------------------------------------------------ */
/* content                                                             */
/* ------------------------------------------------------------------ */

const WHY_ROWS = [
  ['Instant', 'No upload, no queue — processing starts the moment files hit the drop zone.'],
  ['Private', 'Files never leave your device. Open your network tab and watch: zero traffic.'],
  ['Unlimited', 'Thousands of files per batch. No 10-file caps, no per-file pricing.'],
  ['No size limits', 'A 100MB clip or a 60MP photo is fine. No 5MB gate, no compression-on-upload.'],
  ['Offline', 'After the first load the app works with no internet at all. AI models cache on demand.'],
  ['Chain tools', 'compress → convert → crop → resize in one pass, without re-uploading anything.'],
  ['Free forever', 'No accounts, no watermarks, no credits, no paywalls. Just tools.'],
] as const

const TRADITIONAL_ROWS = [
  'Slow — upload, wait, download',
  'Files uploaded to a server',
  '10–20 files per batch',
  '5–10MB file caps',
  'Requires internet',
  'One tool per upload',
  'Paid or freemium',
] as const

const STEPS = [
  ['Select files', 'Drag & drop images, GIFs, video or audio — no upload wait.'],
  ['Process locally', 'WebAssembly engines run in your browser. Data never leaves the device.'],
  ['Chain tools', 'Apply several tools in sequence without re-uploading anything.'],
  ['Instant save', 'Download results individually or everything as one ZIP. No server limits.'],
] as const

const USE_CASES = [
  ['E-commerce sellers', 'Batch compress, convert and crop product photos for Shopify and Amazon.'],
  ['Developers', 'Export iOS, Android and web icon sets from a single source image.'],
  ['Regular users', 'Convert iPhone HEIC photos in bulk and share them anywhere.'],
  ['Creators', 'Make, compress and optimize GIFs and images for social posts.'],
  ['Podcasters', 'Normalize, trim and convert episodes without uploading a single file.'],
  ['Video editors', 'Vertical crops, fast trims and compressed exports for Reels and Shorts.'],
] as const

const HOME_FAQ = [
  {
    q: 'Are my files uploaded to a server?',
    a: 'Never. Every tool runs in your browser using WebAssembly and modern web APIs. Your files are read from disk, processed on your device and written back — there is no server-side processing and no image data on our servers.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes. No accounts, no credits, no watermarks, no premium tier. Because processing happens on your hardware, our costs stay near zero — we pass that on.',
  },
  {
    q: 'How many files can I process at once?',
    a: 'Thousands. Files are processed with a worker pool sized to your CPU. Practically, batches of 200–500 images on a laptop feel instant; huge video files are handled one at a time with streaming storage.',
  },
  {
    q: 'Does it work offline?',
    a: 'After the first visit the app shell is cached and works without internet. AI models download once on demand, then run offline too.',
  },
  {
    q: 'Can I chain multiple tools together?',
    a: 'Yes — that is the core of OmniMediaHub. Build a pipeline like compress → convert → resize and apply it to an entire batch, without ever re-uploading or re-encoding twice by hand.',
  },
  {
    q: 'What about the AI tools — do they upload my photos?',
    a: 'No. Models like background removal and upscaling download once to your device and then run locally, accelerated by WebGPU where available.',
  },
] as const

const PLOT_UPLOADS = [
  '  ·       ·       ·       ·  ',
  ' ·   ·     ·   ·     ·   ·   ',
  '·  ·  ·  ·  ·  ·  ·  ·  ·   ',
  '─────────────────────────────',
]

const PLOT_TOOLS = [
  '                          ·  ',
  '                      ·      ',
  '              ·   ·          ',
  '      ·   ·                  ',
  '·  ·                         ',
  '─────────────────────────────',
]

const PLOT_BATCH = [
  '·                            ',
  '·   ·   ·   ·   ·   ·   ·    ',
  '·  ·   ·   ·   ·   ·   ·   · ',
  '─────────────────────────────',
]

/* ------------------------------------------------------------------ */
/* page                                                               */
/* ------------------------------------------------------------------ */

export function HomePage() {
  useSeo(findRouteMeta('/'))

  return (
    <>
      {/* hero text block */}
      <div className="mx-auto max-w-page px-6 pt-20 pb-16">
        <p className="flex flex-wrap items-center gap-3 text-caption-md text-body">
          <Badge>NEW</Badge>
          images · GIF · video · audio — one private toolbox
        </p>
        <h1 className="mt-8 max-w-[24ch] text-[28px] font-bold leading-normal text-ink sm:text-display-xl">
          Your media never leaves your device.
        </h1>
        <p className="mt-6 max-w-[76ch] text-body-md text-body">
          OmniMediaHub is a privacy-first, browser-based media toolbox. Convert, compress, crop,
          resize, edit and generate — images, GIFs, video and audio, in unlimited batches, with
          zero uploads.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/tools">Browse {TOOL_COUNT}+ tools</ButtonLink>
          <a className="btn btn-secondary" href="#how-it-works">
            How it works
          </a>
        </div>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-caption-md text-mute">
          <span>[+] 0 uploads</span>
          <span>[+] works offline</span>
          <span>[+] free forever</span>
          <span>[+] no sign-up</span>
        </p>
      </div>

      {/* the single dark surface: product console */}
      <HeroTuiMockup />

      <div className="mx-auto max-w-page px-6 pb-section">
        {/* why */}
        <Section first>
          <SectionHeader label="Why OmniMediaHub?" aside="[ traditional tools vs us ]" />
          <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-2">
            <div className="bg-canvas p-4">
              <h3 className="text-body-strong text-mute">Traditional tools</h3>
              <ul className="mt-3">
                {TRADITIONAL_ROWS.map((row) => (
                  <li key={row} className="flex gap-3 py-1 text-caption-md leading-6 text-mute">
                    <span aria-hidden="true">[−]</span>
                    <span>{row}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-canvas p-4">
              <h3 className="text-body-strong text-ink">OmniMediaHub</h3>
              <ul className="mt-3">
                {WHY_ROWS.map(([label, copy]) => (
                  <li key={label} className="flex gap-3 py-1 text-caption-md leading-6 text-body">
                    <span aria-hidden="true" className="text-ink">
                      [+]
                    </span>
                    <span>
                      <strong className="text-ink">{label}</strong> — {copy}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* categories */}
        <Section>
          <SectionHeader
            label="Every tool, one place"
            aside={<Link to="/tools" className="underline">view all →</Link>}
          />
          <HairlineGrid className="sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES_WITH_TOOLS.map((c) => (
              <Link
                key={c.id}
                to={`/tools/${c.id}`}
                className="row-hover border-t border-l border-hairline bg-canvas p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-body-strong text-ink">{c.title}</h3>
                  <span className="text-caption-md tabular-nums text-mute">[{c.tools.length}]</span>
                </div>
                <p className="mt-2 text-caption-md leading-6 text-body">{c.blurb}</p>
              </Link>
            ))}
          </HairlineGrid>
        </Section>

        {/* how it works */}
        <Section>
          <SectionHeader label="How it works" aside="[ 4 steps ]" />
          <ul id="how-it-works" className="grid gap-px border border-hairline bg-hairline md:grid-cols-2">
            {STEPS.map(([title, copy], i) => (
              <li key={title} className="bg-canvas p-4">
                <span className="text-caption-md text-mute">[{i + 1}]</span>
                <h3 className="mt-2 text-body-strong text-ink">{title}</h3>
                <p className="mt-1 text-caption-md leading-6 text-body">{copy}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* stats */}
        <Section>
          <SectionHeader label="By the numbers" aside="[ honest ones ]" />
          <HairlineGrid className="sm:grid-cols-2 lg:grid-cols-3">
            <HairlineCell>
              <ChartTile fig="1" caption="0 server uploads, ever" plot={PLOT_UPLOADS} />
            </HairlineCell>
            <HairlineCell>
              <ChartTile fig="2" caption={`${TOOL_COUNT}+ free tools and growing`} plot={PLOT_TOOLS} />
            </HairlineCell>
            <HairlineCell>
              <ChartTile fig="3" caption="unlimited batch size" plot={PLOT_BATCH} />
            </HairlineCell>
          </HairlineGrid>
        </Section>

        {/* use cases */}
        <Section>
          <SectionHeader label="Typical use cases" />
          <ul className="grid gap-px border border-hairline bg-hairline md:grid-cols-2">
            {USE_CASES.map(([who, what]) => (
              <li key={who} className="bg-canvas p-4 text-caption-md leading-6 text-body">
                <strong className="text-ink">{who}</strong> — {what}
              </li>
            ))}
          </ul>
        </Section>

        {/* faq */}
        <Section>
          <SectionHeader label="FAQ" />
          <Faq items={HOME_FAQ.map(({ q, a }) => ({ q, a }))} />
        </Section>

        {/* closing */}
        <Section>
          <div className="border border-hairline p-8">
            <h2 className="text-heading-md text-ink">Ready when you are.</h2>
            <p className="mt-3 max-w-prose text-body-md text-body">
              No account, no upload, no waiting. Drop your files and watch them process at native
              speed.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink to="/tools">Browse tools</ButtonLink>
              <ButtonLink to="/scenes" variant="secondary">
                Guided workflows
              </ButtonLink>
            </div>
          </div>
        </Section>
      </div>
    </>
  )
}
