import type { ToolDef } from './types'

export const convertTools: ToolDef[] = [
  {
    slug: 'image-converter',
    category: 'convert',
    title: 'Bulk image converter',
    description:
      'Convert JPG, PNG, WebP, AVIF, HEIC, GIF, BMP and TIFF in bulk — locally in your browser. No upload, no queue, no limits.',
    engine: 'vips',
    accepts: ['image/*', '.heic', '.avif', '.webp'],
    produces: 'JPG, PNG, WebP, AVIF',
    controls: [
      {
        kind: 'select',
        id: 'format',
        label: 'Output format',
        options: [
          { value: 'jpg', label: 'JPG' },
          { value: 'png', label: 'PNG' },
          { value: 'webp', label: 'WebP' },
          { value: 'avif', label: 'AVIF' },
        ],
        default: 'webp',
      },
      { kind: 'slider', id: 'quality', label: 'Quality', min: 1, max: 100, default: 82 },
      { kind: 'color', id: 'background', label: 'Background (transparency fill)', default: '#ffffff' },
      { kind: 'toggle', id: 'keepMetadata', label: 'Keep EXIF metadata', default: true },
    ],
    howTo: [
      'Drop your images or a whole folder onto the panel above.',
      'Pick the output format and quality.',
      'Press process — every file converts in parallel, on your device.',
      'Download results individually or as one ZIP.',
    ],
    chainable: true,
    status: 'live',
    faq: [
      {
        q: 'Are my images uploaded anywhere?',
        a: 'No. Conversion runs in a WebAssembly engine inside your browser. You can open your network tab and watch — nothing leaves the device.',
      },
      {
        q: 'How many files can I convert at once?',
        a: 'Thousands. There is no server queue, so the only limit is your device memory. A good rule of thumb is 200–500 files per batch on a laptop.',
      },
    ],
    related: ['heic-to-jpg', 'to-webp', 'to-avif'],
  },
  {
    slug: 'heic-to-jpg',
    category: 'convert',
    title: 'HEIC to JPG converter',
    description:
      'Convert iPhone HEIC/HEIF photos to JPG in bulk, locally in your browser. No upload, full privacy, ZIP download.',
    engine: 'vips',
    accepts: ['.heic', '.heif'],
    produces: 'JPG',
    controls: [
      { kind: 'slider', id: 'quality', label: 'Quality', min: 60, max: 100, default: 90 },
      { kind: 'toggle', id: 'keepMetadata', label: 'Keep EXIF metadata (date, GPS, camera)', default: true },
    ],
    howTo: [
      'Drop the .HEIC files from your iPhone (or a folder of them).',
      'Choose JPG quality — 90 is visually lossless for photos.',
      'Process and download. Originals stay untouched on your device.',
    ],
    chainable: true,
    status: 'live',
    faq: [
      {
        q: 'Why are my iPhone photos HEIC?',
        a: 'Apple switched to HEIC by default because it is roughly half the size of JPG at the same quality. Most non-Apple apps still prefer JPG, which is why conversion is needed.',
      },
      {
        q: 'Is quality lost when converting HEIC to JPG?',
        a: 'At quality 90+ the difference is invisible to the eye. JPG cannot store HEIC\u2019s 10-bit depth, but for screen and print photos this is not perceptible.',
      },
    ],
    related: ['image-converter', 'to-jpg', 'to-webp'],
  },
  {
    slug: 'to-jpg',
    category: 'convert',
    title: 'Image to JPG converter',
    description:
      'Convert PNG, WebP, HEIC, AVIF or GIF to universal JPG. Transparent backgrounds are filled automatically.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG',
    controls: [
      { kind: 'slider', id: 'quality', label: 'Quality', min: 60, max: 100, default: 90 },
      { kind: 'color', id: 'background', label: 'Background fill for transparency', default: '#ffffff' },
    ],
    chainable: true,
    status: 'live',
    related: ['png-to-jpg', 'image-converter'],
  },
  {
    slug: 'to-webp',
    category: 'convert',
    title: 'Image to WebP converter',
    description:
      'Convert JPG, PNG and GIF to WebP for faster websites — 30–80% smaller, transparency preserved.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'WebP',
    controls: [
      { kind: 'slider', id: 'quality', label: 'Quality', min: 1, max: 100, default: 82 },
      { kind: 'toggle', id: 'lossless', label: 'Lossless (for graphics)', default: false },
    ],
    chainable: true,
    status: 'live',
    faq: [
      {
        q: 'Why WebP instead of JPG?',
        a: 'WebP is typically 30–80% smaller at equivalent quality, supports transparency and animation, and is supported by every modern browser.',
      },
    ],
    related: ['to-avif', 'image-converter'],
  },
  {
    slug: 'to-png',
    category: 'convert',
    title: 'Image to PNG converter',
    description:
      'Convert JPG, WebP, HEIC, AVIF or GIF to PNG — transparency preserved, quality lossless, batch supported.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'PNG',
    controls: [
      {
        kind: 'select',
        id: 'compression',
        label: 'PNG compression',
        options: [
          { value: '6', label: 'Balanced (6)' },
          { value: '9', label: 'Smallest file (9, slower)' },
        ],
        default: '6',
      },
    ],
    chainable: true,
    status: 'live',
    related: ['png-to-jpg', 'to-webp', 'image-converter'],
  },
  {
    slug: 'png-to-jpg',
    category: 'convert',
    title: 'PNG to JPG converter',
    description:
      'Convert PNG to JPG with transparent-background handling. Choose the fill colour, preview size before you convert.',
    engine: 'vips',
    accepts: ['.png'],
    produces: 'JPG',
    controls: [
      { kind: 'slider', id: 'quality', label: 'Quality', min: 60, max: 100, default: 90 },
      { kind: 'color', id: 'background', label: 'Background fill', default: '#ffffff' },
    ],
    chainable: true,
    status: 'live',
    related: ['to-jpg', 'image-converter'],
  },
  {
    slug: 'to-avif',
    category: 'convert',
    title: 'Image to AVIF converter',
    description:
      'Convert JPG, PNG and WebP to AVIF — around 50% smaller than JPEG with wide modern-browser support.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'AVIF',
    controls: [
      { kind: 'slider', id: 'quality', label: 'Quality', min: 1, max: 100, default: 60 },
      {
        kind: 'select',
        id: 'effort',
        label: 'Encoding effort',
        options: [
          { value: '4', label: 'Fast (4)' },
          { value: '7', label: 'Balanced (7)' },
          { value: '9', label: 'Smallest (9)' },
        ],
        default: '7',
        hint: 'Higher effort takes longer but produces smaller files.',
      },
    ],
    chainable: true,
    status: 'live',
    related: ['to-webp', 'image-converter'],
  },
  {
    slug: 'svg-to-png',
    category: 'convert',
    title: 'SVG to PNG converter',
    description:
      'Render SVG to PNG at any size and DPI. Batch supported, transparency preserved, all local.',
    engine: 'vips',
    accepts: ['.svg'],
    produces: 'PNG',
    controls: [
      {
        kind: 'dimensions',
        id: 'size',
        label: 'Output size (px)',
        default: { width: 1024, height: 1024 },
        hint: 'Keep aspect ratio automatically; empty keeps the SVG\u2019s own size.',
      },
      { kind: 'slider', id: 'scale', label: 'Scale multiplier', min: 1, max: 4, step: 1, default: 1 },
      { kind: 'color', id: 'background', label: 'Background (leave empty for transparent)', default: '' },
    ],
    chainable: true,
    status: 'live',
    related: ['image-converter'],
  },
]
