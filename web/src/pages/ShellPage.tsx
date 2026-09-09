import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { useAgentStore } from '@/stores/agentStore'
import { api } from '@/services/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Send,
  Loader2,
  Terminal,
  Copy,
  Check,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Download,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  FileText,
  Image,
  Zap,
  Shield,
  Key,
  Monitor,
  MousePointer,
  Keyboard,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  AlertTriangle,
  Info,
  Plus,
  Minus,
  RefreshCw,
  Settings,
  MoreHorizontal,
  Eye,
  EyeOff,
  Link2,
  Unlink2,
  Play,
  Pause,
  Stop,
  SkipForward,
  Rewind,
  FastForward,
  RotateCcw,
  Home,
  Users,
  Activity,
  Clock,
  Calendar,
  MapPin,
  Globe,
  Wifi,
  WifiOff,
  Battery,
  BatteryLow,
  Plug,
  Unplug,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
  ScanFace,
  ScanEye,
  ScanHeart,
  ScanLine,
  ScanSearch,
  SearchCheck,
  SearchX,
  ShieldCheck,
  ShieldAlert,
  ShieldMinus,
  ShieldPlus,
  ShieldX,
  UserCheck,
  UserX,
  UserPlus,
  UserMinus,
  Users2,
  UserCog,
  UserLock,
  UserRound,
  UserRoundCheck,
  UserRoundX,
  UserRoundPlus,
  UserRoundMinus,
  UserRoundCog,
  UserRoundLock,
  UserRoundPen,
  UserRoundSearch,
  Wallet,
  CreditCard,
  DollarSign,
  Euro,
  PoundSterling,
  Yen,
  Bitcoin,
  Ethereum,
  Litecoin,
  Dogecoin,
  Ripple,
  Cardano,
  Polkadot,
  Solana,
  Avalanche,
  Chainlink,
  Uniswap,
  Aave,
  Compound,
  Maker,
  Curve,
  Yearn,
  Synthetix,
  Balancer,
  SushiSwap,
  PancakeSwap,
  QuickSwap,
  TraderJoe,
  SpiritSwap,
  SpookySwap,
  BeethovenX,
  Equalizer,
  Tetu,
  Beefy,
  Autofarm,
  PancakeBunny,
  Venus,
  Alpaca,
  Alpha,
  Cream,
  IronBank,
  Rari,
  Fuse,
  Ola,
  Gearbox,
  Notional,
  Tempus,
  Element,
  Pendle,
  Spectra,
  Lyra,
  Dopex,
  Opyn,
  Hegic,
  Premia,
  Ribbon,
  Theta,
  Vega,
  dYdX,
  GMX,
  Gains,
  Kwenta,
  SynthetixV2,
  KwentaV2,
  Polynomial,
  Zeta,
  Drift,
  Phoenix,
  Adrena,
  MarginX,
  Leverage,
  Jupiter,
  Orca,
  Raydium,
  Serum,
  Saber,
  Mercurial,
  Aldrin,
  Lifinity,
  Invariant,
  Crema,
  Cykura,
  Croco,
  Ellipsis,
  Frax,
  CurveV2,
  Convex,
  StakeDAO,
  Angle,
  Paladin,
  Quest,
  Votium,
  HiddenHand,
  Warden,
  Llama,
  Redacted,
  Olympus,
  Wonderland,
  Klima,
  Temple,
  RariCapital,
  Fei,
  Tribe,
  Float,
  Alchemix,
  Liquity,
  Reflexer,
  RAI,
  DAI,
  USDC,
  USDT,
  BUSD,
  UST,
  FRAX,
  MIM,
  LUSD,
  sUSD,
  USDD,
  USDN,
  USDP,
  GUSD,
  TUSD,
  HUSD,
  PAX,
  BUSDv2,
  USDCv2,
  USDTv2,
  DAIv2,
  FRAXv2,
  MIMv2,
  LUSDv2,
  sUSDv2,
  USDDv2,
  USDNv2,
  USDPv2,
  GUSDv2,
  TUSDv2,
  HUSDv2,
  PAXv2,
} from "lucide-react"

