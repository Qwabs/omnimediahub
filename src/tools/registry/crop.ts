import type { ToolDef } from './types'

export const cropTools: ToolDef[] = [
  {
    slug: 'image-cropper',
    category: 'crop',
    title: 'Bulk image cropper',
    description:
      'Crop multiple images to the same aspect ratio — 1:1, 16:9, 4:5 and more — with centre, top or bottom anchoring.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'same as input',
    controls: [
      {
        kind: 'select',
        id: 'ratio',
        label: 'Aspect ratio',
        options: [
          { value: 'free', label: 'Free (keep as is)' },
          { value: '1:1', label: '1:1 Square' },
          { value: '4:5', label: '4:5 Portrait' },
          { value: '16:9', label: '16:9 Widescreen' },
          { value: '9:16', label: '9:16 Vertical' },
          { value: '3:2', label: '3:2 Photo' },
        ],
        default: '1:1',
      },
      {
        kind: 'select',
        id: 'anchor',
        label: 'Crop anchor',
        options: [
          { value: 'center', label: 'Center' },
          { value: 'top', label: 'Top (keep the top edge)' },
          { value: 'bottom', label: 'Bottom' },
        ],
        default: 'center',
      },
    ],
    chainable: true,
    status: 'live',
    howTo: [
      'Drop the images to crop.',
      'Pick an aspect ratio — every image gets the largest crop that fits it.',
      'Choose the anchor: centre keeps faces, top keeps ceilings and skies.',
      'Process and download; the same crop settings apply to the whole batch.',
    ],
    related: ['circle-image-cropper', 'passport-photo-cropper'],
  },
  {
    slug: 'passport-photo-cropper',
    category: 'crop',
    title: 'Passport photo cropper',
    description:
      'Crop to official passport sizes — 35×45mm, 2×2in, 33×48mm — with correct pixel dimensions at your print DPI, and an optional 4×6 print sheet.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG',
    controls: [
      {
        kind: 'select',
        id: 'standard',
        label: 'Standard',
        options: [
          { value: '35x45', label: '35×45 mm — UK, EU, Asia, India' },
          { value: '2x2', label: '2×2 in — US passport / visa' },
          { value: '33x48', label: '33×48 mm — China' },
        ],
        default: '35x45',
      },
      {
        kind: 'slider',
        id: 'dpi',
        label: 'Print DPI',
        min: 300,
        max: 600,
        step: 300,
        default: 300,
        hint: '300 DPI is the standard for photo labs and most official uploads.',
      },
      {
        kind: 'toggle',
        id: 'compose4x6',
        label: 'Lay out copies on a 4×6in print sheet',
        default: false,
        hint: 'Tiles as many copies as fit, with margins, ready for home printing.',
      },
    ],
    chainable: false,
    status: 'live',
    howTo: [
      'Drop a portrait photo — head and shoulders work best.',
      'Pick the standard that applies to you and confirm the DPI.',
      'Enable the print sheet if you want multiple copies on one 4×6 print.',
      'Process: the crop is centred and resized to the exact official pixels.',
    ],
    faq: [
      {
        q: 'How many pixels is a passport photo?',
        a: '35×45mm at 300 DPI is 413×531 pixels; 2×2in at 300 DPI is 600×600. The tool computes these from the standard and your chosen DPI, so the file is correct for lab printing and online portals.',
      },
      {
        q: 'Can I print passport photos at home?',
        a: 'Yes — enable the 4×6 print sheet. The photo is tiled onto a 4×6 inch white canvas at your DPI with margins, so your printer can output standard glossy photo paper.',
      },
    ],
    related: ['2x2-photo-cropper', 'image-cropper', 'compress/compress-to-100kb'],
  },
  {
    slug: '2x2-photo-cropper',
    category: 'crop',
    title: '2×2 photo cropper',
    description:
      'Crop photos to exactly 2×2 inches (51×51mm) at 300–600 DPI for US visa, passport and OCI applications.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG',
    controls: [
      { kind: 'slider', id: 'dpi', label: 'Print DPI', min: 300, max: 600, step: 300, default: 300 },
      { kind: 'toggle', id: 'compose4x6', label: 'Lay out copies on a 4×6in print sheet', default: false },
    ],
    chainable: false,
    status: 'live',
    related: ['passport-photo-cropper', 'image-cropper'],
  },
  {
    slug: 'circle-image-cropper',
    category: 'crop',
    title: 'Circle image cropper',
    description:
      'Crop images into perfect circles with anti-aliased edges and export transparent PNGs — ideal for avatars.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'PNG (transparent)',
    controls: [
      {
        kind: 'slider',
        id: 'size',
        label: 'Output size (px)',
        min: 64,
        max: 2048,
        step: 32,
        default: 512,
      },
    ],
    chainable: true,
    status: 'live',
    related: ['image-cropper', 'resize/resize-image-to-512x512'],
  },
]
