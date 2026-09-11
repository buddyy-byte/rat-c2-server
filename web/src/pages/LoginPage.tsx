import * as React from "react"
import { motion } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Lock, User, Mail, Eye, EyeOff, Loader2, CheckCircle, AlertCircle, Key, Shield, Terminal } from "lucide-react"
import { cn } from '@/lib/utils'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [isRegister, setIsRegister] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(username, password, isRegister, email)
      toast.success(isRegister ? 'Account created!' : 'Welcome back!')
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
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
              <Tabs value={isRegister ? 'register' : 'login'} onValueChange={v => setIsRegister(v === 'register')} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-dark-800/50 p-1 rounded-lg border border-dark-700 mb-6">
                  <TabsTrigger value="login" className="gap-2">
                    <Lock className="w-4 h-4" />
                    <span>Sign In</span>
                  </TabsTrigger>
                  <TabsTrigger value="register" className="gap-2">
                    <User className="w-4 h-4" />
                    <span>Register</span>
                  </TabsTrigger>
                </TabsList>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {isRegister && (
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@domain.com"
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                  )}

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
                        autoComplete={isRegister ? 'new-password' : 'username'}
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
                        autoComplete={isRegister ? 'new-password' : 'current-password'}
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

                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        {isRegister ? 'Creating Account...' : 'Signing In...'}
                      </>
                    ) : isRegister ? (
                      <>
                        <User className="w-5 h-5 mr-2" />
                        Create Account
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5 mr-2" />
                        Sign In
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-dark-400">
                    {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-accent-400 hover:text-accent-300 p-0"
                      onClick={() => setIsRegister(!isRegister)}
                    >
                      {isRegister ? 'Sign In' : 'Register'}
                    </Button>
                  </p>
                </div>
              </Tabs>

              <p className="mt-6 text-xs text-dark-500 text-center">Operator login is private. Register creates extra operators.</p>
            </CardContent>
          </Card>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-8 grid grid-cols-3 gap-4 text-center"
          >
            <div className="p-4 bg-dark-800/50 rounded-xl border border-dark-700">
              <Shield className="w-6 h-6 text-accent-400 mx-auto mb-2" />
              <p className="text-xs text-dark-400">Evasion Techniques</p>
            </div>
            <div className="p-4 bg-dark-800/50 rounded-xl border border-dark-700">
              <Key className="w-6 h-6 text-accent-400 mx-auto mb-2" />
              <p className="text-xs text-dark-400">Encrypted Comms</p>
            </div>
            <div className="p-4 bg-dark-800/50 rounded-xl border border-dark-700">
              <Terminal className="w-6 h-6 text-accent-400 mx-auto mb-2" />
              <p className="text-xs text-dark-400">Full Control</p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}