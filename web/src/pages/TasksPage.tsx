import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Terminal, RefreshCw, ChevronLeft, ChevronRight, Search, Plus, Download, Upload, Trash2, Copy, Eye, Play, Pause, Zap, X, CheckCircle, AlertCircle, AlertTriangle, Clock, Keyboard, Cpu, ArrowRightLeft, Shield, Monitor } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

interface TaskStatusConfig {
  icon: any
  color: string
  bg: string
  label: string
  animate?: boolean
}

const statusConfig: Record<string, TaskStatusConfig> = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Pending' },
  running: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-500', label: 'Running', animate: true },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Failed' },
  cancelled: { icon: X, color: 'text-dark-500', bg: 'bg-dark-500', label: 'Cancelled' },
}

const typeIcons: Record<string, any> = {
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

export function TasksPage() {
  const { agents, selectedAgent, tasks, fetchTasks, addNotification } = useStore()
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all')

  useEffect(() => {
    if (selectedAgent) {
      loadTasks()
    }
  }, [selectedAgent])

  const loadTasks = async () => {
    if (!selectedAgent) return
    setLoading(true)
    try {
      await fetchTasks(selectedAgent.id)
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to load tasks: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    return true
  })

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <Terminal className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Tasks
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'} • {tasks.length} total</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={loadTasks} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-dark-800/50 border-dark-700">
          <CardBody className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </CardBody>
        </Card>

        {/* Tasks Table */}
        <Card>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-accent-400 animate-spin mx-auto mb-2" />
                <p className="text-dark-400">Loading tasks...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <Terminal className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No tasks found</h3>
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
                    {filteredTasks.map((task) => {
                      const cfg = statusConfig[task.status] || statusConfig.pending
                      const StatusIcon = cfg.icon
                      const TypeIcon = typeIcons[task.type] || Terminal
                      
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
                              <button
                                onClick={() => navigator.clipboard.writeText(task.output || task.error || '')}
                                className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400 transition-colors"
                                title="Copy"
                              >
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
    </GradientBackground>
  )
}