import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RefreshCw, Plus, Trash2, Play, Pause, Settings, Zap, Shield, FileCode, Code2, Terminal } from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { useState } from 'react'

export function ModulesPage() {
  const { agents, addNotification } = useStore()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const modules = [
    { name: 'keylogger', description: 'Keystroke capture and logging', category: 'surveillance', size: '245 KB' },
    { name: 'screenshot', description: 'Screen capture and streaming', category: 'surveillance', size: '189 KB' },
    { name: 'file_manager', description: 'File system operations', category: 'utility', size: '312 KB' },
    { name: 'process_inject', description: 'Process injection and hollowing', category: 'evasion', size: '421 KB' },
    { name: 'lateral_movement', description: 'Network spreading routines', category: 'lateral', size: '567 KB' },
    { name: 'persistence', description: 'Persistence mechanisms', category: 'persistence', size: '234 KB' },
    { name: 'credential_harvest', description: 'Browser and system credentials', category: 'credential', size: '298 KB' },
    { name: 'network_scan', description: 'Network reconnaissance', category: 'recon', size: '156 KB' },
    { name: 'shell', description: 'Interactive command shell', category: 'utility', size: '89 KB' },
    { name: 'audio_capture', description: 'Microphone recording', category: 'surveillance', size: '134 KB' },
  ]

  const categoryColors = {
    surveillance: 'border-purple-500/50 text-purple-400',
    utility: 'border-blue-500/50 text-blue-400',
    evasion: 'border-red-500/50 text-red-400',
    lateral: 'border-orange-500/50 text-orange-400',
    persistence: 'border-green-500/50 text-green-400',
    credential: 'border-yellow-500/50 text-yellow-400',
    recon: 'border-cyan-500/50 text-cyan-400',
  }

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
              Modules
            </GradientText>
            <p className="text-dark-400 mt-1">Manage and deploy agent modules</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedAgent || ''}
              onChange={(e) => setSelectedAgent(e.target.value || null)}
              className="px-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="">Select Agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.hostname} ({a.status})</option>
              ))}
            </select>
            <Button variant="ghost" onClick={() => {}} disabled={loading || !selectedAgent}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {!selectedAgent ? (
          <Card className="bg-dark-800/50 border-dark-700 text-center py-12">
            <Code2 className="w-12 h-12 text-dark-600 mx-auto mb-4" />
            <p className="text-dark-400">Select an agent to manage modules</p>
            <p className="text-dark-500 text-sm mt-1">Choose an agent from the dropdown above</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((mod) => (
              <Card key={mod.name} className={`relative overflow-hidden bg-dark-800/50 border-dark-700 hover:border-accent-500/30 transition-colors ${categoryColors[mod.category as keyof typeof categoryColors] || 'border-dark-700'}`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent-500/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
                <CardBody className="p-5 relative">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <FileCode className="w-5 h-5 text-accent-400" />
                        <h4 className="font-semibold text-dark-100">{mod.name}</h4>
                      </div>
                      <Badge variant="outline" className={`${categoryColors[mod.category as keyof typeof categoryColors] || ''} text-xs capitalize`}>
                        {mod.category}
                      </Badge>
                    </div>
                    <span className="text-xs text-dark-500 font-mono">{mod.size}</span>
                  </div>
                  <p className="text-dark-400 text-sm mb-4 line-clamp-2">{mod.description}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => addNotification({ type: 'success', message: `Module ${mod.name} deployed` })}>
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Load
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {}}>
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </GradientBackground>
  )
}