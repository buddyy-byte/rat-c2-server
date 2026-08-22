import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Cpu, Search, RefreshCw, Copy, Pause, Play, X, ChevronUp, ChevronDown, MemoryStick, HardDrive } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

export function ProcessesPage() {
  const { agents, selectedAgent, processes, fetchProcesses, addNotification } = useStore()
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'cpu_percent', direction: 'desc' })

  useEffect(() => {
    if (selectedAgent) {
      loadProcesses()
    }
  }, [selectedAgent])

  const loadProcesses = async () => {
    if (!selectedAgent) return
    setLoading(true)
    try {
      await fetchProcesses(selectedAgent.id)
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to load processes: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const filtered = processes.filter((p) => {
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
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const handleAction = async (action: string, pid: number) => {
    if (!selectedAgent) return
    try {
      if (action === 'suspend') await api.suspendProcess(selectedAgent.id, pid)
      if (action === 'resume') await api.resumeProcess(selectedAgent.id, pid)
      if (action === 'kill') await api.killProcess(selectedAgent.id, pid)
      addNotification({ type: 'success', message: `Process ${action}ed` })
      loadProcesses()
    } catch (error) {
      addNotification({ type: 'error', message: `Failed: ${error}` })
    }
  }

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <Cpu className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Processes
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'} • {processes.length} total</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={loadProcesses} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <Card className="bg-dark-800/50 border-dark-700 mb-4">
          <CardBody className="p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="text"
                placeholder="Search processes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-accent-400 animate-spin mx-auto mb-2" />
                <p className="text-dark-400">Loading processes...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <Cpu className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No processes found</h3>
                <p className="text-dark-500">Refresh to load process list</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-800 bg-dark-900/50">
                      <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer hover:text-accent-400" onClick={() => handleSort('pid')}>PID <ChevronUp className="w-4 h-4 inline" /></th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer hover:text-accent-400" onClick={() => handleSort('name')}>Name <ChevronUp className="w-4 h-4 inline" /></th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">User</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer hover:text-accent-400" onClick={() => handleSort('cpu_percent')}>CPU % <ChevronUp className="w-4 h-4 inline" /></th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 cursor-pointer hover:text-accent-400" onClick={() => handleSort('memory_mb')}>Memory <ChevronUp className="w-4 h-4 inline" /></th>
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
                        <td className="px-4 py-3">
                          <span className={clsx('font-mono text-sm', proc.cpu_percent > 50 ? 'text-red-400' : proc.cpu_percent > 10 ? 'text-yellow-400' : 'text-green-400')}>
                            {proc.cpu_percent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-dark-400 font-mono text-sm">{proc.memory_mb} MB</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={proc.status === 'running' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}>
                            {proc.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-dark-500 text-sm truncate max-w-xs font-mono">{proc.path || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleAction(proc.status === 'running' ? 'suspend' : 'resume', proc.pid)} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400 transition-colors" title={proc.status === 'running' ? 'Suspend' : 'Resume'}>
                              {proc.status === 'running' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button onClick={() => handleAction('kill', proc.pid)} className="p-1.5 rounded bg-dark-800 hover:bg-red-900/20 text-dark-400 hover:text-red-400 transition-colors" title="Kill">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
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
    </GradientBackground>
  )
}