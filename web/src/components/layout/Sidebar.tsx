import * as React from "react"
import { Link, useLocation, NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  Monitor,
  Server,
  Box,
  Terminal,
  Settings,
  Shield,
  Network,
  Bug,
  ChevronLeft,
  ChevronRight,
  Zap,
  Database,
  FileText,
  Users,
  Activity,
  Menu,
  X,
} from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/Button"
import { GradientText } from "@/components/ui/GradientText"

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Agents', href: '/agents', icon: Monitor },
  { name: 'Payload Builder', href: '/payloads', icon: Box },
  { name: 'Registered Users', href: '/users', icon: Users, ownerOnly: true },
  { name: 'Shell', href: '/shell', icon: Terminal, disabled: true },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const [collapsed, setCollapsed] = React.useState(false)
  const { logout, user } = useAuthStore()
  const isOwner = (user?.role === 'owner') || (user?.username || '').toLowerCase() === 'chemical'
  const items = navigation.filter(item => !('ownerOnly' in item && item.ownerOnly) || isOwner)

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-dark-900/95 backdrop-blur-xl border-r border-dark-700 transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
      aria-label="Main navigation"
    >
      {/* Logo / Brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-dark-700">
        <Link to="/" className="flex items-center gap-2" aria-label="Dashboard">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="relative w-8 h-8"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent-500 to-purple-600 rounded-xl opacity-20 blur" />
            <div className="relative flex items-center justify-center w-full h-full rounded-xl bg-dark-900 border border-dark-700">
              <Zap className="w-5 h-5 text-accent-400" />
            </div>
          </motion.div>
          {!collapsed && (
            <GradientText className="font-bold text-xl" colors={['#fff', '#d946ef', '#a855f7']}>
              Chemical Umbra
            </GradientText>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("text-dark-400 hover:text-accent-400", collapsed && "rotate-180")}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin" aria-label="Navigation">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              key="nav-expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 py-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">
                Main
              </div>
              {items.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-gradient-to-r from-accent-500/10 to-purple-500/10 text-accent-400 border border-accent-500/20 shadow-glow"
                        : "text-dark-300 hover:bg-dark-800 hover:text-white hover:border-dark-600",
                      item.disabled && "opacity-50 cursor-not-allowed"
                    )
                  }
                  aria-current={location.pathname === item.href ? 'page' : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed tooltips */}
        {collapsed && (
          <div className="space-y-1">
            {items.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className="relative flex items-center justify-center px-3 py-2.5 rounded-lg transition-all duration-200"
              >
                <item.icon className="w-5 h-5 text-dark-400" aria-hidden="true" />
                <span className="absolute left-full ml-3 px-2 py-1 bg-dark-900 border border-dark-700 rounded text-xs text-dark-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {item.name}
                </span>
              </Link>
            ))}
          </div>
        )}

        {!collapsed && (
          <>
            <div className="h-px bg-dark-700 my-2" />
            <div className="px-3 py-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">
              Advanced
            </div>
            <NavLink
              to="/agents"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-accent-500/10 to-purple-500/10 text-accent-400 border border-accent-500/20"
                    : "text-dark-300 hover:bg-dark-800 hover:text-white hover:border-dark-600"
                )
              }
            >
              <Network className="w-5 h-5 flex-shrink-0" />
              <span>Lateral Movement</span>
            </NavLink>
            <NavLink
              to="/agents"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-accent-500/10 to-purple-500/10 text-accent-400 border border-accent-500/20"
                    : "text-dark-300 hover:bg-dark-800 hover:text-white hover:border-dark-600"
                )
              }
            >
              <Shield className="w-5 h-5 flex-shrink-0" />
              <span>Evasion</span>
            </NavLink>
            <NavLink
              to="/agents"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-accent-500/10 to-purple-500/10 text-accent-400 border border-accent-500/20"
                    : "text-dark-300 hover:bg-dark-800 hover:text-white hover:border-dark-600"
                )
              }
            >
              <Bug className="w-5 h-5 flex-shrink-0" />
              <span>Modules</span>
            </NavLink>
          </>
        )}

        {/* Quick stats at bottom when expanded */}
        {!collapsed && (
          <div className="mt-6 pt-4 border-t border-dark-700">
            <div className="px-3 py-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">
              Quick Stats
            </div>
            <div className="px-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Active Agents</span>
                <span className="font-mono text-accent-400" id="sidebar-active-agents">0</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Pending Tasks</span>
                <span className="font-mono text-yellow-400" id="sidebar-pending-tasks">0</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Uptime</span>
                <span className="font-mono text-green-400" id="sidebar-uptime">0s</span>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Footer / User */}
      <div className="p-4 border-t border-dark-700">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-500/20 to-purple-500/20 rounded-full blur" />
              <div className="relative flex items-center justify-center w-full h-full rounded-full bg-dark-800 border border-dark-700">
                <Users className="w-4 h-4 text-accent-400" />
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border-2 border-dark-900" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark-100 truncate">{user?.username || 'operator'}</p>
              <p className="text-xs text-dark-500 truncate">{isOwner ? 'Owner' : 'Operator'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-dark-400 hover:text-red-400">
              <X className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={logout} className="text-dark-400 hover:text-red-400 mx-auto" title="Logout">
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>
    </aside>
  )
}