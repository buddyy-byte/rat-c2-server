import * as React from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { Search, Bell, Moon, Sun, Menu, X, Command, User, LogOut, Settings, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { useAuthStore } from "@/stores/authStore"
import { useTheme } from "@/hooks/useTheme"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/DropdownMenu"
import { Input } from "@/components/ui/Input"

export function Header() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [commandOpen, setCommandOpen] = React.useState(false)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <header className="sticky top-0 z-30 h-16 bg-dark-900/80 backdrop-blur-xl border-b border-dark-700">
      <div className="flex h-full items-center justify-between px-4 md:px-6 lg:px-8 ml-20 lg:ml-64 transition-all duration-300">
        {/* Left: Search / Command Palette */}
        <div className="flex items-center gap-4 flex-1 max-w-xl">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCommandOpen(true)}
            className="hidden md:flex text-dark-400 hover:text-accent-400"
            aria-label="Open command palette (⌘K)"
          >
            <Command className="w-5 h-5" />
            <span className="sr-only">Command Palette</span>
          </Button>
          
          <div className="relative flex-1 max-w-md hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search agents, tasks, files... (⌘K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-dark-800/50 hover:bg-dark-800 focus:bg-dark-800"
              aria-label="Global search"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-dark-400 hover:text-accent-400"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="text-dark-400 hover:text-accent-400 relative" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
          </Button>

          {/* Refresh */}
          <Button variant="ghost" size="icon" className="text-dark-400 hover:text-accent-400" aria-label="Refresh data">
            <RefreshCw className="w-5 h-5" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full text-dark-400 hover:text-accent-400">
                <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-dark-900 border-dark-700" align="end" forceMount>
              <DropdownMenuLabel className="text-dark-300">Account</DropdownMenuLabel>
              <DropdownMenuItem className="text-dark-100 hover:bg-accent-500/10">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>Profile</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-dark-100 hover:bg-accent-500/10">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-dark-700" />
              <DropdownMenuItem 
                className="text-red-400 hover:bg-red-500/10 focus:text-red-400"
                onClick={logout}
              >
                <div className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  <span>Log out</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}