import { NavLink, useLocation } from 'react-router-dom'
import { useStore } from '@/stores/useStore'
import {
  LayoutDashboard,
  Users,
  Terminal,
  FileText,
  Key,
  Cookie,
  MessageSquare,
  Keyboard,
  Monitor,
  Cpu,
  ArrowRightLeft,
  ShieldAlert,
  Settings,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  Wifi,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Terminal as TerminalIcon,
  Code2,
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { path: '/agents', label: 'Agents', icon: Users },
  { path: '/tasks', label: 'Tasks', icon: Terminal },
  { path: '/files', label: 'Files', icon: FileText },
  { path: '/payloads', label: 'Payload Builder', icon: Code2 },
  { path: '/credentials', label: 'Credentials', icon: Key },
  { path: '/cookies', label: 'Cookies', icon: Cookie },
  { path: '/discord-tokens', label: 'Discord', icon: MessageSquare },
  { path: '/keystrokes', label: 'Keylogger', icon: Keyboard },
  { path: '/screenshots', label: 'Screenshots', icon: Monitor },
  { path: '/processes', label: 'Processes', icon: Cpu },
  { path: '/lateral', label: 'Lateral', icon: ArrowRightLeft },
  { path: '/evasion', label: 'Evasion', icon: ShieldAlert },
  { path: '/modules', label: 'Modules', icon: Settings },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, agents } = useStore()
  const location = useLocation()

  const activeAgents = agents.filter((a) => a.status === 'online').length
  const staleAgents = agents.filter((a) => a.status === 'stale').length

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-40 h-screen bg-dark-900 border-r border-dark-800 transition-all duration-300 flex flex-col',
        sidebarOpen ? 'w-64' : 'w-20'
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={clsx('p-4 border-b border-dark-800 flex items-center justify-between', !sidebarOpen && 'justify-center')}>
          <NavLink to="/agents" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-600 flex items-center justify-center">
              <TerminalIcon className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <span className="font-bold text-lg text-dark-50">RAT C2</span>
            )}
          </NavLink>
          {sidebarOpen && (
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Connection Status */}
        <div className={clsx('p-4 border-b border-dark-800', !sidebarOpen && 'px-2')}>
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                'w-2 h-2 rounded-full transition-colors',
                activeAgents > 0 ? 'bg-green-500' : 'bg-red-500'
              )}
            />
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-dark-300 truncate">
                  {activeAgents > 0 ? 'Connected' : 'Disconnected'}
                </p>
                <p className="text-xs text-dark-500">
                  {activeAgents} active, {staleAgents} stale
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 overflow-y-auto" aria-label="Main navigation">
          <ul className="space-y-1" role="list">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path || (path !== '/agents' && location.pathname.startsWith(path))
              return (
                <li key={path}>
                  <NavLink
                    to={path}
                    className={clsx(
                      sidebarOpen ? 'sidebar-link' : 'sidebar-link justify-center px-2',
                      isActive && sidebarOpen ? 'sidebar-link-active' : '',
                      isActive && !sidebarOpen && 'bg-accent-900/20 text-accent-400'
                    )}
                    title={sidebarOpen ? undefined : label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    {sidebarOpen && <span>{label}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className={clsx('p-4 border-t border-dark-800', !sidebarOpen && 'px-2')}>
          {sidebarOpen && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-dark-400">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span>Server Online</span>
              </div>
              <div className="flex items-center gap-2 text-dark-400">
                <ShieldAlert className="w-3 h-3 text-yellow-500" />
                <span>Evasion Ready</span>
              </div>
              <div className="flex items-center gap-2 text-dark-400">
                <ArrowRightLeft className="w-3 h-3 text-blue-500" />
                <span>Lateral Enabled</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collapsed sidebar toggle */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="absolute right-[-12px] top-1/2 -translate-y-1/2 w-8 h-8 bg-dark-800 border border-dark-700 rounded-full flex items-center justify-center hover:bg-dark-700 transition-colors shadow-lg"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4 text-dark-400" />
        </button>
      )}
    </aside>
  )
}