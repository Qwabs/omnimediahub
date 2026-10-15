import type { Control, ToolDef } from './types'

/** Fixed-size resizer pages are generated from this table — not hand-written. */
const FIXED_SIZES: { w: number; h: number; note: string }[] = [
  { w: 64, h: 64, note: 'favicon, icon, tiny avatar' },
  { w: 100, h: 100, note: 'avatar, forum profile, thumbnail' },
  { w: 128, h: 128, note: 'app icon, Discord, favicon' },
  { w: 150, h: 150, note: 'WordPress thumbnail, social preview' },
  { w: 200, h: 200, note: 'profile pic, team photo' },
  { w: 256, h: 256, note: 'app icon, game texture' },
  { w: 360, h: 360, note: 'profile photo, social avatar' },
  { w: 512, h: 512, note: 'app store icon, Google Play' },
  { w: 1024, h: 1024, note: 'app icon master, square post' },
  { w: 1080, h: 1080, note: 'Instagram square, product shot' },
  { w: 1080, h: 1920, note: 'vertical story, reel, TikTok' },
  { w: 1200, h: 630, note: 'Open Graph / link preview card' },
  { w: 1280, h: 720, note: 'HD video preview, presentation slides' },
  { w: 1920, h: 1080, note: 'Full HD wallpaper, video still' },
  { w: 2560, h: 1440, note: 'QHD wallpaper, hero image' },
  { w: 3000, h: 3000, note: 'print, high-res square' },
]

const fixedSizeControls = (w: number, h: number): Control[] => [
  {
    kind: 'dimensions',
    id: 'size',
    label: `Output size (px) — preset ${w}×${h}`,
    default: { width: w, height: h },
  },
  {
    kind: 'select',
    id: 'fit',
    label: 'Fit',
    options: [
      { value: 'cover', label: 'Cover (crop to fill)' },
      { value: 'contain', label: 'Contain (pad to fit)' },
      { value: 'stretch', label: 'Stretch' },
    ],
    default: 'cover',
  },
  { kind: 'color', id: 'padColor', label: 'Padding colour (contain mode)', default: '#ffffff' },
]

/** Social presets share one shape; the engine maps the choice to dimensions. */
const socialPresets = (
  slug: string,
  title: string,
  description: string,
  presets: { value: string; label: string }[],
  opts: { pad?: boolean; hot?: string[] } = {},
): ToolDef => ({
  slug,
  category: 'resize',
  title,
  description,
  engine: 'vips',
  accepts: ['image/*'],
  produces: 'JPG',
  controls: [
    { kind: 'select', id: 'preset', label: 'Preset', options: presets, default: presets[0].value },
    ...(opts.pad
      ? ([
          {
            kind: 'select',
            id: 'fit',
            label: 'Fit',
            options: [
              { value: 'contain', label: 'No-crop (pad with colour)' },
              { value: 'cover', label: 'Crop to fill' },
            ],
            default: 'contain',
          },
          { kind: 'color', id: 'padColor', label: 'Pad colour', default: '#ffffff' },
        ] satisfies Control[])
      : []),
  ],
  chainable: true,
  status: 'live',
  related: opts.hot ?? ['image-resizer'],
})