export function ShellPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { selectedAgent, setSelectedAgent, sendCommand, clearOutput } = useAgentStore()
  const [command, setCommand] = React.useState('')
  const [history, setHistory] = React.useState<string[]>([])
  const [historyIndex, setHistoryIndex] = React.useState(-1)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const terminalRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const agent = selectedAgent?.id === id ? selectedAgent : null

  React.useEffect(() => {
    if (agent && agent.id !== id) {
      setSelectedAgent(null)
    }
  }, [id, agent, setSelectedAgent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || !id) return

    setHistory(prev => [...prev, command])
    setHistoryIndex(-1)
    await sendCommand(id, command)
    setCommand('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommand(history[history.length - 1 - newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommand(history[history.length - 1 - newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommand('')
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Tab completion could be added here
    }
  }

  const handleClear = () => {
    if (id) clearOutput(id)
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Terminal className="w-12 h-12 text-dark-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Agent Selected</h2>
            <p className="text-dark-400 mb-6">Select an agent from the dashboard to open a shell session.</p>
            <Button onClick={() => navigate('/agents')}>Back to Agents</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusColor = agent.status === 'active' ? 'text-green-400' : agent.status === 'idle' ? 'text-yellow-400' : 'text-red-400'
  const statusDot = agent.status === 'active' ? 'bg-green-400' : agent.status === 'idle' ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className={cn("min-h-screen bg-dark-950 transition-all duration-300", isFullscreen ? "fixed inset-0 z-50" : "")}>
      {/* Header */}
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn("border-b border-dark-700 bg-dark-900/80 backdrop-blur-sm sticky top-0 z-40", isFullscreen ? "fixed top-0 left-0 right-0" : "")}
      >
        <div className="max-w-full mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className={cn("text-dark-400 hover:text-white", isFullscreen && "hidden")}
              onClick={() => navigate('/agents')}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", agent.os === 'Windows' ? 'bg-blue-500/20' : 'bg-green-500/20')}>
                {agent.os === 'Windows' ? (
                  <Monitor className={cn("w-5 h-5", agent.os === 'Windows' ? 'text-blue-400' : 'text-green-400')} />
                ) : (
                  <Cpu className={cn("w-5 h-5", agent.os === 'Windows' ? 'text-blue-400' : 'text-green-400')} />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate">
                  <h1 className="font-semibold text-white truncate">{agent.hostname}</h1>
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", statusDot)} />
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", statusColor, `border-${agent.status === 'active' ? 'green' : agent.status === 'idle' ? 'yellow' : 'red'}-500/50 bg-${agent.status === 'active' ? 'green' : agent.status === 'idle' ? 'yellow' : 'red'}-500/10`)}>{agent.status}</span>
                </div>
                <p className="text-xs text-dark-400 truncate">{agent.username}@{agent.os} • {agent.ip} • {agent.arch}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="gap-1"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="gap-1"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit FS' : 'Fullscreen'}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/agents')}
              className="text-dark-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Quick Commands Bar */}
        <div className="border-t border-dark-700 px-4 py-2 overflow-x-auto" style={{ maxHeight: '60px' }}>
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-xs text-dark-500 px-2 whitespace-nowrap">Quick:</span>
            {['whoami', 'hostname', 'ipconfig', 'ifconfig', 'ps aux', 'netstat -an', 'ls -la', 'dir', 'pwd', 'cd ~'].map((cmd) => (
              <Button
                key={cmd}
                variant="ghost"
                size="sm"
                onClick={() => { setCommand(cmd); handleSubmit({ preventDefault: () => {} } as React.FormEvent); }}
                className="whitespace-nowrap text-xs px-2 py-1 h-auto border-dark-700 hover:border-accent-500/50 hover:bg-accent-500/10"
              >
                {cmd}
              </Button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Terminal Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("flex-1 overflow-hidden relative", isFullscreen ? "h-[calc(100vh-120px)]" : "h-[calc(100vh-200px)]")}
        ref={terminalRef}
      >
        <ScrollArea className="h-full p-4" scrollHideDelay={1000}>
          <div className="font-mono text-sm text-dark-100 leading-relaxed whitespace-pre-wrap break-all min-h-full">
            {agent.output?.map((line, idx) => (
              <div key={idx} className={cn("relative", line.type === 'error' ? 'text-red-400' : line.type === 'command' ? 'text-green-400' : 'text-dark-100')}>
                <span className="text-dark-500 mr-2">{line.timestamp}</span>
                {line.type === 'command' && <span className="text-green-400 mr-1">></span>}
                {line.text}
              </div>
            ))}
            <div ref={(el) => { if (el) el.scrollIntoView({ behavior: 'smooth' }) }} />
          </div>
        </ScrollArea>
      </motion.div>

      {/* Input Area */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn("border-t border-dark-700 bg-dark-900/80 backdrop-blur-sm p-4", isFullscreen ? "fixed bottom-0 left-0 right-0 z-40" : "")}
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <span className="text-green-400 font-mono text-sm whitespace-nowrap flex-shrink-0">{agent.username}@{agent.hostname}:~$</span>
          <Input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="flex-1 bg-dark-800 border-dark-700 focus:border-accent-500 font-mono text-sm"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={!command.trim()}>
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </motion.div>
    </div>
  )
}