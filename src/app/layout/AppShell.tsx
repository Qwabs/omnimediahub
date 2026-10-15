import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { QuickSearch } from '@/components/QuickSearch'
import { Nav } from './Nav'
import { Footer } from './Footer'
import { ScrollToTop } from './ScrollToTop'
import { BackToTop } from './BackToTop'

export function AppShell({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-canvas focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <Nav onOpenSearch={() => setSearchOpen(true)} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <BackToTop />
      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
