import * as React from "react"
import { motion } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Lock, User, Eye, EyeOff, Loader2, KeyRound, Terminal } from "lucide-react"

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [mode, setMode] = React.useState<'login' | 'recover'>('login')
  const [showPassword, setShowPassword] = React.useState(false)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [license, setLicense] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username, password)
        toast.success('Welcome back!')
      } else {
        const res = await api.recover(license, newPassword)
        useAuthStore.setState({
          token: res.token,
          isAuthenticated: true,
          user: { username: res.user.username, role: (res.user.role === 'owner' ? 'owner' : 'operator') },
        })
        toast.success('Password reset — you are signed in')
      }
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (v: string) => {
    setMode(v === 'recover' ? 'recover' : 'login')
    setShowPassword(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-accent-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-purple-600 mb-4">
              <Terminal className="w-8 h-8 text-white" />
            </div>
            <GradientText className="text-3xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>
              Chemical Umbra
            </GradientText>
            <p className="text-dark-400 mt-1">dark-room operations console</p>
          </motion.div>

          {/* Form Card */}
          <Card className="card-hover">
            <CardContent className="p-6">
              <Tabs value={mode} onValueChange={switchMode} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-dark-800/50 p-1 rounded-lg border border-dark-700 mb-6">
                  <TabsTrigger value="login" className="gap-2">
                    <Lock className="w-4 h-4" />
                    <span>Sign In</span>
                  </TabsTrigger>
                  <TabsTrigger value="recover" className="gap-2">
                    <KeyRound className="w-4 h-4" />
                    <span>Recover</span>
                  </TabsTrigger>
                </TabsList>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'login' ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                          <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                            className="pl-10"
                            required
                            autoComplete="username"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            className="pl-10 pr-10"
                            required
                            autoComplete="current-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="license">License key</Label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                          <Input
                            id="license"
                            value={license}
                            onChange={(e) => setLicense(e.target.value)}
                            placeholder="UMBRA-XXXX-XXXX-XXXX-XXXX-XXXX"
                            className="pl-10 font-mono"
                            required
                          />
                        </div>
                        <p className="text-xs text-dark-500">The key you saved after paying. It resets the password on the account it is bound to.</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                          <Input
                            id="newPassword"
                            type={showPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="min 8 characters"
                            className="pl-10 pr-10"
                            required
                            minLength={8}
                            autoComplete="new-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        {mode === 'login' ? 'Signing In...' : 'Resetting...'}
                      </>
                    ) : mode === 'login' ? (
                      <>
                        <Lock className="w-5 h-5 mr-2" />
                        Sign In
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-5 h-5 mr-2" />
                        Reset &amp; Sign In
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-dark-400">
                    {mode === 'login' ? 'Lost your password?' : "Got your credentials?"}{' '}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-accent-400 hover:text-accent-300 p-0"
                      onClick={() => switchMode(mode === 'login' ? 'recover' : 'login')}
                    >
                      {mode === 'login' ? 'Recover with key' : 'Sign In'}
                    </Button>
                  </p>
                </div>
              </Tabs>

              <p className="mt-6 text-xs text-dark-500 text-center">Seats are sold on the landing page — accounts are created there with your license key.</p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  )
}
