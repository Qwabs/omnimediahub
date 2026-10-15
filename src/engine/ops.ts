/*
 * Tool → engine bindings.
 *
 * Tools are declared in the registry; this table wires the ones whose
 * engines exist. A tool with no binding renders as `[ soon ]` and its
 * process button stays disabled — the app never pretends to work.
 */
import type { EngineName } from './types'

export type OpBinding = {
  engine: EngineName
  op: string
  /** One job for all files (GIF maker, merges) instead of one job per file. */
  combine?: boolean
  /** Params forced by the tool definition — e.g. HEIC→JPG always outputs jpg. */
  fixed?: Record<string, unknown>
  /**
   * Tool-specific mapping from control values to engine params. Receives the
   * merged settings and returns the full params object.
   */
  translate?: (settings: Record<string, unknown>) => Record<string, unknown>
}

export const TOOL_OPS: Record<string, OpBinding> = {
  // images — libvips
  'convert/image-converter': { engine: 'vips', op: 'convert' },
  'convert/heic-to-jpg': { engine: 'vips', op: 'convert', fixed: { format: 'jpg' } },
  'convert/to-jpg': { engine: 'vips', op: 'convert', fixed: { format: 'jpg' } },
  'convert/to-png': { engine: 'vips', op: 'convert', fixed: { format: 'png' } },
  'convert/to-webp': { engine: 'vips', op: 'convert', fixed: { format: 'webp' } },
  'convert/to-avif': { engine: 'vips', op: 'convert', fixed: { format: 'avif' } },
  'convert/png-to-jpg': { engine: 'vips', op: 'convert', fixed: { format: 'jpg' } },
  'convert/svg-to-png': { engine: 'vips', op: 'convert', fixed: { format: 'png' } },
  'resize/image-resizer': { engine: 'vips', op: 'resize' },
  'resize/instagram-resizer': {
    engine: 'vips',
    op: 'resize',
    translate: (settings) => {
      const presets: Record<string, [number, number]> = {
        square: [1080, 1080],
        portrait: [1080, 1350],
        story: [1080, 1920],
      }
      const [width, height] = presets[String(settings.preset ?? 'square')] ?? presets.square
      return {
        mode: 'dimensions',
        width,
        height,
        fit: settings.fit ?? 'contain',
        padColor: settings.padColor ?? '#ffffff',
        format: 'jpg',
        quality: 90,
      }
    },
  },
  'resize/youtube-thumbnail-resizer': {
    engine: 'vips',
    op: 'compress',
    translate: (settings) => ({
      // YouTube caps files at 2MB — search for the best quality under it.
      mode: settings.enforceLimit === false ? 'quality' : 'target-size',
      targetKb: 2000,
      quality: 92,
      format: 'jpg',
      resize: { width: 1280, height: 720, fit: settings.fit ?? 'cover' },
    }),
  },
  'resize/facebook-image-resizer': {
    engine: 'vips',
    op: 'resize',
    translate: (settings) => {
      const presets: Record<string, [number, number]> = {
        post: [1200, 630],
        cover: [1640, 856],
        profile: [720, 720],
        story: [1080, 1920],
      }
      const [width, height] = presets[String(settings.preset ?? 'post')] ?? presets.post
      return { mode: 'dimensions', width, height, fit: 'cover', format: 'jpg', quality: 90 }
    },
  },
  'resize/twitter-image-resizer': {
    engine: 'vips',
    op: 'resize',
    translate: (settings) => {
      const presets: Record<string, [number, number]> = {
        post: [1600, 900],
        header: [1500, 500],
        profile: [400, 400],
      }
      const [width, height] = presets[String(settings.preset ?? 'post')] ?? presets.post
      return { mode: 'dimensions', width, height, fit: 'cover', format: 'jpg', quality: 90 }
    },
  },
  'resize/linkedin-image-resizer': {
    engine: 'vips',
    op: 'resize',
    translate: (settings) => {
      const presets: Record<string, [number, number]> = {
        post: [1200, 627],
        cover: [1584, 396],
        profile: [400, 400],
      }
      const [width, height] = presets[String(settings.preset ?? 'post')] ?? presets.post
      return { mode: 'dimensions', width, height, fit: 'cover', format: 'jpg', quality: 90 }
    },
  },
  'resize/tiktok-resizer': {
    engine: 'vips',
    op: 'resize',
    translate: (settings) => ({
      mode: 'dimensions',
      width: 1080,
      height: 1920,
      fit: settings.fit ?? 'contain',
      padColor: settings.padColor ?? '#ffffff',
      format: 'jpg',
      quality: 90,
    }),
  },
  'resize/4x6-photo-resizer': {
    engine: 'vips',
    op: 'resize',
    translate: (settings) => {
      const dpi = Number(settings.dpi) || 300
      return {
        mode: 'dimensions',
        width: Math.round(4 * dpi),
        height: Math.round(6 * dpi),
        fit: settings.fit ?? 'cover',
        format: 'jpg',
        quality: 92,
      }
    },
  },

  // compression — the search engine lives in the vips worker
  'compress/image-compressor': { engine: 'vips', op: 'compress' },
  'compress/reddit-pfp-compressor': {
    engine: 'vips',
    op: 'compress',
    fixed: {
      mode: 'target-size',
      targetKb: 500,
      format: 'jpg',
      resize: { width: 256, height: 256, fit: 'cover' },
    },
  },

  // cropping
  'crop/image-cropper': { engine: 'vips', op: 'crop-ratio' },
  'crop/passport-photo-cropper': { engine: 'vips', op: 'crop-standard' },
  'crop/2x2-photo-cropper': {
    engine: 'vips',
    op: 'crop-standard',
    fixed: { standard: '2x2' },
  },
  'crop/circle-image-cropper': { engine: 'vips', op: 'circle-crop' },

  // rotate & flip
  'rotate/image-rotator': { engine: 'vips', op: 'rotate' },
  'rotate/image-flipper': { engine: 'vips', op: 'flip' },

  // adjustments — canvas filters
  'adjust/grayscale-image': {
    engine: 'raster',
    op: 'adjust',
    translate: (settings) => ({ effect: 'grayscale', mode: settings.mode ?? 'standard' }),
  },
  'adjust/invert-image-colors': { engine: 'raster', op: 'adjust', fixed: { effect: 'invert' } },
  'adjust/change-image-brightness': {
    engine: 'raster',
    op: 'adjust',
    translate: (settings) => ({ effect: 'brightness', value: settings.brightness ?? 0 }),
  },
  'adjust/adjust-image-contrast': {
    engine: 'raster',
    op: 'adjust',
    translate: (settings) => ({ effect: 'contrast', value: settings.contrast ?? 0 }),
  },

  // effects & compositing
  'edit/blur-image': { engine: 'raster', op: 'blur' },
  'edit/pixelate-image': { engine: 'raster', op: 'pixelate' },
  'edit/glitch-effect': { engine: 'raster', op: 'glitch' },
  'edit/round-corners': { engine: 'raster', op: 'round-corners' },
  'edit/split-image': { engine: 'raster', op: 'split' },
  'watermark/image-watermark': { engine: 'raster', op: 'watermark' },
  'watermark/merge-images': { engine: 'raster', op: 'merge', combine: true },
  'watermark/image-overlay': { engine: 'raster', op: 'overlay', combine: true },

  // metadata
  'exif/exif-viewer': { engine: 'exif', op: 'read' },
  'exif/dpi-checker': { engine: 'exif', op: 'read', fixed: { focus: 'dpi' } },
  'exif/exif-editor': { engine: 'exif', op: 'edit' },
  'exif/dpi-converter': { engine: 'exif', op: 'set-dpi' },

  // local AI
  'ai/remove-background': { engine: 'ai', op: 'remove-background' },
  'ai/image-upscaler': { engine: 'ai', op: 'upscale' },
  'ai/image-to-hd': {
    engine: 'ai',
    op: 'upscale',
    translate: (settings) => ({ factor: String(settings.target ?? '1080') === '1440' ? '4' : '2' }),
  },
  'ai/remove-object': { engine: 'ai', op: 'inpaint' },
  'ai/remove-watermark': { engine: 'ai', op: 'inpaint' },
  'ai/unpixelate-image': { engine: 'ai', op: 'unpixelate' },
  'ai/blur-people': { engine: 'ai', op: 'blur-people' },
  'audio/audio-transcribe': { engine: 'ai', op: 'transcribe' },

  // gif
  'gif/gif-maker': { engine: 'gif', op: 'images-to-gif', combine: true },
  'gif/gif-compressor': {
    engine: 'gif',
    op: 'compress',
    translate: (settings) => ({
      scale: settings.scale,
      dropFrames: settings.dropFrames,
      targetKb: settings.targetKb,
      optimizePalette: settings.optimizePalette !== 'per-frame',
    }),
  },
  'gif/gif-resizer': {
    engine: 'gif',
    op: 'resize',
    translate: (settings) => {
      const preset = String(settings.preset ?? '512')
      const custom = preset === 'custom'
      return {
        width: custom ? Number(settings.width) || 480 : Number(preset) || 512,
        // 0 keeps the animation's aspect ratio.
        height: custom ? Number(settings.height) || 0 : 0,
        fit: settings.fit ?? 'cover',
      }
    },
  },
  'gif/gif-cropper': { engine: 'gif', op: 'crop' },
  'gif/gif-rotator': { engine: 'gif', op: 'rotate' },
  'gif/gif-reverser': { engine: 'gif', op: 'reverse' },
  'gif/gif-speed-changer': { engine: 'gif', op: 'speed' },
  'gif/gif-trimmer': { engine: 'gif', op: 'trim' },
  'gif/gif-merger': { engine: 'gif', op: 'merge', combine: true },
  'gif/gif-text-adder': { engine: 'gif', op: 'text' },
  'gif/blur-gif': { engine: 'gif', op: 'blur' },
  'gif/gif-frame-extractor': { engine: 'gif', op: 'extract-frames' },
  'gif/gif-to-sprite-sheet': { engine: 'gif', op: 'sprite-sheet' },
  'gif/sprite-sheet-to-gif': { engine: 'gif', op: 'sprite-to-gif' },
  'gif/typing-text-gif': { engine: 'gif', op: 'typing-text' },
  'gif/gif-to-discord-sticker': { engine: 'gif', op: 'discord-sticker' },
  'gif/video-to-gif': { engine: 'ffmpeg', op: 'to-gif' },
  'gif/webp-to-gif': { engine: 'ffmpeg', op: 'to-gif' },
  'gif/apng-to-gif': { engine: 'ffmpeg', op: 'to-gif' },
  'gif/gif-to-mp4': { engine: 'ffmpeg', op: 'from-gif', fixed: { format: 'mp4' } },
  'gif/gif-to-webp': { engine: 'ffmpeg', op: 'from-gif', fixed: { format: 'webp' } },
  'gif/gif-to-apng': { engine: 'ffmpeg', op: 'from-gif', fixed: { format: 'apng' } },

  // video — ffmpeg
  'video/video-converter': { engine: 'ffmpeg', op: 'convert' },
  'video/video-trimmer': { engine: 'ffmpeg', op: 'trim' },
  'video/video-compressor': { engine: 'ffmpeg', op: 'compress' },
  'video/video-cropper': {
    engine: 'ffmpeg',
    op: 'crop',
    translate: (settings) => {
      const size = (settings.size ?? {}) as { width?: number; height?: number }
      return {
        ratio: settings.ratio ?? 'free',
        center: settings.center !== false,
        width: Number(size.width) || 640,
        height: Number(size.height) || 640,
      }
    },
  },
  'video/video-resizer': {
    engine: 'ffmpeg',
    op: 'resize',
    translate: (settings) => {
      const size = (settings.size ?? {}) as { width?: number; height?: number }
      return {
        width: Number(size.width) || 1080,
        height: Number(size.height) || 1920,
        fit: settings.fit ?? 'contain',
        padColor: settings.padColor ?? '#000000',
      }
    },
  },
  'video/video-rotator': { engine: 'ffmpeg', op: 'rotate' },
  'video/video-speed': { engine: 'ffmpeg', op: 'speed' },
  'video/video-volume': { engine: 'ffmpeg', op: 'volume' },
  'video/video-watermark': { engine: 'ffmpeg', op: 'watermark' },
  'video/video-merger': { engine: 'ffmpeg', op: 'merge', combine: true },
  'video/video-thumbnails': { engine: 'ffmpeg', op: 'thumbnails' },
  'video/video-to-audio': { engine: 'ffmpeg', op: 'to-audio' },
  'video/video-subtitles': { engine: 'ffmpeg', op: 'subtitles' },
  'video/video-to-webp': { engine: 'ffmpeg', op: 'to-gif', fixed: { format: 'webp' } },

  // audio
  'audio/audio-converter': { engine: 'audio', op: 'convert' },
  'audio/audio-trimmer': { engine: 'audio', op: 'trim', fixed: { format: 'mp3' } },
  'audio/audio-merger': { engine: 'audio', op: 'merge', combine: true },
  'audio/audio-normalizer': { engine: 'audio', op: 'normalize' },
  'audio/audio-volume-booster': { engine: 'audio', op: 'boost' },
  'audio/audio-speed-pitch': { engine: 'audio', op: 'speed-pitch' },
  'audio/audio-reverser': { engine: 'audio', op: 'reverse' },
  'audio/silence-remover': { engine: 'audio', op: 'silence-remove' },
  'audio/waveform-viewer': { engine: 'audio', op: 'waveform' },
  'audio/id3-editor': { engine: 'audio', op: 'id3' },
  'audio/ringtone-maker': { engine: 'ffmpeg', op: 'ringtone' },
}

