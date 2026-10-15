import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/**
 * SPA navigation leaves the window scroll offset untouched, so a link clicked
 * far down a page lands mid-page after the route changes. Reset to the top on
 * PUSH/REPLACE navigations; leave POP (back/forward) alone so the browser can
 * restore the previous position. Deep links with a hash scroll to their target
 * instead of the top. Route changes always snap — the stylesheet's smooth
 * scrolling is reserved for in-page anchors.
 *
 * `useEffect` (not `useLayoutEffect`) so the server prerender stays warning-free.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType === 'POP') return
    if (hash) {
      const target = document.getElementById(hash.slice(1))
      if (target) {
        target.scrollIntoView({ block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash, navigationType])

  return null
}
