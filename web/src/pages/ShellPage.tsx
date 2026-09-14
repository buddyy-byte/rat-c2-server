import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { useAgentStore } from '@/stores/agentStore'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import {
  Send,
  Terminal,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  ChevronLeft,
  Monitor,
  Cpu,
} from "lucide-react"

interface TermLine {
  type: 'command' | 'output' | 'error'
  text: string
  timestamp: string
}

const now = () => new Date().toLocaleTimeString([], { hour12: false })

export function ShellPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const { agents, fetchAgents } = useAgentStore()
  const [agent, setAgent] = React.useState<any>(null)
  const [lines, setLines] = React.useState<TermLine[]>([])
  const [command, setCommand] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [history, setHistory] = React.useState<string[]>([])
  const [historyIndex, setHistoryIndex] = React.useState(-1)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const pollAbort = React.useRef(false)

  React.useEffect(() => {
    if (!agentId) return
    let live = true
    ;(async () => {
      try {
        const found = agents.find((a) => a.ID === agentId) || null
        if (found) { if (live) setAgent(found); return }
        const fetched = await api.getAgent(agentId)
        if (live) setAgent(fetched)
      } catch {
        await fetchAgents()
        try {
          const fresh = await api.getAgent(agentId)
          if (live) setAgent(fresh)
        } catch { /* leave null → empty state */ }
      }
    })()
    return () => { live = false; pollAbort.current = true }
  }, [agentId])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const append = (l: TermLine) => setLines(prev => [...prev, l])

  const runCommand = async (cmd: string) => {
    if (!cmd.trim() || !agentId || busy) return
    setHistory(prev => [...prev, cmd])
    setHistoryIndex(-1)
    setCommand('')
    append({ type: 'command', text: cmd, timestamp: now() })
    setBusy(true)
    try {
      const task = await api.executeShell(agentId, cmd)
      const taskId = (task as any)?.id ?? (task as any)?.ID
      if (!taskId) throw new Error('server returned no task id')
      const deadline = Date.now() + 90_000
      let done = false
      while (!done && Date.now() < deadline && !pollAbort.current) {
        await new Promise(r => setTimeout(r, 1500))
        const t: any = await api.getTask(taskId)
        const status = String(t?.status ?? '')
        if (status === 'completed' || status === 'failed') {
          const out: string = String(t?.result ?? t?.output ?? '')
          if (out.trim()) {
            out.split(/\r?\n/).forEach(line =>
              append({ type: status === 'failed' ? 'error' : 'output', text: line, timestamp: now() }))
          }
          if (status === 'failed') append({ type: 'error', text: `task failed (exit ${t?.result_code ?? '?'})`, timestamp: now() })
          done = true
        }
      }
      if (!done) append({ type: 'error', text: 'timeout waiting for agent (is it online? beacon may be sleeping)', timestamp: now() })
    } catch (e: any) {
      append({ type: 'error', text: `error: ${e?.message ?? e}`, timestamp: now() })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void runCommand(command) }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length && historyIndex < history.length - 1) {
        const i = historyIndex + 1
        setHistoryIndex(i)
        setCommand(history[history.length - 1 - i])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const i = historyIndex - 1
        setHistoryIndex(i)
        setCommand(history[history.length - 1 - i])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommand('')
      }
    }
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Terminal className="w-12 h-12 text-dark-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Agent Not Found</h2>
            <p className="text-dark-400 mb-6">This agent isn't registered or was removed from the database.</p>
            <Button onClick={() => navigate('/agents')}>Back to Agents</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusColor = agent.Status === 'active' ? 'text-green-400' : agent.Status === 'idle' ? 'text-yellow-400' : 'text-red-400'
  const statusDot = agent.Status === 'active' ? 'bg-green-400' : agent.Status === 'idle' ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className={cn("min-h-screen bg-dark-950 flex flex-col", isFullscreen && "fixed inset-0 z-50")}>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-dark-700 bg-dark-900/80 backdrop-blur-sm sticky top-0 z-40"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="text-dark-400 hover:text-white" onClick={() => navigate('/agents')}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", String(agent.OS).includes('indows') ? 'bg-blue-500/20' : 'bg-green-500/20')}>
              {String(agent.OS).includes('indows')
                ? <Monitor className="w-5 h-5 text-blue-400" />
                : <Cpu className="w-5 h-5 text-green-400" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-white truncate">{agent.Hostname}</h1>
                <span className={cn("w-2 h-2 rounded-full", statusDot)} />
                <span className={cn("text-xs font-medium capitalize", statusColor)}>{agent.Status}</span>
                {busy && <span className="text-xs text-accent-400 animate-pulse">running…</span>}
              </div>
              <p className="text-xs text-dark-400 truncate">{agent.Username}@{agent.OS} • {agent.IP} • {agent.Arch}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLines([])} className="gap-1">
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="gap-1">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit FS' : 'Fullscreen'}</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/agents')} className="text-dark-400 hover:text-white">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div className="border-t border-dark-700 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-xs text-dark-500 px-1">Quick:</span>
            {['whoami', 'hostname', 'ipconfig', 'systeminfo', 'tasklist', 'net user', 'dir', 'powershell -c "Get-Process | Sort CPU -Desc | Select -First 5"'].map((cmd) => (
              <Button
                key={cmd}
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void runCommand(cmd)}
                className="whitespace-nowrap text-xs px-2 py-1 h-auto border border-dark-700 hover:border-accent-500/50 hover:bg-accent-500/10"
              >
                {cmd.length > 24 ? cmd.slice(0, 24) + '…' : cmd}
              </Button>
            ))}
          </div>
        </div>
      </motion.div>

      <div className={cn("flex-1 overflow-hidden", isFullscreen ? "" : "")}>
        <ScrollArea className="h-full">
          <div className="p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
            {lines.length === 0 && (
              <div className="text-dark-500">Chemical Umbra remote shell — output streams when the agent's next beacon executes the task. Type a command or use Quick below.</div>
            )}
            {lines.map((line, idx) => (
              <div key={idx} className={cn(
                line.type === 'error' ? 'text-red-400' :
                line.type === 'command' ? 'text-green-400' : 'text-dark-100'
              )}>
                <span className="text-dark-600 mr-2 select-none">{line.timestamp}</span>
                {line.type === 'command' && <span className="text-green-400 mr-1">{'>'}</span>}
                {line.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="border-t border-dark-700 bg-dark-900/80 backdrop-blur-sm p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <span className="text-green-400 font-mono text-sm whitespace-nowrap">{agent.Username}@{agent.Hostname}:~$</span>
          <Input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={busy ? 'waiting for agent…' : 'Enter command...'}
            disabled={busy}
            className="flex-1 bg-dark-800 border-dark-700 focus:border-accent-500 font-mono text-sm"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={!command.trim() || busy}>
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  )
}