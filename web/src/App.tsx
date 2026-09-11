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
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GradientBackground>
      <div className="min-h-screen flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </GradientBackground>
  )
}

export function App() {
  const { token, checkAuth } = useAuthStore()
  const { connectWS } = useAgentStore()

  React.useEffect(() => {
    checkAuth()
    if (token) connectWS()
  }, [token, checkAuth, connectWS])

  return (
    <>
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
                  <Route path="/shell/:agentId" element={<ShellPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </AppLayout>
            </PrivateRoute>
          }
        />
      </Routes>
      <Toaster position="top-right" theme="dark" className="bg-dark-900 border-dark-700" />
    </>
  )
}