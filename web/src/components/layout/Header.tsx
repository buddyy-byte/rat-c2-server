import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, Moon, Sun, User, LogOut, Settings, RefreshCw, CheckCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { useTheme } from '@/hooks/useTheme'
import { useUIStore } from '@/stores/uiStore'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/DropdownMenu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { fetchAgents, agents } = useAgentStore()
  const { theme, toggleTheme } = useTheme()
  const { notices, markAllRead, clearNotices, pushNotice, notifyPrefs } = useUIStore()
  const [q, setQ] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)
  const unread = notices.filter(n => !n.read).length

  const runSearch = (raw: string) => {
    const term = raw.trim()
    if (!term) return
    const hit = agents.find(a =>
      (a.Hostname || '').toLowerCase().includes(term.toLowerCase()) ||
      (a.Username || '').toLowerCase().includes(term.toLowerCase()) ||
      (a.IP || '').includes(term) ||
      (a.ID || '').toLowerCase().includes(term.toLowerCase())
    )
    if (hit) {
      navigate(`/agents/${hit.ID}`)
      return
    }
    navigate(`/agents?q=${encodeURIComponent(term)}`)
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      await fetchAgents()
      toast.success('Refreshed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const el = document.getElementById('global-search') as HTMLInputElement | null
        el?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const prevCount = React.useRef(agents.length)
  React.useEffect(() => {
    if (agents.length > prevCount.current && notifyPrefs.agent_online) {
      const newest = agents[0]
      pushNotice({
        kind: 'success',
        title: 'Agent online',
        body: newest ? `${newest.Hostname || newest.ID} checked in` : 'new agent',
      })
    }
    prevCount.current = agents.length
  }, [agents, notifyPrefs.agent_online, pushNotice])

  return (
    <header className="sticky top-0 z-30 h-16 bg-dark-900/80 backdrop-blur-xl border-b border-dark-700">
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        <form
          className="flex items-center gap-3 flex-1 max-w-xl"
          onSubmit={(e) => { e.preventDefault(); runSearch(q) }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <Input
              id="global-search"
              type="search"
              placeholder="Search agents… (Ctrl+K)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 bg-dark-800/50"
            />
          </div>
        </form>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-[9px] leading-3.5 text-white text-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 bg-dark-900 border-dark-700" align="end">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Notifications</span>
                <span className="flex gap-1">
                  <button type="button" className="text-xs text-dark-400 hover:text-accent-400" onClick={markAllRead}>
                    <CheckCheck className="w-3.5 h-3.5 inline" /> read
                  </button>
                  <button type="button" className="text-xs text-dark-400 hover:text-red-400" onClick={clearNotices}>
                    <Trash2 className="w-3.5 h-3.5 inline" /> clear
                  </button>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notices.length === 0 && (
                <div className="px-3 py-6 text-sm text-dark-500">nothing yet — agent check-ins land here</div>
              )}
              <div className="max-h-80 overflow-auto">
                {notices.slice(0, 12).map(n => (
                  <div key={n.id} className={cn('px-3 py-2 border-b border-dark-800', !n.read && 'bg-accent-500/5')}>
                    <p className="text-sm text-dark-100">{n.title}</p>
                    <p className="text-xs text-dark-500">{n.body}</p>
                    <p className="text-[10px] text-dark-600 mt-0.5">{new Date(n.ts).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings?tab=notifications')}>
                Notification settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh" disabled={refreshing}>
            <RefreshCw className={cn('w-5 h-5', refreshing && 'animate-spin')} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-dark-900 border-dark-700" align="end">
              <DropdownMenuLabel>{user?.username || 'operator'}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate('/settings?tab=profile')}>
                <User className="w-4 h-4 mr-2" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-400" onClick={logout}>
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
