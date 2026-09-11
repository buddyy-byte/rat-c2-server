import * as React from "react"
import { motion } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAgentStore } from '@/stores/agentStore'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import {
  Monitor,
  Zap,
  Shield,
  Network,
  Bug,
  Database,
  TrendingUp,
  Activity,
  Loader2,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Box,
  Settings,
} from "lucide-react"
import { formatDistanceToNow } from 'date-fns'

const statCards = [
  { name: 'Active Agents', value: '0', icon: Monitor, color: 'text-accent-400', bg: 'bg-accent-500/10' },
  { name: 'Total Agents', value: '0', icon: Database, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { name: 'Pending Tasks', value: '0', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { name: 'Completed Today', value: '0', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
]

const quickActions = [
  { name: 'Build Payload', href: '/payloads', icon: Box, description: 'Create new agent payloads' },
  { name: 'Manage Agents', href: '/agents', icon: Monitor, description: 'View and control agents' },
  { name: 'Lateral Movement', href: '/agents', icon: Network, description: 'Network pivoting & scanning' },
  { name: 'Evasion Techniques', href: '/agents', icon: Shield, description: 'AV/EDR bypass methods' },
  { name: 'Module Library', href: '/agents', icon: Bug, description: 'Load/unload capability modules' },
  { name: 'Settings', href: '/settings', icon: Settings, description: 'Configure C2 server' },
]

export function DashboardPage() {
  const { agents, fetchAgents, loading, wsConnected } = useAgentStore()
  const { user } = useAuthStore()

  const [stats, setStats] = React.useState({ pending: 0, completed: 0 })
  React.useEffect(() => {
    fetchAgents()
    const interval = setInterval(() => fetchAgents(), 10000)
    const pull = () => api.getStats().then(s => setStats({ pending: s.pending_tasks, completed: s.completed_today })).catch(() => {})
    pull()
    const st = setInterval(pull, 10000)
    return () => { clearInterval(interval); clearInterval(st) }
  }, [fetchAgents])

  const activeAgents = agents.filter(a => a.Status === 'active').length
  const totalAgents = agents.length
  const recentAgents = agents.slice(0, 5)

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
            Dashboard
          </GradientText>
          <p className="text-dark-400 mt-1">Welcome back, {user?.username || 'operator'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium",
            wsConnected ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          )}>
            <span className={cn("w-2 h-2 rounded-full", wsConnected ? "bg-green-400 animate-pulse" : "bg-red-400")} />
            {wsConnected ? 'Connected' : 'Disconnected'}
          </div>
          <Button onClick={fetchAgents} disabled={loading} variant="outline" size="sm">
            <Loader2 className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 * (index + 1) }}
          >
            <Card className="card-hover relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-accent-500/5 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
              <CardContent className="relative p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-dark-400 mb-1">{stat.name}</p>
                    <p className="text-3xl font-bold font-mono tabular-nums" id={`stat-${stat.name.toLowerCase().replace(' ', '-')}`}>
                      {stat.name === 'Active Agents' ? activeAgents : stat.name === 'Total Agents' ? totalAgents : stat.name === 'Pending Tasks' ? stats.pending : stats.completed}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-xl", stat.bg)}>
                    <stat.icon className={cn("w-6 h-6", stat.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions & Recent Agents */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Quick Actions */}
        <motion.div className="lg:col-span-1">
          <Card className="card-hover h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent-400" />
                Quick Actions
              </CardTitle>
              <CardDescription>Common operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {quickActions.map((action, index) => (
                <motion.button
                  key={action.name}
                  onClick={() => window.location.href = action.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * index }}
                  className="w-full text-left p-3 rounded-lg bg-dark-800/50 border border-dark-700 hover:border-accent-500/30 hover:bg-dark-800 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent-500/10 rounded-lg text-accent-400 group-hover:bg-accent-500/20 transition-colors">
                      <action.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark-100 truncate">{action.name}</p>
                      <p className="text-xs text-dark-500 truncate">{action.description}</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Agents */}
        <motion.div className="lg:col-span-2">
          <Card className="card-hover">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-accent-400" />
                    Recent Agents
                  </CardTitle>
                  <CardDescription>Latest connected agents</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => window.location.href = '/agents'}>
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentAgents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-accent-500/20 to-purple-500/20 rounded-full blur" />
                    <Monitor className="w-8 h-8 text-dark-600 relative mx-auto" />
                  </div>
                  <h3 className="text-lg font-medium text-dark-300 mb-1">No agents connected</h3>
                  <p className="text-dark-500 mb-4">Deploy a payload to get started</p>
                  <Button onClick={() => window.location.href = '/payloads'} size="lg">
                    <Plus className="w-4 h-4 mr-2" />
                    Build Payload
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentAgents.map((agent, index) => (
                    <motion.div
                      key={agent.ID}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 * index }}
                      className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-700 hover:border-accent-500/30 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          agent.Status === 'active' ? 'bg-green-500/20' : 'bg-yellow-500/20'
                        )}>
                          <Monitor className={cn("w-5 h-5", agent.Status === 'active' ? 'text-green-400' : 'text-yellow-400')} />
                        </div>
                        <div>
                          <p className="font-medium text-dark-100">{agent.Hostname}</p>
                          <p className="text-sm text-dark-400 font-mono">{agent.Username} • {agent.OS} • {agent.Arch}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          agent.Status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                        )}>
                          {agent.Status}
                        </span>
                        <span className="text-xs text-dark-500">
                          {agent.LastSeen ? formatDistanceToNow(new Date(agent.LastSeen), { addSuffix: true }) : 'Never'}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => window.location.href = `/agents/${agent.ID}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}