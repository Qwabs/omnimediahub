export type SceneDef = {
  slug: string
  title: string
  description: string
  /** Tool slugs the scene composes, e.g. `convert/heic-to-jpg`. */
  steps: string[]
  audience: string
}

export const SCENES: SceneDef[] = [
  {
    slug: 'id-passport-photos',
    title: 'ID & passport photos',
    description:
      'Crop, resize and format photos for visas, IDs and applications — with the right dimensions at print DPI.',
    steps: ['crop/passport-photo-cropper', 'crop/2x2-photo-cropper', 'compress/compress-to-100kb'],
    audience: 'Visa, passport and ID applications',
  },
  {
    slug: 'app-icon-export',
    title: 'App icon export',
    description:
      'Generate iOS, Android and web icon sets from one source image — every required size in a single ZIP.',
    steps: ['resize/resize-image-to-512x512', 'resize/resize-image-to-128x128', 'convert/to-png'],
    audience: 'Mobile and web developers',
  },
  {
    slug: 'ecommerce-batch',
    title: 'E-commerce batch',
    description:
      'Compress, convert and standardize product photos for Shopify, Amazon and marketplaces.',
    steps: ['compress/image-compressor', 'resize/image-resizer', 'watermark/image-watermark'],
    audience: 'Shopify, Amazon, Etsy sellers',
  },
  {
    slug: 'social-media-sizes',
    title: 'Social media sizes',
    description:
      'One-click resizing for Instagram, Facebook, YouTube, TikTok and X — always the right crop.',
    steps: ['resize/instagram-resizer', 'resize/youtube-thumbnail-resizer', 'compress/image-compressor'],
    audience: 'Creators and marketers',
  },
  {
    slug: 'podcast-cleanup',
    title: 'Podcast cleanup',
    description:
      'Normalize loudness, trim silences and export consistent episodes — all from the browser.',
    steps: ['audio/audio-normalizer', 'audio/audio-trimmer', 'audio/audio-converter'],
    audience: 'Podcasters',
  },
  {
    slug: 'vertical-video-pack',
    title: 'Vertical video pack',
    description:
      'Crop, resize and compress video for Reels, Shorts and TikTok — 9:16, small file, platform ready.',
    steps: ['video/video-cropper', 'video/video-resizer', 'video/video-compressor'],
    audience: 'Video creators',
  },
  {
    slug: 'discord-emoji-pack',
    title: 'Discord emoji pack',
    description:
      'Turn images and GIFs into Discord-ready emoji and stickers — 128×128, under size limits.',
    steps: ['resize/resize-image-to-128x128', 'gif/gif-compressor', 'gif/gif-maker'],
    audience: 'Discord communities',
  },
]

export const getScene = (slug: string) => SCENES.find((s) => s.slug === slug)
