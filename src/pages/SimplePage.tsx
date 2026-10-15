import { ButtonLink } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { Section, SectionHeader } from '@/components/Section'
import { findRouteMeta } from '@/lib/seo'
import { useSeo } from '@/lib/use-seo'

type Kind = 'about' | 'privacy' | 'terms' | 'contact'

const CONTENT: Record<
  Kind,
  {
    path: string
    title: string
    lead: string
    sections: { heading: string; rows: [string, string][] }[]
  }
> = {
  about: {
    path: '/about',
    title: 'About OmniMediaHub',
    lead: 'A media toolbox that refuses to touch your files. Everything runs where your data already lives — on your device.',
    sections: [
      {
        heading: 'The idea',
        rows: [
          ['Privacy by architecture', 'Not a policy, not a promise — an architecture. There is no upload endpoint to abuse, because there is no server processing at all.'],
          ['Unlimited by design', 'Server tools meter batches and file sizes because bandwidth costs money. Local processing costs nothing, so there are no caps.'],
          ['Free forever', 'No accounts, no credits, no watermarks. The tools run on your hardware, so the economics work at zero price.'],
        ],
      },
      {
        heading: 'Under the hood',
        rows: [
          ['WebAssembly engines', 'Image processing runs on libvips compiled to WebAssembly; video runs on FFmpeg in WASM; audio uses the browser\u2019s native audio pipeline.'],
          ['Worker pools', 'Jobs run in a pool of web workers sized to your CPU, so batches process in parallel and the interface never blocks.'],
          ['Local AI', 'Models (background removal, upscaling, transcription) download once and then run on your device with WebGPU acceleration.'],
          ['Offline first', 'The app shell is cached after the first visit. After that, no internet connection is required.'],
        ],
      },
    ],
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy',
    lead: 'Short version: your media never leaves your device. There is no server-side processing, no file storage, and no account.',
    sections: [
      {
        heading: 'The model',
        rows: [
          ['No uploads', 'Files are read from your disk, processed in browser memory, and written back as downloads. No image, video or audio data is transmitted anywhere.'],
          ['No accounts', 'There is nothing to sign up for, so there is no profile, no email, and no password to lose.'],
          ['No file tracking', 'We do not log file names, counts, sizes or outcomes. There is no backend to log them to.'],
        ],
      },
      {
        heading: 'Verify it yourself',
        rows: [
          ['Network tab', 'Open your browser developer tools, go to the Network tab, and process a batch. You will see zero requests while files are being processed.'],
          ['Offline test', 'Load the app, then disconnect from the internet and process files. Everything keeps working.'],
        ],
      },
      {
        heading: 'The fine print',
        rows: [
          ['Local storage', 'Settings and (optionally) your session queue live in IndexedDB on your device. Clearing site data removes them.'],
          ['Model downloads', 'AI features download model weights once (e.g. ~45MB for background removal) and cache them. This is a download, never an upload.'],
          ['No third-party CDNs', 'Fonts and libraries are served from this site, not from external networks. Nothing embeds trackers.'],
        ],
      },
    ],
  },
  terms: {
    path: '/terms',
    title: 'Terms of service',
    lead: 'Plain-language terms for a tool that runs entirely on your device.',
    sections: [
      {
        heading: 'Using OmniMediaHub',
        rows: [
          ['Free use', 'You may use OmniMediaHub for personal and commercial work, at no cost, without attribution.'],
          ['Your content', 'You keep every right to the files you process. We never receive them, so we cannot claim anything over them.'],
          ['Acceptable use', 'Do not use the tools to break the law — for example removing watermarks you have no right to remove or creating illegal material.'],
        ],
      },
      {
        heading: 'No warranty',
        rows: [
          ['As-is service', 'The tools are provided as-is, without warranty of any kind. Always keep backups of important files.'],
          ['Availability', 'Because processing is local, the service depends on your device and browser. We may change or remove features at any time.'],
        ],
      },
    ],
  },
  contact: {
    path: '/contact',
    title: 'Contact',
    lead: 'Questions, bug reports, feature requests — we read everything.',
    sections: [
      {
        heading: 'Reach us',
        rows: [
          ['Email', 'hello@omnimediahub.com — for anything, including privacy questions.'],
          ['Bug reports', 'Include your browser, the tool, and the file type. Do not attach the file itself; we can usually reproduce from a description.'],
        ],
      },
    ],
  },
}

export function SimplePage({ kind }: { kind: Kind }) {
  const content = CONTENT[kind]
  useSeo(findRouteMeta(content.path))

  return (
    <div className="mx-auto max-w-page px-6 pb-section">
      <PageHeader
        title={content.title}
        lead={content.lead}
        breadcrumbs={[
          { label: 'home', to: '/' },
          { label: content.path.slice(1) },
        ]}
      />

      {content.sections.map((section, i) => (
        <Section key={section.heading} first={i === 0}>
          <SectionHeader label={section.heading} />
          <ul className="border-t border-hairline">
            {section.rows.map(([label, copy]) => (
              <li key={label} className="hairline-b flex flex-col gap-1 py-3 md:flex-row md:gap-6">
                <span className="shrink-0 text-body-strong text-ink md:w-56">
                  <span aria-hidden="true" className="pr-3 text-mute">
                    [+]
                  </span>
                  {label}
                </span>
                <span className="max-w-prose text-body-md text-body">{copy}</span>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      {kind === 'privacy' ? (
        <Section>
          <SectionHeader label="Verify" />
          <div className="border border-hairline p-6">
            <p className="max-w-prose text-body-md text-body">
              The strongest privacy claim is one you can check. Open developer tools → Network,
              process a batch of files, and watch the request log stay empty.
            </p>
            <div className="mt-4">
              <ButtonLink to="/tools" variant="secondary">
                Try it now
              </ButtonLink>
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  )
}
