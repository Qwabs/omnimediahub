import type { ToolDef } from './types'

export const watermarkTools: ToolDef[] = [
  {
    slug: 'image-watermark',
    category: 'watermark',
    title: 'Batch image watermark',
    description:
      'Add text or logo watermarks to 100+ images in seconds. Control position, opacity, scale and tiling — locally.',
    engine: 'raster',
    accepts: ['image/*'],
    produces: 'JPG, PNG',
    asset: {
      id: 'logo',
      label: 'Watermark logo (PNG with transparency works best)',
      hint: 'Drop the logo file here — it is applied to every photo in the batch.',
    },
    controls: [
      {
        kind: 'select',
        id: 'type',
        label: 'Watermark type',
        options: [
          { value: 'text', label: 'Text' },
          { value: 'image', label: 'Image / logo (upload below)' },
        ],
        default: 'text',
      },
      {
        kind: 'text',
        id: 'text',
        label: 'Watermark text',
        default: '© Your Name',
        placeholder: '© Your Name',
      },
      {
        kind: 'select',
        id: 'position',
        label: 'Position',
        options: [
          { value: 'center', label: 'Center' },
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'top-right', label: 'Top right' },
          { value: 'top-left', label: 'Top left' },
          { value: 'tile', label: 'Tile across image' },
        ],
        default: 'bottom-right',
      },
      { kind: 'slider', id: 'opacity', label: 'Opacity', min: 5, max: 100, default: 60, unit: '%' },
      { kind: 'slider', id: 'scale', label: 'Size (% of image width)', min: 1, max: 100, default: 20, unit: '%' },
      { kind: 'color', id: 'color', label: 'Text colour', default: '#ffffff' },
    ],
    howTo: [
      'Drop the images you want to protect.',
      'Type your text or upload a logo, then choose a position.',
      'Text watermarks get a soft shadow so they stay readable on any photo.',
      'Process and download the watermarked set as a ZIP.',
    ],
    chainable: true,
    status: 'live',
    faq: [
      {
        q: 'Is the watermark added by this site?',
        a: 'No. OmniMediaHub never adds its own watermark. The only mark on your images is the one you configure.',
      },
    ],
    related: ['image-overlay', 'merge-images'],
  },
  {
    slug: 'image-overlay',
    category: 'watermark',
    title: 'Image overlay',
    description:
      'Stack images into one composition — the first file becomes the background and the rest are layered on top, centred and contained.',
    engine: 'raster',
    accepts: ['image/*'],
    produces: 'JPG, PNG',
    controls: [
      {
        kind: 'dimensions',
        id: 'canvas',
        label: 'Canvas size (px)',
        default: { width: 1920, height: 1080 },
        hint: 'The background image is scaled to cover this canvas; layers are fitted inside it.',
      },
      { kind: 'slider', id: 'opacity', label: 'Layer opacity', min: 0, max: 100, default: 100, unit: '%' },
      { kind: 'color', id: 'background', label: 'Background (behind everything)', default: '#ffffff' },
      {
        kind: 'select',
        id: 'format',
        label: 'Output format',
        options: [
          { value: 'jpg', label: 'JPG' },
          { value: 'png', label: 'PNG' },
        ],
        default: 'jpg',
      },
    ],
    chainable: false,
    status: 'live',
    howTo: [
      'Drop all the images — the first one in the list is the background.',
      'Set the canvas size and layer opacity.',
      'Process: layers are fitted inside the canvas, centred, and composited.',
      'Use the results tab to save the composition.',
    ],
    related: ['image-watermark', 'merge-images'],
  },
  {
    slug: 'merge-images',
    category: 'watermark',
    title: 'Merge images',
    description:
      'Combine JPG, PNG or WebP files into one image — side by side, stacked or in a grid — with spacing and background control.',
    engine: 'raster',
    accepts: ['image/*'],
    produces: 'JPG, PNG',
    controls: [
      {
        kind: 'select',
        id: 'layout',
        label: 'Layout',
        options: [
          { value: 'horizontal', label: 'Side by side' },
          { value: 'vertical', label: 'Stacked vertically' },
          { value: 'grid', label: 'Grid' },
        ],
        default: 'grid',
      },
      { kind: 'slider', id: 'columns', label: 'Grid columns', min: 1, max: 8, default: 3 },
      { kind: 'slider', id: 'gap', label: 'Gap (px)', min: 0, max: 64, default: 8 },
      { kind: 'color', id: 'background', label: 'Background', default: '#ffffff' },
      {
        kind: 'select',
        id: 'format',
        label: 'Output format',
        options: [
          { value: 'jpg', label: 'JPG' },
          { value: 'png', label: 'PNG' },
        ],
        default: 'jpg',
      },
    ],
    howTo: [
      'Drop two or more images — they merge in file order.',
      'Choose a layout: side by side, stacked, or a grid with a column count.',
      'Images are contained inside uniform cells, so mixed aspect ratios still align.',
      'Process and save the single merged result.',
    ],
    chainable: false,
    status: 'live',
    related: ['image-overlay', 'image-watermark'],
  },
]
