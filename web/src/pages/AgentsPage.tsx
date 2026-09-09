import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAgentStore } from '@/stores/agentStore'
import { AgentCard } from '@/components/agents/AgentCard'
import {
  Search,
  Filter,
  Plus,
  Loader2,
  Monitor,
  Wifi,
  WifiOff,
  Zap,
  Settings,
  Download,
  Upload,
  Shield,
  Bug,
  Network,
  MoreVertical,
} from "lucide-react"
import { cn } from '@/lib/utils'

export function AgentsPage() {
  const { agents, fetchAgents, loading, wsConnected, selectedAgent, setSelectedAgent } = useAgentStore()
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'idle' | 'offline'>('all')
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid')

  React.useEffect(() => {
    fetchAgents()
    const interval = setInterval(() => fetchAgents(), 15000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = 
      agent.Hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.Username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.IP.includes(searchTerm) ||
      agent.ID.includes(searchTerm)
    const matchesStatus = statusFilter === 'all' || agent.Status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.Status === 'active').length,
    idle: agents.filter(a => a.Status === 'idle').length,
    offline: agents.filter(a => a.Status === 'offline').length,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <GradientText className="text-3xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>
            Agents
          </GradientText>
          <p className="text-dark-400 mt-1">Manage and monitor connected agents</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchAgents()} disabled={loading}>
              <Loader2 className={cn("w-4 h-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">Total Agents</p>
                <p className="text-2xl font-bold font-mono tabular-nums">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">Active</p>
                <p className="text-2xl font-bold font-mono tabular-nums">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">Idle</p>
                <p className="text-2xl font-bold font-mono tabular-nums">{stats.idle}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg text-red-400">
                <WifiOff className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-dark-400">Offline</p>
                <p className="text-2xl font-bold font-mono tabular-nums">{stats.offline}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search & Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
          <Input
            placeholder="Search agents by hostname, username, IP, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMyA0LjVMNiA3LjVMOSA0LjUiIHN0cm9rZT0iIzk5OSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=')] bg-right-3 center no-repeat pr-10"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="offline">Offline</option>
          </select>
          <div className="flex items-center gap-1 border-l border-dark-700 pl-4 ml-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
              className="h-9 w-9"
            >
              <div className="grid grid-cols-2 gap-1">
                <div className="w-2 h-2 bg-accent-400 rounded" />
                <div className="w-2 h-2 bg-dark-500 rounded" />
                <div className="w-2 h-2 bg-dark-500 rounded" />
                <div className="w-2 h-2 bg-dark-500 rounded" />
              </div>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
              className="h-9 w-9"
            >
              <div className="flex flex-col gap-1">
                <div className="h-1.5 bg-accent-400 rounded w-full" />
                <div className="h-1.5 bg-dark-500 rounded w-full" />
                <div className="h-1.5 bg-dark-500 rounded w-full" />
                <div className="h-1.5 bg-dark-500 rounded w-full" />
              </div>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Agents Grid/List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <AnimatePresence mode="wait">
          {viewMode === 'grid' ? (
            <div
              key="grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {filteredAgents.map((agent, index) => (
                <motion.div
                  key={agent.ID}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <AgentCard
                    agent={agent}
                    selected={selectedAgent?.ID === agent.ID}
                    onClick={() => setSelectedAgent(agent)}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div key="list" className="space-y-3">
              {filteredAgents.map((agent, index) => (
                <motion.div
                  key={agent.ID}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <AgentCard
                    agent={agent}
                    selected={selectedAgent?.ID === agent.ID}
                    onClick={() => setSelectedAgent(agent)}
                    compact
                  />
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {filteredAgents.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="relative w-20 h-20 mx-auto mb-4">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-500/20 to-purple-500/20 rounded-full blur" />
              <Search className="w-10 h-10 text-dark-600 relative mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-dark-300 mb-1">
              {searchTerm || statusFilter !== 'all' ? 'No agents match your filters' : 'No agents connected'}
            </h3>
            <p className="text-dark-500 mb-4">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Deploy a payload to get started'}
            </p>
            {(!searchTerm && statusFilter === 'all') && (
              <Button onClick={() => window.location.href = '/payloads'} size="lg">
                <Plus className="w-4 h-4 mr-2" />
                Build Payload
              </Button>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}