import type { ToolDef } from './types'

/** Target-size compressors share one definition shape. */
const targetSize = (kb: number, blurb: string): ToolDef => ({
  slug: `compress-to-${kb >= 1000 ? `${kb / 1000}mb` : `${kb}kb`}`,
  category: 'compress',
  title: `Compress image to ${kb >= 1000 ? `${kb / 1000}MB` : `${kb}KB`}`,
  description: `${blurb} Runs locally in your browser — no upload, batch supported, free forever.`,
  engine: 'vips',
  accepts: ['image/*'],
  produces: 'JPG, WebP, PNG',
  controls: [
    {
      kind: 'select',
      id: 'format',
      label: 'Output format',
      options: [
        { value: 'jpg', label: 'JPG' },
        { value: 'webp', label: 'WebP' },
        { value: 'png', label: 'PNG (dimension reduction only)' },
      ],
      default: 'jpg',
    },
    {
      kind: 'select',
      id: 'strategy',
      label: 'Strategy',
      options: [
        { value: 'quality-first', label: 'Best quality (reduce quality, then dimensions)' },
        { value: 'dimensions-first', label: 'Keep dimensions as long as possible' },
      ],
      default: 'quality-first',
    },
    {
      kind: 'toggle',
      id: 'stripMetadata',
      label: 'Strip metadata (smaller file)',
      default: false,
    },
  ],
  chainable: true,
  status: 'live',
  related: ['image-compressor', 'compress-to-100kb'],
})

export const compressTools: ToolDef[] = [
  {
    slug: 'image-compressor',
    category: 'compress',
    title: 'Bulk image compressor',
    description:
      'Intelligently reduce JPG, PNG, WebP and AVIF size in bulk — target a quality or an exact file size. All local.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG, WebP, PNG',
    controls: [
      {
        kind: 'select',
        id: 'format',
        label: 'Output format',
        options: [
          { value: 'auto', label: 'Keep original format' },
          { value: 'jpg', label: 'JPG' },
          { value: 'webp', label: 'WebP' },
          { value: 'png', label: 'PNG' },
        ],
        default: 'auto',
      },
      {
        kind: 'select',
        id: 'mode',
        label: 'Mode',
        options: [
          { value: 'quality', label: 'Quality slider' },
          { value: 'target-size', label: 'Target file size' },
        ],
        default: 'quality',
      },
      { kind: 'slider', id: 'quality', label: 'Quality', min: 1, max: 100, default: 80 },
      {
        kind: 'slider',
        id: 'targetKb',
        label: 'Target size (KB)',
        min: 10,
        max: 5000,
        step: 10,
        default: 200,
        hint: 'The engine searches for the highest quality that fits the target.',
      },
      {
        kind: 'select',
        id: 'strategy',
        label: 'Target-size strategy',
        options: [
          { value: 'quality-first', label: 'Reduce quality first' },
          { value: 'dimensions-first', label: 'Reduce dimensions first' },
        ],
        default: 'quality-first',
      },
      { kind: 'toggle', id: 'stripMetadata', label: 'Strip metadata (smaller)', default: false },
    ],
    howTo: [
      'Drop images or folders — hundreds at once is fine.',
      'Pick quality mode, or type an exact target size like 200 KB.',
      'Process: the compressor binary-searches quality per image, then steps dimensions down if needed.',
      'Review the before/after table, then download everything as a ZIP.',
    ],
    chainable: true,
    status: 'live',
    faq: [
      {
        q: 'How does “compress to exact size” work without a server?',
        a: 'The engine encodes each image several times at different qualities, keeps the best result under your target, and only then starts reducing dimensions. Typically 6–8 attempts per file, done in milliseconds locally.',
      },
      {
        q: 'Will compressing reduce the dimensions?',
        a: 'Only if it has to. Quality is reduced first; dimension scaling kicks in only when even low quality overshoots your target. Pick the “keep dimensions as long as possible” strategy to change the order.',
      },
    ],
    related: ['compress-to-100kb', 'compress-to-1mb', 'convert/to-webp'],
  },
  {
    slug: 'reddit-pfp-compressor',
    category: 'compress',
    title: 'Reddit PFP compressor',
    description:
      'Square, sharpen and shrink an image for a Reddit profile picture — 256×256 and comfortably under 500KB.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG',
    controls: [
      {
        kind: 'select',
        id: 'fit',
        label: 'Fit',
        options: [
          { value: 'cover', label: 'Crop to square (fill)' },
          { value: 'contain', label: 'Pad to square' },
        ],
        default: 'cover',
      },
      { kind: 'color', id: 'padColor', label: 'Pad colour', default: '#ffffff' },
    ],
    chainable: true,
    status: 'live',
    related: ['crop/circle-image-cropper', 'compress-to-500kb'],
  },
  targetSize(20, 'Make tiny images for strict upload fields — signature boxes and small avatars.'),
  targetSize(50, 'Compress to under 50KB for forms, signatures and small profile photos.'),
  targetSize(100, 'Optimise photos for forms, visas, IRCTC and other strict portals that cap uploads at 100KB.'),
  targetSize(200, 'Shrink photos for application uploads, scans and small-file limits at 200KB.'),
  targetSize(500, 'Compress photos to under 500KB for blog posts, e-commerce listings and chat sharing.'),
  targetSize(1000, 'Reduce photos for email attachments and upload limits that cap files at 1MB.'),
  targetSize(2000, 'Fit large photos under 2MB for higher upload limits and slower connections.'),
]
