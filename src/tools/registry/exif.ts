import type { ToolDef } from './types'

export const exifTools: ToolDef[] = [
  {
    slug: 'exif-viewer',
    category: 'exif',
    title: 'EXIF viewer',
    description:
      'Reveal hidden photo metadata instantly — GPS, camera settings, ISO, shutter speed, timestamps — plus print size at your DPI.',
    engine: 'exif',
    accepts: ['image/*'],
    produces: 'JSON report',
    controls: [
      { kind: 'toggle', id: 'parseGps', label: 'Parse GPS coordinates', default: true },
    ],
    howTo: [
      'Drop one or more photos.',
      'Process: tags are parsed on your device — nothing is uploaded.',
      'Read the summary in the console, and open the results tab for the full JSON report.',
    ],
    status: 'live',
    chainable: false,
    faq: [
      {
        q: 'What can metadata reveal about me?',
        a: 'Photos commonly carry GPS coordinates, camera serial numbers, timestamps and even editing software. The viewer shows exactly what is embedded so you can decide what to strip in the EXIF editor.',
      },
    ],
    related: ['exif-editor', 'dpi-checker'],
  },
  {
    slug: 'exif-editor',
    category: 'exif',
    title: 'EXIF editor',
    description:
      'Edit or strip photo metadata — set artist, copyright and software tags, remove GPS, or wipe everything. Locally, in batch.',
    engine: 'exif',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      { kind: 'toggle', id: 'stripAll', label: 'Strip ALL metadata (privacy)', default: false },
      { kind: 'toggle', id: 'stripGps', label: 'Remove GPS location only', default: false },
      { kind: 'text', id: 'artist', label: 'Artist / author', default: '', placeholder: 'Your name' },
      { kind: 'text', id: 'copyright', label: 'Copyright', default: '', placeholder: '© 2026 Your Name' },
      { kind: 'text', id: 'software', label: 'Software tag', default: '', placeholder: 'OmniMediaHub' },
    ],
    howTo: [
      'Drop the photos to clean up.',
      'Choose what to change: strip everything, remove GPS only, or set authorship tags.',
      'JPEG files are edited losslessly (image data is untouched); other formats are re-encoded when stripping everything.',
      'Process and download the cleaned files.',
    ],
    status: 'live',
    chainable: true,
    faq: [
      {
        q: 'Why strip EXIF data?',
        a: 'Photos carry GPS coordinates, device serial numbers and timestamps. If you share photos publicly, stripping metadata is one of the simplest privacy wins there is.',
      },
      {
        q: 'Does editing metadata re-compress my photo?',
        a: 'For JPEGs, no — tags are rewritten in place and the compressed image data is copied byte-for-byte. Non-JPEG files (PNG, WebP) only support full stripping, which re-encodes them.',
      },
    ],
    related: ['exif-viewer', 'dpi-converter'],
  },
  {
    slug: 'dpi-checker',
    category: 'exif',
    title: 'DPI checker',
    description:
      'Check any image’s DPI, pixel dimensions and print size at its own resolution and at 300 DPI — instantly, locally.',
    engine: 'exif',
    accepts: ['image/*'],
    produces: 'JSON report',
    controls: [],
    howTo: [
      'Drop one or more images.',
      'Process: the report lists pixel size, tagged DPI and the resulting print size.',
      'Use the DPI converter to change the resolution tag if needed.',
    ],
    status: 'live',
    chainable: false,
    related: ['dpi-converter', 'exif-viewer'],
  },
  {
    slug: 'dpi-converter',
    category: 'exif',
    title: 'DPI converter',
    description:
      'Change image DPI to 72, 150, 300 or any value for print and screen — in batch, without touching a single pixel.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      {
        kind: 'slider',
        id: 'dpi',
        label: 'DPI',
        min: 72,
        max: 600,
        step: 1,
        default: 300,
        hint: 'Pixels are not resampled — only the resolution tag changes, so print size follows automatically.',
      },
    ],
    chainable: true,
    status: 'live',
    faq: [
      {
        q: 'Does changing DPI change the image?',
        a: 'No. DPI is metadata: it tells a printer how large to print the pixels. Changing it from 72 to 300 keeps every pixel identical but makes the printed photo smaller and sharper.',
      },
    ],
    related: ['dpi-checker', 'resize/image-resizer'],
  },
]
