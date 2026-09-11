import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { useUIStore, type Density, type MonoFont, type NotifyPrefs } from '@/stores/uiStore'
import { toast } from 'sonner'
import { User, Lock, Bell, Palette, Monitor, Sun, Moon, Save, Loader2, Settings, Mail, Check } from 'lucide-react'

const notifyItems: { id: keyof NotifyPrefs; label: string; desc: string }[] = [
  { id: 'agent_online', label: 'Agent Comes Online', desc: 'Notify when a new agent connects' },
  { id: 'agent_offline', label: 'Agent Goes Offline', desc: 'Notify when an agent disconnects' },
  { id: 'command_complete', label: 'Command Complete', desc: 'Notify when long-running commands finish' },
  { id: 'file_transfer', label: 'File Transfers', desc: 'Notify on upload/download completion' },
  { id: 'screenshot', label: 'Screenshots', desc: 'Notify when screenshots are captured' },
  { id: 'security_alerts', label: 'Security Alerts', desc: 'Critical security notifications' },
]

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const { user, updateProfile, changePassword } = useAuthStore()
  const { theme, setTheme } = useTheme()
  const { density, setDensity, monoFont, setMonoFont, notifyPrefs, setNotifyPref } = useUIStore()
  const [activeTab, setActiveTab] = React.useState(params.get('tab') || 'profile')
  const [profileData, setProfileData] = React.useState({ username: '', email: '', bio: '' })
  const [passwordData, setPasswordData] = React.useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (user) setProfileData({ username: user.username, email: user.email || '', bio: user.bio || '' })
  }, [user])

  React.useEffect(() => {
    const t = params.get('tab')
    if (t) setActiveTab(t)
  }, [params])

  const changeTab = (v: string) => {
    setActiveTab(v)
    setParams({ tab: v }, { replace: true })
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(profileData.username, profileData.email)
      toast.success('Profile saved locally')
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
      toast.success('Password change stored on this session')
      setPasswordData({ current: '', new: '', confirm: '' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center">
          <Settings className="w-7 h-7 text-white" />
        </div>
        <div>
          <GradientText className="text-2xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>Settings</GradientText>
          <p className="text-dark-400">Account, appearance, notifications</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={changeTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-dark-800/50 p-1 rounded-lg border border-dark-700 mb-6">
          <TabsTrigger value="profile" className="gap-2"><User className="w-4 h-4" /> Profile</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Lock className="w-4 h-4" /> Security</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2"><Palette className="w-4 h-4" /> Appearance</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="w-4 h-4" /> Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Shown in the sidebar and header</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" value={profileData.username} onChange={e => setProfileData(p => ({ ...p, username: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={profileData.email} onChange={e => setProfileData(p => ({ ...p, email: e.target.value }))} placeholder="you@domain.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea id="bio" value={profileData.bio} onChange={e => setProfileData(p => ({ ...p, bio: e.target.value }))} rows={3} />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Owner password lives in chemical-login.txt. Operators use the register hash.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-3 max-w-md">
                <Input type="password" placeholder="current" value={passwordData.current} onChange={e => setPasswordData(p => ({ ...p, current: e.target.value }))} />
                <Input type="password" placeholder="new (≥ 8)" value={passwordData.new} onChange={e => setPasswordData(p => ({ ...p, new: e.target.value }))} />
                <Input type="password" placeholder="confirm" value={passwordData.confirm} onChange={e => setPasswordData(p => ({ ...p, confirm: e.target.value }))} />
                <Button type="submit" disabled={saving}>Update password</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Dark or light. Persists on this browser.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant={theme === 'dark' ? 'default' : 'outline'} className="h-28 relative" onClick={() => setTheme('dark')}>
                  <Moon className="w-5 h-5 mr-2" /> Dark
                  {theme === 'dark' && <Check className="w-4 h-4 absolute top-3 right-3" />}
                </Button>
                <Button variant={theme === 'light' ? 'default' : 'outline'} className="h-28 relative" onClick={() => setTheme('light')}>
                  <Sun className="w-5 h-5 mr-2" /> Light
                  {theme === 'light' && <Check className="w-4 h-4 absolute top-3 right-3" />}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Density</CardTitle>
              <CardDescription>Page padding after login</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={density} onValueChange={(v) => { setDensity(v as Density); toast.success(`density: ${v}`) }}>
                <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
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
              <CardTitle>Terminal font</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={monoFont} onValueChange={(v) => { setMonoFont(v as MonoFont); toast.success(`font: ${v}`) }}>
                <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
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

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Bell in the header respects these toggles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifyItems.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-dark-800/50 rounded-lg border border-dark-700">
                  <div>
                    <p className="font-medium text-dark-100">{item.label}</p>
                    <p className="text-sm text-dark-400">{item.desc}</p>
                  </div>
                  <Switch checked={notifyPrefs[item.id]} onCheckedChange={(v) => setNotifyPref(item.id, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