export const resizeTools: ToolDef[] = [
  {
    slug: 'image-resizer',
    category: 'resize',
    title: 'Bulk image resizer',
    description:
      'Resize by pixels, percentage or longest side — with aspect-ratio, crop and padding controls. Local and unlimited.',
    engine: 'vips',
    accepts: ['image/*', '.zip'],
    produces: 'JPG, PNG, WebP',
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: 'Resize mode',
        options: [
          { value: 'dimensions', label: 'Exact dimensions' },
          { value: 'percent', label: 'Percentage' },
          { value: 'longest', label: 'Longest side' },
        ],
        default: 'dimensions',
      },
      { kind: 'dimensions', id: 'size', label: 'Dimensions (px)', default: { width: 1920, height: 1080 } },
      { kind: 'slider', id: 'percent', label: 'Percentage', min: 1, max: 200, default: 50, unit: '%' },
      { kind: 'slider', id: 'longest', label: 'Longest side (px)', min: 64, max: 8192, default: 1920 },
      {
        kind: 'select',
        id: 'fit',
        label: 'Fit',
        options: [
          { value: 'cover', label: 'Cover (crop to fill)' },
          { value: 'contain', label: 'Contain (pad to fit)' },
          { value: 'inside', label: 'Inside (never enlarge)' },
          { value: 'stretch', label: 'Stretch' },
        ],
        default: 'cover',
      },
      { kind: 'toggle', id: 'neverUpscale', label: 'Never enlarge images', default: true },
    ],
    howTo: [
      'Drop images, folders, or a ZIP archive.',
      'Choose a mode: exact pixels, percentage or longest side.',
      'Set the fit behaviour — cover crops, contain pads.',
      'Process and download all results as a ZIP.',
    ],
    chainable: true,
    status: 'live',
    faq: [
      {
        q: 'What is “longest side” mode?',
        a: 'It resizes so the image\u2019s longer edge matches your value, keeping the aspect ratio. It is the fastest way to make every image consistent for web uploads.',
      },
      {
        q: 'Does resizing smaller lose quality?',
        a: 'Downscaling with a good kernel actually increases apparent sharpness. Repeated re-encoding is what degrades quality — which is why chaining tools here happens in memory, at full quality, until the final encode.',
      },
    ],
    related: ['instagram-resizer', 'youtube-thumbnail-resizer', 'resize-image-to-1080x1080'],
  },
  socialPresets(
    'instagram-resizer',
    'Instagram image resizer',
    'Batch resize for Instagram feed, stories and reels — 1:1, 4:5, 9:16 — with no-crop padding that keeps every detail.',
    [
      { value: 'square', label: 'Feed square — 1080×1080 (1:1)' },
      { value: 'portrait', label: 'Feed portrait — 1080×1350 (4:5)' },
      { value: 'story', label: 'Story / Reel — 1080×1920 (9:16)' },
    ],
    { pad: true, hot: ['image-resizer', 'resize-image-to-1080x1080'] },
  ),
  socialPresets(
    'facebook-image-resizer',
    'Facebook image resizer',
    'Resize for Facebook posts, covers, profiles and stories — the exact current dimensions, in batch.',
    [
      { value: 'post', label: 'Post / link — 1200×630' },
      { value: 'cover', label: 'Cover photo — 1640×856' },
      { value: 'profile', label: 'Profile picture — 720×720' },
      { value: 'story', label: 'Story — 1080×1920' },
    ],
    { hot: ['instagram-resizer', 'image-resizer'] },
  ),
  socialPresets(
    'twitter-image-resizer',
    'Twitter / X image resizer',
    'Resize for X posts, headers and profile pictures — 1600×900, 1500×500 and 400×400, in batch.',
    [
      { value: 'post', label: 'Post — 1600×900 (16:9)' },
      { value: 'header', label: 'Header — 1500×500 (3:1)' },
      { value: 'profile', label: 'Profile — 400×400' },
    ],
    { hot: ['facebook-image-resizer', 'image-resizer'] },
  ),
  socialPresets(
    'linkedin-image-resizer',
    'LinkedIn image resizer',
    'Resize for LinkedIn posts, covers and profiles — 1200×627, 1584×396 and 400×400.',
    [
      { value: 'post', label: 'Post — 1200×627' },
      { value: 'cover', label: 'Cover — 1584×396 (4:1)' },
      { value: 'profile', label: 'Profile — 400×400' },
    ],
    { hot: ['twitter-image-resizer', 'image-resizer'] },
  ),
  socialPresets(
    'tiktok-resizer',
    'TikTok video cover resizer',
    'Resize thumbnails and covers for TikTok — 1080×1920, with no-crop padding for full-frame images.',
    [{ value: 'cover', label: 'Video cover — 1080×1920 (9:16)' }],
    { pad: true, hot: ['instagram-resizer', 'resize-image-to-1080x1920'] },
  ),
  {
    slug: 'youtube-thumbnail-resizer',
    category: 'resize',
    title: 'YouTube thumbnail resizer',
    description:
      'Resize to the official 1280×720 thumbnail size and search for the best quality under YouTube’s 2MB limit.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG',
    controls: [
      {
        kind: 'select',
        id: 'fit',
        label: 'Fit',
        options: [
          { value: 'cover', label: 'Crop to fill 16:9' },
          { value: 'contain', label: 'Pad to 16:9' },
        ],
        default: 'cover',
      },
      { kind: 'toggle', id: 'enforceLimit', label: 'Keep under 2MB (YouTube limit)', default: true },
    ],
    chainable: true,
    status: 'live',
    related: ['image-resizer', 'resize-image-to-1280x720'],
  },
  {
    slug: '4x6-photo-resizer',
    category: 'resize',
    title: '4×6 photo resizer',
    description:
      'Prepare photos for 4×6 inch printing — correct ratio at 300 DPI (1200×1800) or your own print resolution.',
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG',
    controls: [
      {
        kind: 'select',
        id: 'dpi',
        label: 'Print resolution',
        options: [
          { value: '300', label: '300 DPI — lab quality (1200×1800)' },
          { value: '600', label: '600 DPI — high quality (2400×3600)' },
          { value: '150', label: '150 DPI — draft (600×900)' },
        ],
        default: '300',
      },
      {
        kind: 'select',
        id: 'fit',
        label: 'Fit',
        options: [
          { value: 'cover', label: 'Crop to 2:3 (fill the print)' },
          { value: 'contain', label: 'Pad to 2:3 (keep everything)' },
        ],
        default: 'cover',
      },
    ],
    chainable: true,
    status: 'live',
    related: ['crop/passport-photo-cropper', 'image-resizer'],
  },
  ...FIXED_SIZES.map<ToolDef>(({ w, h, note }) => ({
    slug: `resize-image-to-${w}x${h}`,
    category: 'resize',
    title: `Resize image to ${w}×${h}`,
    description: `Resize any image to exactly ${w}×${h} pixels — for ${note}. Batch, local, no upload.`,
    engine: 'vips',
    accepts: ['image/*'],
    produces: 'JPG, PNG, WebP',
    controls: fixedSizeControls(w, h),
    chainable: true,
    status: 'live',
    related: ['image-resizer'],
  })),
]
