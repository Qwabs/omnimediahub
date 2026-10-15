import { useEffect, useState } from 'react'

/**
 * Floating `[ ↑ top ]` control, rendered once the page is scrolled past the
 * first viewport. Clicking it scrolls to the top; the motion comes from the
 * stylesheet's `scroll-behavior`, which is itself disabled under
 * `prefers-reduced-motion`, so no motion special-casing is needed here.
 * ASCII brackets as the only iconography, per the design system.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, left: 0 })}
      className="fixed bottom-6 right-6 z-30 rounded-sm border border-hairline-strong bg-canvas px-3 py-2 text-caption-md text-mute hover:bg-surface-soft hover:text-ink"
    >
      [ ↑ top ]
    </button>
  )
}
