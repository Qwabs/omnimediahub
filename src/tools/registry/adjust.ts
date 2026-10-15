import type { ToolDef } from './types'

export const adjustTools: ToolDef[] = [
  {
    slug: 'grayscale-image',
    category: 'adjust',
    title: 'Grayscale converter',
    description:
      'Convert photos to black & white in four modes — standard, film vintage, high contrast and colour-keep. Batch, local.',
    engine: 'raster',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: 'Mode',
        options: [
          { value: 'standard', label: 'Standard luminance' },
          { value: 'film', label: 'Film vintage (warm, softer contrast)' },
          { value: 'contrast', label: 'High contrast (graphic)' },
          { value: 'keep-red', label: 'Colour-keep — keep reds, grey the rest' },
        ],
        default: 'standard',
      },
    ],
    chainable: true,
    status: 'live',
    related: ['invert-image-colors', 'adjust-image-contrast'],
  },
  {
    slug: 'invert-image-colors',
    category: 'adjust',
    title: 'Colour inverter',
    description:
      'Invert the colours of multiple images at once — every pixel flips to its opposite, including an exact negative of scanned film.',
    engine: 'raster',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [],
    chainable: true,
    status: 'live',
    related: ['grayscale-image'],
  },
  {
    slug: 'change-image-brightness',
    category: 'adjust',
    title: 'Brightness adjuster',
    description: 'Brighten dark photos or tone down overexposed ones — one slider, applied across the batch.',
    engine: 'raster',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      {
        kind: 'slider',
        id: 'brightness',
        label: 'Brightness',
        min: -100,
        max: 100,
        default: 0,
        hint: '−100 is black, +100 more than doubles brightness. 0 leaves the image untouched.',
      },
    ],
    chainable: true,
    status: 'live',
    related: ['adjust-image-contrast', 'grayscale-image'],
  },
  {
    slug: 'adjust-image-contrast',
    category: 'adjust',
    title: 'Contrast adjuster',
    description:
      'Increase or decrease contrast across a whole batch — from flat and muted to punchy and graphic.',
    engine: 'raster',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      { kind: 'slider', id: 'contrast', label: 'Contrast', min: -100, max: 100, default: 0 },
    ],
    chainable: true,
    status: 'live',
    related: ['change-image-brightness', 'grayscale-image'],
  },
]
