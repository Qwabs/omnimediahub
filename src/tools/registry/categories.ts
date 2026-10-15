import type { ToolCategoryDef } from './types'

export const CATEGORIES: ToolCategoryDef[] = [
  {
    id: 'convert',
    title: 'Format Converters',
    blurb: 'Batch convert between HEIC, WebP, AVIF, JPG, PNG and more — locally, no upload.',
    order: 10,
    group: 'media',
  },
  {
    id: 'compress',
    title: 'Compression',
    blurb: 'Compress to exact target sizes in bulk, with real-time size estimates.',
    order: 20,
    group: 'media',
  },
  {
    id: 'resize',
    title: 'Resizing',
    blurb: 'Resize by pixels, percentage or preset — social, print and device sizes.',
    order: 30,
    group: 'media',
  },
  {
    id: 'crop',
    title: 'Cropping',
    blurb: 'Batch crop, passport and ID photos, circle crops — pixel exact.',
    order: 40,
    group: 'media',
  },
  {
    id: 'rotate',
    title: 'Rotate & Flip',
    blurb: 'Fix sideways photos and mirror images in one pass.',
    order: 50,
    group: 'media',
  },
  {
    id: 'gif',
    title: 'GIF Tools',
    blurb: 'Create, compress, edit and convert animated GIFs — frame precise.',
    order: 60,
    group: 'media',
  },
  {
    id: 'watermark',
    title: 'Watermark & Overlay',
    blurb: 'Add text or logo watermarks and merge images in seconds.',
    order: 70,
    group: 'media',
  },
  {
    id: 'exif',
    title: 'EXIF & Metadata',
    blurb: 'View, edit or strip metadata. DPI conversion for print.',
    order: 80,
    group: 'media',
  },
  {
    id: 'adjust',
    title: 'Adjustments',
    blurb: 'Brightness, contrast, grayscale, invert — with live preview.',
    order: 90,
    group: 'media',
  },
  {
    id: 'edit',
    title: 'Effects & Editing',
    blurb: 'Blur, pixelate, glitch, rounded corners, split into grids.',
    order: 100,
    group: 'media',
  },
  {
    id: 'ai',
    title: 'Local AI',
    blurb: 'Background removal, upscaling, inpainting and deblur — on-device models.',
    order: 110,
    group: 'ai',
  },
  {
    id: 'video',
    title: 'Video Tools',
    blurb: 'Convert, compress, trim, crop, watermark and merge video — in the browser.',
    order: 120,
    group: 'video',
  },
  {
    id: 'audio',
    title: 'Audio Tools',
    blurb: 'Convert, trim, merge, normalize and master audio — entirely on-device.',
    order: 130,
    group: 'audio',
  },
]

export const getCategory = (id: string) => CATEGORIES.find((c) => c.id === id)
