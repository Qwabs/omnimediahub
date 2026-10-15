import { AsciiWordmark } from '@/design/ascii'

/**
 * The home page's single dark surface: a faux console that mocks up the
 * product. Text-only, always shows a chained command line — never imagery.
 * Log rows are flex-based so they reflow cleanly on narrow screens.
 */
export function HeroTuiMockup() {
  return (
    <section aria-label="OmniMediaHub console preview" className="bg-surface-dark text-on-dark">
      <div className="mx-auto flex max-w-page flex-col items-center px-6 py-16">
        <AsciiWordmark className="text-on-dark" pixelSize={10} />
        <p className="mt-6 text-caption-md text-on-dark-mute">privacy-first media toolbox</p>

        <div className="mt-12 w-full max-w-2xl">
          <div className="console-row flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-md">
            <span aria-hidden="true" className="text-on-dark-mute">
              │
            </span>
            <span className="text-on-dark-mute">chain</span>
            <span className="text-accent">heic → jpg</span>
            <span aria-hidden="true" className="text-on-dark-mute">
              →
            </span>
            <span className="text-accent">[compress 100kb]</span>
            <span aria-hidden="true" className="text-on-dark-mute">
              →
            </span>
            <span className="text-accent">resize 1080×1080</span>
          </div>

          <div className="mt-8 space-y-2 text-caption-md">
            <div className="flex items-baseline gap-3">
              <span aria-hidden="true" className="shrink-0 text-success">
                [✓]
              </span>
              <span className="text-on-dark">128 files · heic → jpg</span>
              <span className="ml-auto shrink-0 pl-4 tabular-nums text-on-dark-mute">12.4s</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span aria-hidden="true" className="shrink-0 text-accent">
                [&gt;]
              </span>
              <span className="text-on-dark">image_042 · compress → 100kb</span>
              <span className="ml-auto shrink-0 pl-4 tabular-nums text-accent">
                [████████░░░░░░░░] 52%
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span aria-hidden="true" className="shrink-0 text-on-dark-mute">
                [ ]
              </span>
              <span className="text-on-dark-mute">image_043 · resize → 1080×1080</span>
              <span className="ml-auto shrink-0 pl-4 text-on-dark-mute">queued</span>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-caption-md text-ash">
            <span>tab switch tool</span>
            <span>⌘k search</span>
            <span>0 uploads · ever</span>
            <span>works offline</span>
          </div>
        </div>
      </div>
    </section>
  )
}
