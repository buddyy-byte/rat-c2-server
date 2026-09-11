import * as React from 'react'
import { Toaster } from 'sonner'
import { Routes, Route, Navigate } from 'react-router-dom'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { AgentDetailPage } from '@/pages/AgentDetailPage'
import { PayloadBuilderPage } from '@/pages/PayloadBuilderPage'
import { ShellPage } from '@/pages/ShellPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { RegisteredUsersPage } from '@/pages/RegisteredUsersPage'
import { LateralPage } from '@/pages/LateralPage'
import { EvasionPage } from '@/pages/EvasionPage'
import { ModulesPage } from '@/pages/ModulesPage'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { useTheme } from '@/hooks/useTheme'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const collapsed = useUIStore(s => s.sidebarCollapsed)
  const density = useUIStore(s => s.density)
  const pad = density === 'compact' ? 'p-3 md:p-4' : density === 'spacious' ? 'p-6 md:p-10' : 'p-4 md:p-6 lg:p-8'
  React.useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '5rem' : '16rem')
  }, [collapsed])
  return (
    <GradientBackground>
      <div className="min-h-screen">
        <Sidebar />
        <div
          className="min-h-screen flex flex-col transition-[margin-left] duration-300"
          style={{ marginLeft: 'var(--sidebar-w, 16rem)' }}
        >
          <Header />
          <main className={cn('flex-1 overflow-auto min-w-0', pad)}>
            {children}
          </main>
        </div>
      </div>
    </GradientBackground>
  )
}

function ThemeBoot() {
  const theme = useTheme(s => s.theme)
  const density = useUIStore(s => s.density)
  const mono = useUIStore(s => s.monoFont)
  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('light', theme === 'light')
    root.dataset.theme = theme
    root.dataset.density = density
    root.dataset.mono = mono
  }, [theme, density, mono])
  return null
}

export function App() {
  const { token, checkAuth } = useAuthStore()
  const { connectWS } = useAgentStore()
  const theme = useTheme(s => s.theme)

  React.useEffect(() => {
    checkAuth()
    if (token) connectWS()
  }, [token, checkAuth, connectWS])

  return (
    <>
      <ThemeBoot />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/agents" element={<AgentsPage />} />
                  <Route path="/agents/:id" element={<AgentDetailPage />} />
                  <Route path="/payloads" element={<PayloadBuilderPage />} />
                  <Route path="/users" element={<RegisteredUsersPage />} />
                  <Route path="/users/:id" element={<RegisteredUsersPage />} />
                  <Route path="/lateral" element={<LateralPage />} />
                  <Route path="/evasion" element={<EvasionPage />} />
                  <Route path="/modules" element={<ModulesPage />} />
                  <Route path="/shell/:agentId" element={<ShellPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </AppLayout>
            </PrivateRoute>
          }
        />
      </Routes>
      <Toaster position="top-right" theme={theme === 'light' ? 'light' : 'dark'} className="bg-dark-900 border-dark-700" />
    </>
  )
}
