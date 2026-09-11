import * as React from 'react'
import { Link, useLocation, NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Monitor, Box, Terminal, Settings, Shield, Network, Bug,
  ChevronLeft, ChevronRight, Zap, Users,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { useUIStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/Button'
import { GradientText } from '@/components/ui/GradientText'
import { api } from '@/services/api'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Agents', href: '/agents', icon: Monitor },
  { name: 'Payload Builder', href: '/payloads', icon: Box },
  { name: 'Registered Users', href: '/users', icon: Users, ownerOnly: true },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const advanced = [
  { name: 'Lateral Movement', href: '/lateral', icon: Network },
  { name: 'Evasion', href: '/evasion', icon: Shield },
  { name: 'Modules', href: '/modules', icon: Bug },
]

function fmtUptime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function Sidebar() {
  const location = useLocation()
  const { logout, user } = useAuthStore()
  const { agents, fetchAgents } = useAgentStore()
  const collapsed = useUIStore(s => s.sidebarCollapsed)
  const toggle = useUIStore(s => s.toggleSidebar)
  const startedAt = useUIStore(s => s.startedAt)
  const isOwner = (user?.role === 'owner') || (user?.username || '').toLowerCase() === 'chemical'
  const items = navigation.filter(item => !('ownerOnly' in item && item.ownerOnly) || isOwner)
  const [pending, setPending] = React.useState(0)
  const [serverUptime, setServerUptime] = React.useState(0)
  const [now, setNow] = React.useState(Date.now())

  React.useEffect(() => {
    fetchAgents()
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(async () => {
      try {
        const s = await api.getStats()
        setPending(s.pending_tasks || 0)
        setServerUptime(s.uptime_ms || 0)
      } catch { /* ignore */ }
    }, 8000)
    api.getStats().then(s => {
      setPending(s.pending_tasks || 0)
      setServerUptime(s.uptime_ms || 0)
    }).catch(() => {})
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [fetchAgents])

  const active = agents.filter(a => a.Status === 'active').length
  const uptime = serverUptime > 0 ? serverUptime : (now - startedAt)

  const linkClass = (active: boolean, disabled?: boolean) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
      active
        ? 'bg-gradient-to-r from-accent-500/10 to-purple-500/10 text-accent-400 border border-accent-500/20 shadow-glow'
        : 'text-dark-300 hover:bg-dark-800 hover:text-white',
      disabled && 'opacity-50 pointer-events-none',
      collapsed && 'justify-center px-0'
    )

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col bg-dark-900/95 backdrop-blur-xl border-r border-dark-700 transition-[width] duration-300 overflow-hidden',
        collapsed ? 'w-20' : 'w-64'
      )}
      style={{ width: 'var(--sidebar-w, 16rem)' }}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-dark-700 shrink-0">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-dark-900 border border-dark-700 shrink-0">
            <Zap className="w-5 h-5 text-accent-400" />
          </div>
          {!collapsed && (
            <GradientText className="font-bold text-lg truncate" colors={['#fff', '#d946ef', '#a855f7']}>
              Chemical Umbra
            </GradientText>
          )}
        </Link>
        <Button variant="ghost" size="icon" onClick={toggle} className="text-dark-400 hover:text-accent-400 shrink-0">
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </Button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
        {!collapsed && <div className="px-3 py-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">Main</div>}
        {items.map((item) => (
          <NavLink key={item.name} to={item.href} end={item.href === '/'} className={({ isActive }) => linkClass(isActive)} title={item.name}>
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </NavLink>
        ))}

        {!collapsed && <div className="h-px bg-dark-700 my-2" />}
        {!collapsed && <div className="px-3 py-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">Operations</div>}
        {advanced.map((item) => (
          <NavLink key={item.name} to={item.href} className={({ isActive }) => linkClass(isActive)} title={item.name}>
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </NavLink>
        ))}

        <NavLink
          to={agents[0] ? `/shell/${agents[0].ID}` : '/agents'}
          className={({ isActive }) => linkClass(isActive, agents.length === 0)}
          title="Shell"
        >
          <Terminal className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Shell</span>}
        </NavLink>

        {!collapsed && (
          <div className="mt-6 pt-4 border-t border-dark-700">
            <div className="px-3 py-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">Live</div>
            <div className="px-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Active Agents</span>
                <span className="font-mono text-accent-400">{active}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Pending Tasks</span>
                <span className="font-mono text-yellow-400">{pending}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Uptime</span>
                <span className="font-mono text-green-400">{fmtUptime(uptime)}</span>
              </div>
            </div>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-dark-700 shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 shrink-0">
              <div className="flex items-center justify-center w-full h-full rounded-full bg-dark-800 border border-dark-700">
                <Users className="w-4 h-4 text-accent-400" />
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border-2 border-dark-900" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark-100 truncate">{user?.username || 'operator'}</p>
              <p className="text-xs text-dark-500 truncate">{isOwner ? 'Owner' : 'Operator'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-dark-400 hover:text-red-400">
              <span className="sr-only">logout</span>
              ×
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={logout} className="text-dark-400 hover:text-red-400 mx-auto" title="Logout">
            ×
          </Button>
        )}
      </div>
    </aside>
  )
}
