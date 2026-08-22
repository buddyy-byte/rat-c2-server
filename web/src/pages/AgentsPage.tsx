import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { AgentCard } from '@/components/agents/AgentCard'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Monitor, User, Key, Shield, Globe, Search, Plus, RefreshCw, ChevronLeft, ChevronRight, Home, Wifi, WifiOff, AlertTriangle, XCircle, CheckCircle, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

export function AgentsPage() {
  const { agents, selectedAgent, setSelectedAgent, fetchAgents, addNotification } = useStore()
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'stale'>('all')

  useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = async () => {
    setLoading(true)
    try {
      await fetchAgents()
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to load agents: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const filteredAgents = agents.filter((agent) => {
    if (statusFilter !== 'all' && agent.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return agent.hostname.toLowerCase().includes(q) || agent.username.toLowerCase().includes(q) || agent.external_ip.includes(q)
    }
    return true
  })

  const statusConfig = {
    online: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500', label: 'Online', border: 'border-green-500/50' },
    offline: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Offline', border: 'border-red-500/50' },
    stale: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Stale', border: 'border-yellow-500/50' },
    dead: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', label: 'Dead', border: 'border-red-500/50' },
  }

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <Monitor className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Agents
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{agents.length} total &bull; {agents.filter(a => a.status === 'online').length} online</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={loadAgents} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-dark-800/50 border-dark-700">
          <CardBody className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="all">All Status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="stale">Stale</option>
              </select>
            </div>
          </CardBody>
        </Card>

        {/* Agents Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="animate-pulse bg-dark-800/50 border-dark-700">
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-dark-900 rounded w-3/4" />
                  <div className="h-3 bg-dark-900 rounded w-1/2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-3 bg-dark-900 rounded" />
                    <div className="h-3 bg-dark-900 rounded" />
                    <div className="h-3 bg-dark-900 rounded" />
                    <div className="h-3 bg-dark-900 rounded" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : filteredAgents.length === 0 ? (
          <Card className="bg-dark-800/50 border-dark-700 text-center py-16">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
              <Monitor className="w-8 h-8 text-dark-600 relative mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-dark-300 mb-1">{searchQuery || statusFilter !== 'all' ? 'No agents match filters' : 'No agents connected'}</h3>
            <p className="text-dark-500">{searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Waiting for agents to connect...'}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {agents.length > 20 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" size="sm" disabled>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-dark-400 text-sm">Page 1 of {Math.ceil(agents.length / 20)}</span>
            <Button variant="ghost" size="sm" disabled>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </GradientBackground>
  )
}