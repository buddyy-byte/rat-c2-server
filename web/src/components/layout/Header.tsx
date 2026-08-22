import { useStore } from '@/stores/useStore'
import { Bell, Search, User, LogOut, Menu, Moon, Sun, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

export function Header() {
  const { sidebarOpen, toggleSidebar, agents, notifications, removeNotification } = useStore()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const connected = agents.some(a => a.status === 'online')
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <header className="sticky top-0 z-30 bg-dark-900/80 backdrop-blur-sm border-b border-dark-800">
      <div className="flex items-center justify-between h-16 px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className={clsx(
              'p-2 rounded-lg text-dark-400 hover:bg-dark-800 hover:text-dark-100 transition-colors',
              !sidebarOpen && 'lg:hidden'
            )}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden sm:flex items-center gap-2 bg-dark-800/50 border border-dark-700 rounded-lg px-4 py-2">
            <Search className="w-4 h-4 text-dark-500" />
            <input
              type="text"
              placeholder="Search agents, tasks, files..."
              className="bg-transparent border-none outline-none text-dark-100 placeholder-dark-500 w-64"
              aria-label="Search"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dark-800/50 border border-dark-700">
            <span
              className={clsx(
                'w-2 h-2 rounded-full',
                connected ? 'bg-green-500' : 'bg-red-500'
              )}
            />
            <span className="text-xs font-medium text-dark-300">
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={clsx(
                'relative p-2 rounded-lg text-dark-400 hover:bg-dark-800 hover:text-dark-100 transition-colors',
                unreadCount > 0 && 'text-accent-400'
              )}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-dark-900 border border-dark-700 rounded-xl shadow-xl overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
                  <h3 className="font-medium text-dark-100">Notifications</h3>
                  {notifications.length > 0 && (
                    <button
                      onClick={() => notifications.forEach((n) => removeNotification(n.id))}
                      className="text-xs text-accent-400 hover:text-accent-300"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-dark-500">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={clsx(
                          'px-4 py-3 border-b border-dark-800/50 hover:bg-dark-800/50 flex items-start gap-3',
                          !n.read && 'bg-accent-900/10'
                        )}
                        onClick={() => removeNotification(n.id)}
                      >
                        <div
                          className={clsx(
                            'w-2 h-2 mt-2 rounded-full flex-shrink-0',
                            n.type === 'success' && 'bg-green-500',
                            n.type === 'error' && 'bg-red-500',
                            n.type === 'warning' && 'bg-yellow-500',
                            n.type === 'info' && 'bg-blue-500'
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-dark-100">{n.message}</p>
                          <p className="text-xs text-dark-500 mt-1">Just now</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                          className="text-dark-500 hover:text-dark-300"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-800 transition-colors"
              aria-label="User menu"
            >
              <div className="w-8 h-8 rounded-full bg-accent-600 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <span className="hidden sm:block text-sm font-medium text-dark-100">Operator</span>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-dark-900 border border-dark-700 rounded-xl shadow-xl overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-dark-700">
                  <p className="text-sm font-medium text-dark-100">Operator</p>
                  <p className="text-xs text-dark-500">admin@rat-c2.local</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('auth_token')
                    window.location.href = '/login'
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}