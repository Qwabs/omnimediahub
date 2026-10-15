import { useEffect } from 'react'

/**
 * Keep document title/description in sync during SPA navigation.
 * Static HTML already carries these tags (baked at prerender time).
 */
export function useSeo(meta?: { title: string; description: string }) {
  const title = meta?.title
  const description = meta?.description

  useEffect(() => {
    if (title) document.title = title
    if (description) {
      let el = document.querySelector('meta[name="description"]')
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('name', 'description')
        document.head.appendChild(el)
      }
      el.setAttribute('content', description)
    }
  }, [title, description])
}
