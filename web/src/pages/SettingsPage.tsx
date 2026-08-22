import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { useStore } from '@/stores/useStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Moon, Sun, Save, Palette } from 'lucide-react'

export function SettingsPage() {
  const { theme, toggleTheme, sidebarOpen, toggleSidebar } = useStore()

  return (
    <GradientBackground>
      <div className="p-6 space-y-6 max-w-2xl">
        <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
          Settings
        </GradientText>

        <Card className="bg-dark-800/50 border-dark-700">
          <CardHeader>
            <h3 className="font-medium text-dark-100 flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Appearance
            </h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-dark-100">Theme</p>
                <p className="text-sm text-dark-500">Choose your preferred color scheme</p>
              </div>
              <Button variant="outline" onClick={toggleTheme} className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                {theme === 'dark' ? 'Dark' : 'Light'}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-dark-100">Sidebar</p>
                <p className="text-sm text-dark-500">Default sidebar state on load</p>
              </div>
              <Button variant="outline" onClick={toggleSidebar} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded border-2 border-dark-600 ${sidebarOpen ? 'bg-accent-500 border-accent-500' : ''}`} />
                {sidebarOpen ? 'Expanded' : 'Collapsed'}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-dark-800/50 border-dark-700">
          <CardHeader>
            <h3 className="font-medium text-dark-100 flex items-center gap-2">
              <Save className="w-5 h-5" />
              Connection
            </h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="block text-sm text-dark-400 mb-1">C2 Server URL</label>
              <Input
                placeholder="wss://your-c2-server.com"
                value={localStorage.getItem('c2_url') || ''}
                onChange={(e) => localStorage.setItem('c2_url', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-dark-400 mb-1">API Base URL</label>
              <Input
                placeholder="https://your-c2-server.com/api"
                value={localStorage.getItem('api_url') || ''}
                onChange={(e) => localStorage.setItem('api_url', e.target.value)}
              />
            </div>
          </CardBody>
        </Card>

        <Card className="bg-dark-800/50 border-dark-700">
          <CardHeader>
            <h3 className="font-medium text-dark-100 flex items-center gap-2">
              <Save className="w-5 h-5" />
              About
            </h3>
          </CardHeader>
          <CardBody className="space-y-2 text-dark-400 text-sm">
            <p>ENI C2 Dashboard v2.0</p>
            <p>Built with React 18, TypeScript, Vite, Tailwind CSS</p>
            <p>Visual effects inspired by reactbits.dev</p>
          </CardBody>
        </Card>
      </div>
    </GradientBackground>
  )
}