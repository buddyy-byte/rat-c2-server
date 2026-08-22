import { useState } from 'react'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { Lock, Unlock, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

export function LoginPage() {
  const { addNotification, setConnected } = useStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return

    setLoading(true)
    try {
      await api.login(username, password)
      setConnected(true)
      addNotification({ type: 'success', message: 'Logged in successfully' })
      window.location.href = '/agents'
    } catch (error) {
      addNotification({ type: 'error', message: `Login failed: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <GradientBackground className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="relative overflow-hidden bg-dark-900/80 border-dark-700">
          <DotGrid className="absolute inset-0 opacity-10" dotSize={2} gap={20} baseColor="#0f172a" activeColor="#d946ef" proximity={100} />

          <div className="relative p-8 space-y-6">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4 rounded-2xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={10} baseColor="#0f172a" activeColor="#d946ef" proximity={60} />
                <Lock className="w-8 h-8 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                ENI C2 Dashboard
              </GradientText>
              <p className="text-dark-400 mt-2 text-sm">Sign in to access your command center</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm text-dark-400 mb-1">Username</label>
                <div className="relative">
                  <Unlock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-dark-400 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-200"
                  >
                    {showPassword ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading} size="lg">
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-dark-500">
              <p>Default: <code className="font-mono bg-dark-800 px-1 rounded">admin</code> / <code className="font-mono bg-dark-800 px-1 rounded">admin</code></p>
            </div>
          </div>
        </Card>
      </div>
    </GradientBackground>
  )
}