export const getToolOp = (toolRef: string): OpBinding | undefined => {
  const exact = TOOL_OPS[toolRef]
  if (exact) return exact

  // Generated families share an engine op with fixed params.
  // e.g. resize/resize-image-to-512x512 → the resize op at 512×512, cover.
  const fixedSize = /^resize\/resize-image-to-(\d+)x(\d+)$/.exec(toolRef)
  if (fixedSize) {
    const width = Number(fixedSize[1])
    const height = Number(fixedSize[2])
    if (width > 0 && height > 0) {
      return {
        engine: 'vips',
        op: 'resize',
        fixed: { mode: 'dimensions', width, height, fit: 'cover', format: 'auto' },
      }
    }
  }

  // compress/compress-to-100kb · compress-to-1mb → target-size search.
  const target = /^compress\/compress-to-(\d+)(kb|mb)$/.exec(toolRef)
  if (target) {
    const amount = Number(target[1])
    const targetKb = target[2] === 'mb' ? amount * 1000 : amount
    if (targetKb > 0) {
      return {
        engine: 'vips',
        op: 'compress',
        fixed: { mode: 'target-size', targetKb, strategy: 'quality-first' },
      }
    }
  }

  // gif/compress-gif-to-256kb → the GIF target-size ladder.
  const gifTarget = /^gif\/compress-gif-to-(\d+)(kb|mb)$/.exec(toolRef)
  if (gifTarget) {
    const amount = Number(gifTarget[1])
    const targetKb = gifTarget[2] === 'mb' ? amount * 1000 : amount
    if (targetKb > 0) {
      return {
        engine: 'gif',
        op: 'compress',
        translate: (settings) => ({
          targetKb,
          scale: 100,
          dropFrames: 1,
          optimizePalette: settings.optimizePalette !== 'per-frame',
        }),
      }
    }
  }

  return undefined
}

/* ------------------------------------------------------------------ */
/* input acceptance                                                    */
/* ------------------------------------------------------------------ */

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
}

export const MEDIA_EXTENSIONS = new Set(Object.keys(EXTENSION_TYPES))

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : ''
}

export function typeForName(name: string): string {
  return EXTENSION_TYPES[extensionOf(name)] ?? 'application/octet-stream'
}

/** Does this file satisfy a tool's `accepts` list? */
export function fileMatchesTool(accepts: string[], file: File): boolean {
  const extension = extensionOf(file.name)
  const type = file.type || typeForName(file.name)
  return accepts.some((accept) => {
    if (accept === '*/*' || accept === '*') return true
    if (accept.startsWith('.')) return extension === accept.slice(1).toLowerCase()
    if (accept.endsWith('/*')) return type.startsWith(accept.slice(0, -1))
    return type === accept
  })
}
