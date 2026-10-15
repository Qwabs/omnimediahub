import { Route, Routes } from 'react-router'
import { AppShell } from './layout/AppShell'
import { HomePage } from '@/pages/HomePage'
import { ToolsIndexPage } from '@/pages/ToolsIndexPage'
import { CategoryPage } from '@/pages/CategoryPage'
import { ToolPage } from '@/pages/ToolPage'
import { ScenesPage, ScenePage } from '@/pages/ScenesPage'
import { ConsolePage } from '@/pages/ConsolePage'
import { SimplePage } from '@/pages/SimplePage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tools" element={<ToolsIndexPage />} />
        <Route path="/tools/:category" element={<CategoryPage />} />
        <Route path="/tools/:category/:slug" element={<ToolPage />} />
        <Route path="/scenes" element={<ScenesPage />} />
        <Route path="/scenes/:slug" element={<ScenePage />} />
        <Route path="/console" element={<ConsolePage />} />
        <Route path="/about" element={<SimplePage kind="about" />} />
        <Route path="/privacy" element={<SimplePage kind="privacy" />} />
        <Route path="/terms" element={<SimplePage kind="terms" />} />
        <Route path="/contact" element={<SimplePage kind="contact" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}
