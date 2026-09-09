import * as React from "react"
import { motion } from "framer-motion"
import { cn } from '@/lib/utils'
import type { Agent } from '@/types'
import {
  Monitor,
  User,
  Globe,
  Cpu,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  MoreVertical,
  Copy,
  Terminal,
  Camera,
  Download,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
  Crown,
  Bug,
  Network,
  Settings,
  Play,
  Pause,
  Power,
} from "lucide-react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/DropdownMenu'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { formatDistanceToNow } from 'date-fns'

interface AgentCardProps {
  agent: Agent
  selected?: boolean
  onClick?: () => void
  compact?: boolean
}

const statusConfig = {
  active: { icon: Wifi, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Active', pulse: true },
  idle: { icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Idle', pulse: false },
  offline: { icon: WifiOff, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Offline', pulse: false },
}

export function AgentCard({ agent, selected, onClick, compact }: AgentCardProps) {
  const status = statusConfig[agent.Status] || statusConfig.offline
  const StatusIcon = status.icon

  if (compact) {
    return (
      <motion.div
        className={cn(
          "flex items-center gap-4 p-3 rounded-lg bg-dark-800/50 border transition-all duration-200 cursor-pointer group",
          selected
            ? "border-accent-500/50 bg-accent-500/5 shadow-lg shadow-accent-500/10"
            : "border-dark-700 hover:border-accent-500/30 hover:bg-dark-800"
        )}
        whileHover={{ y: -2, boxShadow: "0 10px 40px -10px rgba(217, 70, 239, 0.3)" }}
        onClick={onClick}
      >
        <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0", status.bg)}>
          <StatusIcon className={cn("w-6 h-6", status.color)} />
          {status.pulse && (
            <motion.div
              className="absolute w-12 h-12 rounded-lg"
              style={{ backgroundColor: status.color.replace('text-', 'bg-').replace('400', '500') }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-dark-100 truncate">{agent.Hostname}</h3>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
              status.bg.replace('bg-', 'bg-').replace('/10', '/20'),
              status.color.replace('text-', 'text-')
            )}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-dark-500">
            <span className="flex items-center gap-1 font-mono">{agent.Username}</span>
            <span className="flex items-center gap-1 font-mono">{agent.OS} {agent.Arch}</span>
            <span className="flex items-center gap-1 font-mono">{agent.IP}</span>
            {agent.IsAdmin && <Crown className="w-3 h-3 text-yellow-400" />}
          </div>
        </div>
        <div className="text-right text-xs text-dark-500 flex-shrink-0">
          <p>{agent.LastSeen ? formatDistanceToNow(new Date(agent.LastSeen), { addSuffix: true }) : 'Never'}</p>
          <p className="font-mono">{agent.ID.slice(0, 8)}...</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        selected
          ? "ring-2 ring-accent-500/50 shadow-xl shadow-accent-500/10"
          : ""
      )}
      whileHover={{ y: -4, boxShadow: "0 20px 60px -15px rgba(217, 70, 239, 0.4)" }}
      onClick={onClick}
    >
      <Card className={cn(
        "card-hover h-full relative overflow-hidden",
        selected && "ring-1 ring-accent-500/30"
      )}>
        {/* Status indicator bar at top */}
        <div className={cn("absolute top-0 left-0 right-0 h-1", status.bg)} />
        {status.pulse && (
          <motion.div
            className="absolute top-0 left-0 right-0 h-1"
            style={{ backgroundColor: status.color.replace('text-', 'bg-').replace('400', '500') }}
            animate={{ scaleX: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            initial={{ scaleX: 0 }}
          />
        )}

        <CardContent className="p-5 relative">
          {/* Header with hostname and status */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 relative", status.bg)}>
                <Monitor className={cn("w-7 h-7", status.color)} />
                {status.pulse && (
                  <motion.div
                    className="absolute inset-0 rounded-xl"
                    style={{ backgroundColor: status.color.replace('text-', 'bg-').replace('400', '500') }}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-dark-100 truncate text-lg">{agent.Hostname}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-dark-400">
                  <span className="flex items-center gap-1 font-mono">
                    <User className="w-3.5 h-3.5" />
                    {agent.Username}
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <Globe className="w-3.5 h-3.5" />
                    {agent.IP}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5",
                status.bg.replace('/10', '/20'),
                status.color
              )}>
                <StatusIcon className="w-3.5 h-3.5" />
                {status.label}
              </span>
            </div>
          </div>

          {/* System info grid */}
          <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-dark-900/50 rounded-lg border border-dark-700">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-dark-500" />
              <div>
                <p className="text-xs text-dark-500">Arch</p>
                <p className="font-mono text-sm text-dark-100">{agent.Arch}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-dark-500" />
              <div>
                <p className="text-xs text-dark-500">OS</p>
                <p className="font-mono text-sm text-dark-100 truncate">{agent.OS}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agent.IsAdmin ? (
                <Crown className="w-4 h-4 text-yellow-400" />
              ) : (
                <Shield className="w-4 h-4 text-dark-500" />
              )}
              <div>
                <p className="text-xs text-dark-500">Privileges</p>
                <p className="font-mono text-sm text-dark-100">{agent.IsAdmin ? 'Admin' : 'User'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-dark-500" />
              <div>
                <p className="text-xs text-dark-500">AV</p>
                <p className="font-mono text-sm text-dark-100 truncate max-w-[100px]">{agent.AV || 'Unknown'}</p>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="space-y-2 text-xs text-dark-500 mb-4">
            <div className="flex items-center justify-between">
              <span>Version</span>
              <span className="font-mono text-dark-300">{agent.Version}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>PID</span>
              <span className="font-mono text-dark-300">{agent.PID}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Last Seen
              </span>
              <span className="font-mono text-dark-300">
                {agent.LastSeen ? formatDistanceToNow(new Date(agent.LastSeen), { addSuffix: true }) : 'Never'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>First Seen</span>
              <span className="font-mono text-dark-300">
                {agent.FirstSeen ? formatDistanceToNow(new Date(agent.FirstSeen), { addSuffix: true }) : 'Unknown'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3 border-t border-dark-700">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel className="font-mono text-xs">Agent Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => window.location.href = `/agents/${agent.ID}`} className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Interactive Shell
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert('Screenshot feature coming soon')} className="flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Take Screenshot
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert('File browser feature coming soon')} className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Browse Files
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => alert('Process list feature coming soon')} className="flex items-center gap-2">
                  <Network className="w-4 h-4" />
                  View Processes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert('Lateral movement feature coming soon')} className="flex items-center gap-2">
                  <Bug className="w-4 h-4" />
                  Lateral Movement
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert('Evasion feature coming soon')} className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Evasion Techniques
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(agent.ID)} className="flex items-center gap-2 text-blue-400">
                  <Copy className="w-4 h-4" />
                  Copy Agent ID
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert('Sleep agent feature coming soon')} className="flex items-center gap-2 text-yellow-400">
                  <Pause className="w-4 h-4" />
                  Sleep Agent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert('Uninstall agent feature coming soon')} className="flex items-center gap-2 text-red-400">
                  <Power className="w-4 h-4" />
                  Uninstall
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button 
              variant={selected ? "default" : "outline"} 
              size="sm" 
              className="flex-1"
              onClick={(e) => { e.stopPropagation(); onClick?.() }}
            >
              {selected ? 'Selected' : 'Select'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}