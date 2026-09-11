import * as React from "react"
import { motion } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Switch } from '@/components/ui/Switch'
import { Label } from '@/components/ui/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/hooks/useTheme'
import { toast } from 'sonner'
import {
  User,
  Lock,
  Bell,
  Palette,
  Monitor,
  Sun,
  Moon,
  Save,
  Loader2,
  Shield,
  Key,
  Terminal,
  Globe,
  Settings,
  Mail,
  Copy,
  Trash2,
  Plus,
  Check,
} from "lucide-react"
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const { user, updateProfile, changePassword, loading } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = React.useState('profile')
  const [profileData, setProfileData] = React.useState({ username: '', email: '' })
  const [passwordData, setPasswordData] = React.useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (user) {
      setProfileData({ username: user.username, email: user.email || '' })
    }
  }, [user])

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(profileData.username, profileData.email)
      toast.success('Profile updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordData.new !== passwordData.confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (passwordData.new.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      await changePassword(passwordData.current, passwordData.new)
      toast.success('Password changed')
      setPasswordData({ current: '', new: '', confirm: '' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto px-4 py-8"
      >
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center">
              <Settings className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Settings</h1>
              <p className="text-dark-400">Manage your account, preferences, and security</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-dark-800/50 p-1 rounded-lg border border-dark-700 mb-6">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" />
              <span>Profile</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Lock className="w-4 h-4" />
              <span>Security</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="w-4 h-4" />
              <span>Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              <span>Notifications</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-accent-400" />
                  Profile Information
                </CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                        <Input
                          id="username"
                          value={profileData.username}
                          onChange={(e) => setProfileData(prev => ({ ...prev, username: e.target.value }))}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                        <Input
                          id="email"
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                          className="pl-10"
                          placeholder="you@domain.com"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={user?.bio || ''}
                      onChange={(e) => { /* bio update */ }}
                      placeholder="Tell us about yourself..."
                      className="bg-dark-800 border-dark-700"
                      rows={3}
                    />
                  </div>
                  <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* API Keys */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-accent-400" />
                  API Keys
                </CardTitle>
                <CardDescription>Manage your API keys for integrations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-dark-800/50 rounded-lg border border-dark-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center">
                        <Key className="w-5 h-5 text-accent-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">Default API Key</p>
                        <p className="text-xs text-dark-400 font-mono">ratc2_••••••••••••••••</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm"><Copy className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm"><Settings className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full sm:w-auto gap-2">
                    <Plus className="w-4 h-4" />
                    Generate New Key
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-accent-400" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your password to keep your account secure</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                      <Input
                        id="currentPassword"
                        type="password"
                        value={passwordData.current}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, current: e.target.value }))}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                      <Input
                        id="newPassword"
                        type="password"
                        value={passwordData.new}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, new: e.target.value }))}
                        className="pl-10"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={passwordData.confirm}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, confirm: e.target.value }))}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        Change Password
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-accent-400" />
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>Add an extra layer of security to your account</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">Authenticator App</p>
                    <p className="text-sm text-dark-400">Use Google Authenticator, Authy, or similar</p>
                  </div>
                  <Button variant="outline" className="gap-2">
                    <Shield className="w-4 h-4" />
                    Enable 2FA
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-accent-400" />
                  Session Management
                </CardTitle>
                <CardDescription>View and manage your active sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-dark-800/50 rounded-lg border border-dark-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">Current Session</p>
                        <p className="text-xs text-dark-400">Windows • Chrome • Active now</p>
                      </div>
                    </div>
                    <span className="text-xs text-green-400 px-2 py-1 rounded-full bg-green-500/10">Current</span>
                  </div>
                  <Button variant="ghost" className="w-full justify-start text-red-400 hover:text-red-300 gap-2">
                    <Trash2 className="w-4 h-4" />
                    Revoke All Other Sessions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-accent-400" />
                  Theme
                </CardTitle>
                <CardDescription>Choose your preferred color scheme</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    className="h-32 flex-col gap-3 p-6 text-left"
                    onClick={() => toggleTheme()}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-dark-900 to-dark-800 border border-dark-700 flex items-center justify-center">
                        <Moon className="w-6 h-6 text-yellow-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">Dark</p>
                        <p className="text-xs text-dark-400">Easy on the eyes</p>
                      </div>
                    </div>
                    {theme === 'dark' && <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>}
                  </Button>
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    className="h-32 flex-col gap-3 p-6 text-left relative"
                    onClick={() => toggleTheme()}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 flex items-center justify-center">
                        <Sun className="w-6 h-6 text-orange-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">Light</p>
                        <p className="text-xs text-dark-400">Clean and bright</p>
                      </div>
                    </div>
                    {theme === 'light' && <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-accent-400" />
                  Density
                </CardTitle>
                <CardDescription>Adjust the spacing and density of the interface</CardDescription>
              </CardHeader>
              <CardContent>
                <Select defaultValue="comfortable" onValueChange={(v) => { /* density */ }}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Select density" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="spacious">Spacious</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-accent-400" />
                  Terminal Font
                </CardTitle>
                <CardDescription>Choose your preferred monospace font for terminals</CardDescription>
              </CardHeader>
              <CardContent>
                <Select defaultValue="jetbrains" onValueChange={(v) => { /* font */ }}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Select font" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jetbrains">JetBrains Mono</SelectItem>
                    <SelectItem value="fira">Fira Code</SelectItem>
                    <SelectItem value="cascadia">Cascadia Code</SelectItem>
                    <SelectItem value="monospace">System Monospace</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6 animate-in fade-in-0 duration-200">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-accent-400" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>Configure how you receive notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { id: 'agent_online', label: 'Agent Comes Online', desc: 'Notify when a new agent connects' },
                  { id: 'agent_offline', label: 'Agent Goes Offline', desc: 'Notify when an agent disconnects' },
                  { id: 'command_complete', label: 'Command Complete', desc: 'Notify when long-running commands finish' },
                  { id: 'file_transfer', label: 'File Transfers', desc: 'Notify on upload/download completion' },
                  { id: 'screenshot', label: 'Screenshots', desc: 'Notify when screenshots are captured' },
                  { id: 'security_alerts', label: 'Security Alerts', desc: 'Critical security notifications' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-dark-800/50 rounded-lg border border-dark-700">
                    <div>
                      <p className="font-medium text-white">{item.label}</p>
                      <p className="text-sm text-dark-400">{item.desc}</p>
                    </div>
                    <Switch checked={true} onCheckedChange={() => {}} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-accent-400" />
                  Webhook Integrations
                </CardTitle>
                <CardDescription>Send notifications to external services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {['Discord', 'Slack', 'Telegram', 'Email', 'Webhook'].map((service) => (
                    <div key={service} className="flex items-center justify-between p-4 bg-dark-800/50 rounded-lg border border-dark-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-accent-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{service}</p>
                          <p className="text-xs text-dark-400">Not configured</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Configure</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}