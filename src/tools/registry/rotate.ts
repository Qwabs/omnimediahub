import type { ToolDef } from './types'

export const rotateTools: ToolDef[] = [
  {
    slug: 'image-rotator',
    category: 'rotate',
    title: 'Bulk image rotator',
    description:
      'Rotate multiple images 90°, 180° or 270° at once, with optional auto-orient from camera metadata. No upload.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      {
        kind: 'select',
        id: 'angle',
        label: 'Rotation',
        options: [
          { value: '90', label: '90° clockwise' },
          { value: '180', label: '180°' },
          { value: '270', label: '90° counter-clockwise' },
          { value: 'auto', label: 'Auto (from EXIF orientation)' },
        ],
        default: '90',
      },
    ],
    chainable: true,
    status: 'live',
    related: ['image-flipper'],
  },
  {
    slug: 'image-flipper',
    category: 'rotate',
    title: 'Bulk image flipper',
    description:
      'Mirror images horizontally or vertically in bulk — fix mirrored selfies or create symmetric effects, locally.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      {
        kind: 'select',
        id: 'axis',
        label: 'Flip axis',
        options: [
          { value: 'horizontal', label: 'Horizontal (mirror left ↔ right)' },
          { value: 'vertical', label: 'Vertical (mirror top ↔ bottom)' },
          { value: 'both', label: 'Both' },
        ],
        default: 'horizontal',
      },
    ],
    chainable: true,
    status: 'live',
    related: ['image-rotator'],
  },
]
