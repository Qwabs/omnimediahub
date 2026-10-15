import type { ToolDef } from './types'

export const aiTools: ToolDef[] = [
  {
    slug: 'remove-background',
    category: 'ai',
    title: 'Background remover',
    description:
      'Remove the background from portraits, products and passport photos with an on-device AI model. Batch, no upload.',
    engine: 'ai',
    accepts: ['image/*'],
    produces: 'PNG (transparent)',
    controls: [
      { kind: 'toggle', id: 'refineEdges', label: 'Refine edges (hair, fur)', default: true },
      { kind: 'color', id: 'background', label: 'Replace background (leave empty for transparent)', default: '' },
    ],
    howTo: [
      'Drop your photos — the first run downloads a ~25MB model once, then it stays cached.',
      'The engine segments the subject on your device, using WebGPU when the browser offers it.',
      'Transparent PNGs come back at full resolution; batch as many as you like.',
      'The console reports which runtime and what was detected.',
    ],
    chainable: true,
    status: 'live',
    ai: { model: 'MODNet (quantized)', bytes: 25_000_000, runtime: 'webgpu' },
    faq: [
      {
        q: 'Do I need to upload my photos for AI processing?',
        a: 'No. The model downloads once to your device (like a web page), then inference runs entirely on your hardware. Your images never leave the browser.',
      },
      {
        q: 'Which subjects work best?',
        a: 'MODNet is trained on people and products — portraits, headshots, clothing and object shots come out clean. Complex scenes with many overlapping objects are harder for any single model.',
      },
      {
        q: 'How fast is it?',
        a: 'On WebGPU, roughly 0.2–2 seconds per photo. Without WebGPU it falls back to WebAssembly, which is a few seconds per image.',
      },
    ],
    related: ['image-upscaler', 'remove-object'],
  },
  {
    slug: 'image-upscaler',
    category: 'ai',
    title: 'AI image upscaler',
    description:
      'Upscale photos 2× or 4× with AI super-resolution running on your device — no upload, no account, free.',
    engine: 'ai',
    accepts: ['image/*'],
    produces: 'PNG',
    controls: [
      {
        kind: 'select',
        id: 'factor',
        label: 'Scale',
        options: [
          { value: '2', label: '2× — faster, ~10MB model' },
          { value: '4', label: '4× — slower, ~45MB model' },
        ],
        default: '2',
      },
    ],
    howTo: [
      'Drop the images to enlarge.',
      'Pick 2× or 4× — models download once and stay cached.',
      'The engine hallucinates plausible detail rather than simply stretching pixels.',
      'Compare the output dimensions in the console.',
    ],
    chainable: true,
    status: 'live',
    ai: { model: 'Swin2SR (quantized)', bytes: 45_000_000, runtime: 'webgpu' },
    faq: [
      {
        q: 'How does AI upscaling differ from normal resizing?',
        a: 'Classic resizing interpolates existing pixels — the result is soft. Swin2SR was trained to predict the missing high-frequency detail, so edges and textures come back sharp.',
      },
    ],
    related: ['image-to-hd', 'remove-background'],
  },
  {
    slug: 'image-to-hd',
    category: 'ai',
    title: 'Image to HD converter',
    description:
      'Bring small images up to HD or 2K with AI — 2× for HD targets, 4× for 2K, all processed locally.',
    engine: 'ai',
    accepts: ['image/*'],
    produces: 'PNG',
    controls: [
      {
        kind: 'select',
        id: 'target',
        label: 'Target',
        options: [
          { value: '720', label: 'HD — 720p class (2×)' },
          { value: '1080', label: 'Full HD — 1080p class (2×)' },
          { value: '1440', label: '2K — 1440p class (4×)' },
        ],
        default: '1080',
      },
    ],
    howTo: [
      'Drop the image you want to bring up to HD.',
      'Choose the target class — the engine doubles or quadruples the source.',
      'Output is PNG at the upscaled size; check the console for exact dimensions.',
    ],
    chainable: true,
    status: 'live',
    ai: { model: 'Swin2SR (quantized)', bytes: 45_000_000, runtime: 'webgpu' },
    related: ['image-upscaler'],
  },
  {
    slug: 'remove-object',
    category: 'ai',
    title: 'Remove object from photo',
    description:
      'Paint over an object, person or text and the pixels are rebuilt from their surroundings — locally, in one pass.',
    engine: 'ai',
    accepts: ['image/*'],
    produces: 'PNG',
    mask: true,
    controls: [
      {
        kind: 'slider',
        id: 'brush',
        label: 'Brush size (px)',
        min: 4,
        max: 200,
        default: 40,
        hint: 'Paint over the object on the preview above, then press process.',
      },
    ],
    howTo: [
      'Drop one image — it appears in the mask editor.',
      'Paint over the object you want gone. A little overlap beyond the edges helps.',
      'Press process: masked pixels are rebuilt from the surrounding image.',
      'Download the cleaned result.',
    ],
    status: 'live',
    chainable: false,
    faq: [
      {
        q: 'How does this removal work without a model download?',
        a: 'It uses a distance-ordered fill: masked pixels are rebuilt outward from their known neighbours, then smoothed so seams vanish. That is excellent for text, watermarks, logos and thin objects, and instant — but for large objects over complex textures an AI diffusion model does better.',
      },
    ],
    related: ['remove-watermark', 'remove-background'],
  },
  {
    slug: 'remove-watermark',
    category: 'ai',
    title: 'Watermark remover',
    description:
      'Erase watermarks, logos, timestamps and stamps by painting over them — the pixels are rebuilt locally.',
    engine: 'ai',
    accepts: ['image/*'],
    produces: 'PNG',
    mask: true,
    controls: [
      {
        kind: 'slider',
        id: 'brush',
        label: 'Brush size (px)',
        min: 4,
        max: 200,
        default: 30,
        hint: 'Cover the watermark completely — including its soft edges.',
      },
    ],
    howTo: [
      'Drop the image and paint over the watermark.',
      'Keep the brush slightly wider than the mark.',
      'Process: the fill rebuilds those pixels from their surroundings.',
      'Download the cleaned image.',
    ],
    status: 'live',
    chainable: false,
    faq: [
      {
        q: 'Can it remove watermarks from any image?',
        a: 'It works best on watermarks over sky, walls, grass and other low-detail backgrounds. Over busy textures the fill is visible — in those cases a smaller brush and several passes give the best result.',
      },
      {
        q: 'Is removing watermarks legal?',
        a: 'Only remove watermarks from images you own or have the rights to edit. Stripping a photographer\u2019s or stock site\u2019s mark from licensed work is not allowed.',
      },
    ],
    related: ['remove-object'],
  },
  {
    slug: 'unpixelate-image',
    category: 'ai',
    title: 'Unpixelate image',
    description:
      'Restore pixelated or blurry images with AI — detail is reconstructed, then the result is scaled back to the original size.',
    engine: 'ai',
    accepts: ['image/*'],
    produces: 'PNG',
    controls: [
      { kind: 'slider', id: 'strength', label: 'Enhancement strength', min: 1, max: 100, default: 50 },
    ],
    howTo: [
      'Drop the pixelated or blurry image.',
      'Higher strength uses the 4× model, lower uses 2× — both then scale back to the original dimensions.',
      'Process and download: the size is unchanged, the detail is reconstructed.',
    ],
    chainable: true,
    status: 'live',
    ai: { model: 'Swin2SR (quantized)', bytes: 45_000_000, runtime: 'webgpu' },
    faq: [
      {
        q: 'Can AI really recover a pixelated image?',
        a: 'It reconstructs plausible detail, not the original data — that is gone. For mild pixelation and blur the result looks dramatically better; for heavy censoring the model invents texture that may not match reality.',
      },
    ],
    related: ['image-upscaler'],
  },
  {
    slug: 'blur-people',
    category: 'ai',
    title: 'Blur people in photos',
    description:
      'People are detected automatically, then the whole person is blurred, pixelated or covered — batch privacy protection, fully local.',
    engine: 'ai',
    accepts: ['image/*'],
    produces: 'PNG',
    controls: [
      {
        kind: 'select',
        id: 'effect',
        label: 'Effect',
        options: [
          { value: 'blur', label: 'Gaussian blur' },
          { value: 'pixelate', label: 'Pixelate' },
          { value: 'solid', label: 'Solid cover' },
        ],
        default: 'blur',
      },
      { kind: 'slider', id: 'strength', label: 'Strength', min: 1, max: 100, default: 60 },
      {
        kind: 'slider',
        id: 'threshold',
        label: 'Detection confidence',
        min: 20,
        max: 95,
        step: 5,
        default: 55,
        hint: 'Lower finds more people (and more false positives).',
      },
      { kind: 'toggle', id: 'expand', label: 'Expand the box by 15%', default: true },
      { kind: 'color', id: 'coverColor', label: 'Cover colour (solid mode)', default: '#201d1d' },
    ],
    howTo: [
      'Drop the photos — a small detector (~6MB) loads once and stays cached.',
      'Pick the effect, strength and confidence threshold.',
      'Every detected person is covered head to toe — stronger privacy than blurring just the face.',
      'The console reports how many people were found per image.',
    ],
    chainable: true,
    status: 'live',
    ai: { model: 'YOLOS-tiny (quantized)', bytes: 6_000_000, runtime: 'webgpu' },
    faq: [
      {
        q: 'Why blur the whole person instead of just the face?',
        a: 'Body shape, clothing and posture also identify people, so covering the whole detected person is the stronger privacy choice. It is also what runs reliably on-device: a face detector needs a model whose weights are not reachable offline in this build, and shipping a fake detector would be worse than shipping none.',
      },
      {
        q: 'What if someone is missed?',
        a: 'Detection needs people who are reasonably large and visible — distant crowds and heavily occluded figures can be missed. Check the output and use the blur tool for anything left uncovered.',
      },
    ],
    related: ['edit/blur-image'],
  },
]
