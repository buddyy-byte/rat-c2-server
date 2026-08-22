import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { AgentsPage } from '@/pages/AgentsPage'
import { TasksPage } from '@/pages/TasksPage'
import { FileManagerPage } from '@/pages/FileManagerPage'
import { ShellPage } from '@/pages/ShellPage'
import { ScreenshotsPage } from '@/pages/ScreenshotsPage'
import { KeystrokesPage } from '@/pages/KeystrokesPage'
import { CredentialsPage } from '@/pages/CredentialsPage'
import { CookiesPage } from '@/pages/CookiesPage'
import { DiscordTokensPage } from '@/pages/DiscordTokensPage'
import { LateralPage } from '@/pages/LateralPage'
import { EvasionPage } from '@/pages/EvasionPage'
import { ModulesPage } from '@/pages/ModulesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { AgentDetailPage } from '@/pages/AgentDetailPage'
import { PayloadBuilderPage } from '@/pages/PayloadBuilderPage'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { useEffect } from 'react'
import { NotificationContainer } from '@/components/ui/NotificationContainer'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('auth_token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  const { setConnected, setConnectionError, connected } = useStore()

  useEffect(() => {
    const checkHealth = async () => {
      try {
        await api.getHealth()
        setConnected(true)
        setConnectionError(null)
      } catch (error) {
        setConnected(false)
        setConnectionError(error instanceof Error ? error.message : 'Connection failed')
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [setConnected, setConnectionError])

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100 font-sans antialiased">
      <NotificationContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <div className="flex">
                <Sidebar />
                <div className="flex-1 flex flex-col lg:ml-64 transition-all duration-300">
                  <Header />
                  <main className="flex-1">
                    <Routes>
                      <Route path="/agents" element={<AgentsPage />} />
                      <Route path="/agents/:id" element={<AgentDetailPage />} />
                      <Route path="/tasks" element={<TasksPage />} />
                      <Route path="/files" element={<FileManagerPage />} />
                      <Route path="/payloads" element={<PayloadBuilderPage />} />
                      <Route path="/shell" element={<ShellPage />} />
                      <Route path="/screenshots" element={<ScreenshotsPage />} />
                      <Route path="/keylogger" element={<KeystrokesPage />} />
                      <Route path="/credentials" element={<CredentialsPage />} />
                      <Route path="/cookies" element={<CookiesPage />} />
                      <Route path="/discord-tokens" element={<DiscordTokensPage />} />
                      <Route path="/lateral" element={<LateralPage />} />
                      <Route path="/evasion" element={<EvasionPage />} />
                      <Route path="/modules" element={<ModulesPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                  </main>
                </div>
              </div>
            </ProtectedRoute>
          }
        >
          <Route path="/*" element={<Navigate to="/agents" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  )
}