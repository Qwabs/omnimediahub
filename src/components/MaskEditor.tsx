import { useEffect, useRef, useState } from 'react'

/**
 * Paint-over mask editor for inpainting tools.
 *
 * The photo is shown on a canvas; strokes are drawn both as a translucent
 * preview and into a hidden white-on-transparent mask canvas. On pointer-up
 * the mask is exported as a PNG File and handed back to the workspace, which
 * stores it as the tool's asset.
 */
export function MaskEditor({
  image,
  brush,
  onMask,
}: {
  image: File
  /** Brush radius in image pixels. */
  brush: number
  onMask: (mask: File | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const paintingRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const bitmap = await createImageBitmap(image)
      const canvas = canvasRef.current
      if (!canvas || cancelled) {
        bitmap.close()
        return
      }
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(bitmap, 0, 0)
      const mask = document.createElement('canvas')
      mask.width = bitmap.width
      mask.height = bitmap.height
      maskRef.current = mask
      bitmap.close()
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [image])

  const stroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const mask = maskRef.current
    if (!canvas || !mask) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    const radius = Math.max(2, brush * scaleX)

    const maskCtx = mask.getContext('2d')
    const ctx = canvas.getContext('2d')
    if (!maskCtx || !ctx) return
    maskCtx.fillStyle = '#ffffff'
    maskCtx.beginPath()
    maskCtx.arc(x, y, radius, 0, Math.PI * 2)
    maskCtx.fill()

    ctx.fillStyle = 'rgba(255, 59, 48, 0.45)'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const commit = () => {
    const mask = maskRef.current
    if (!mask) return
    mask.toBlob((blob) => {
      if (!blob) return
      onMask(new File([blob], 'mask.png', { type: 'image/png' }))
    }, 'image/png')
  }

  const clear = () => {
    const canvas = canvasRef.current
    const mask = maskRef.current
    if (!canvas || !mask) return
    const maskCtx = mask.getContext('2d')
    const ctx = canvas.getContext('2d')
    maskCtx?.clearRect(0, 0, mask.width, mask.height)
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    void (async () => {
      const bitmap = await createImageBitmap(image)
      ctx?.drawImage(bitmap, 0, 0)
      bitmap.close()
    })()
    onMask(null)
  }

  return (
    <div className="border border-hairline" data-testid="mask-editor">
      <div className="hairline-b flex flex-wrap items-center gap-3 px-3 py-2">
        <span className="text-caption-md text-mute">
          [ paint over what should be removed · brush {Math.round(brush)}px ]
        </span>
        <button type="button" className="btn btn-secondary h-7 px-2 text-caption-md" onClick={clear}>
          [ clear ]
        </button>
      </div>
      <div className="max-h-[60vh] overflow-auto bg-surface-soft p-2">
        <canvas
          ref={canvasRef}
          data-testid="mask-canvas"
          className={`w-full cursor-crosshair touch-none ${ready ? '' : 'opacity-50'}`}
          onPointerDown={(event) => {
            paintingRef.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            stroke(event)
          }}
          onPointerMove={(event) => {
            if (paintingRef.current) stroke(event)
          }}
          onPointerUp={() => {
            paintingRef.current = false
            commit()
          }}
          onPointerLeave={() => {
            if (paintingRef.current) {
              paintingRef.current = false
              commit()
            }
          }}
        />
      </div>
    </div>
  )
}
