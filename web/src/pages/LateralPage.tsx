import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Tabs, TabList, TabTrigger, TabContent } from '@/components/ui/Tabs'
import { ArrowRightLeft, Search, RefreshCw, Copy, ChevronLeft, ChevronRight, Target, User, Lock, Key, Terminal, Wifi, Globe, Eye, Download, Upload, Zap, Shield, AlertTriangle, CheckCircle, XCircle, Plus, Minus, Clock } from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'

interface LateralTarget {
  ip: string
  hostname: string
  os: string
  ports: number[]
  domain: string | null
  smb: boolean
  rdp: boolean
  wmi: boolean
  ssh: boolean
}

interface CredentialItem {
  id: string
  type: string
  username: string
  domain: string | null
  password: string
}

const techniques = [
  { id: 'psexec', name: 'PsExec', desc: 'Execute commands via SMB/admin$ share', category: 'SMB', mitre: 'T1021.002', severity: 'high' },
  { id: 'wmiexec', name: 'WMIExec', desc: 'Execute via WMI Win32_Process.Create', category: 'WMI', mitre: 'T1021.003', severity: 'high' },
  { id: 'smbexec', name: 'SMBExec', desc: 'Execute via SMB service creation', category: 'SMB', mitre: 'T1021.002', severity: 'high' },
  { id: 'wmi', name: 'WMI Query', desc: 'Remote WMI queries for enumeration', category: 'WMI', mitre: 'T1047', severity: 'medium' },
  { id: 'rdp', name: 'RDP Hijack', desc: 'Inject into existing RDP session', category: 'RDP', mitre: 'T1021.001', severity: 'critical' },
  { id: 'pth', name: 'Pass-the-Hash', desc: 'Authenticate with NTLM hash', category: 'Credential', mitre: 'T1550.002', severity: 'critical' },
  { id: 'ssh', name: 'SSH Key/Auth', desc: 'SSH with key or password auth', category: 'SSH', mitre: 'T1021.004', severity: 'high' },
]

const statusConfig: Record<string, { color: string; bg: string; icon: any }> = {
  pending: { color: 'text-yellow-500', bg: 'bg-yellow-500', icon: Clock },
  running: { color: 'text-blue-500', bg: 'bg-blue-500', icon: RefreshCw },
  completed: { color: 'text-green-500', bg: 'bg-green-500', icon: CheckCircle },
  failed: { color: 'text-red-500', bg: 'bg-red-500', icon: XCircle },
}

export function LateralPage() {
  const { agents, selectedAgent, lateralMoves, credentials, fetchLateralMoves, addNotification } = useStore()
  const [activeTab, setActiveTab] = useState<'credentials' | 'scan' | 'execute' | 'results'>('credentials')
  const [loading, setLoading] = useState(false)
  const [scanRange, setScanRange] = useState('192.168.1.0/24')
  const [scanResults, setScanResults] = useState<LateralTarget[]>([])
  const [selectedTarget, setSelectedTarget] = useState<LateralTarget | null>(null)
  const [selectedTechnique, setSelectedTechnique] = useState<string>('psexec')
  const [selectedCredential, setSelectedCredential] = useState<string>('')
  const [execOutput, setExecOutput] = useState<string>('')

  useEffect(() => {
    if (selectedAgent) {
      loadData()
    }
  }, [selectedAgent])

  const loadData = async () => {
    if (!selectedAgent) return
    setLoading(true)
    try {
      await fetchLateralMoves(selectedAgent.id)
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to load data: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const handleScan = async () => {
    if (!selectedAgent) return
    setLoading(true)
    try {
      const res = await api.scanNetwork(selectedAgent.id, scanRange)
      setScanResults(res)
      addNotification({ type: 'success', message: `Found ${res.length} targets` })
    } catch (error) {
      addNotification({ type: 'error', message: `Scan failed: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!selectedAgent || !selectedTarget || !selectedTechnique) return
    setLoading(true)
    setExecOutput('Executing...')
    try {
      const res = await api.executeLateralMove(selectedAgent.id, {
        technique: selectedTechnique,
        target: selectedTarget.ip,
        credentials_id: selectedCredential || undefined
      })
      setExecOutput(res.output || 'Completed')
      addNotification({ type: 'success', message: 'Lateral move executed' })
      await fetchLateralMoves(selectedAgent.id)
    } catch (error) {
      setExecOutput(`Error: ${error}`)
      addNotification({ type: 'error', message: `Execution failed: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const usableCredentials = credentials.filter(c => 
    c.type === 'rdp' || c.type === 'ssh' || c.type === 'database' || c.type === 'custom'
  )

  return (
    <GradientBackground>
      <div className="animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <ArrowRightLeft className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Lateral Movement
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'} • Network propagation</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as any)} className="mb-6">
          <TabList>
            <TabTrigger value="credentials">Credentials ({usableCredentials.length})</TabTrigger>
            <TabTrigger value="scan">Network Scan</TabTrigger>
            <TabTrigger value="execute">Execute</TabTrigger>
            <TabTrigger value="results">Results ({lateralMoves.length})</TabTrigger>
          </TabList>

          <TabContent value="credentials">
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <h3 className="font-medium text-dark-100">Available Credentials</h3>
              </CardHeader>
              <CardBody>
                {usableCredentials.length === 0 ? (
                  <p className="text-dark-500">No usable credentials found. Extract credentials first.</p>
                ) : (
                  <div className="space-y-2">
                    {usableCredentials.map((cred) => (
                      <div key={cred.id} className="flex items-center justify-between p-3 bg-dark-800/50 border border-dark-700 rounded-lg hover:border-accent-500/50 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-600/20 text-blue-400 border-blue-600/30">{cred.type}</Badge>
                            <span className="font-mono text-sm text-dark-100">{cred.username}</span>
                            {cred.domain && <span className="text-dark-500 text-sm">@{cred.domain}</span>}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="credential"
                            value={cred.id}
                            checked={selectedCredential === cred.id}
                            onChange={(e) => setSelectedCredential(e.target.value)}
                            className="w-4 h-4 text-accent-600 border-dark-600 focus:ring-accent-500"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </TabContent>

          <TabContent value="scan">
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <h3 className="font-medium text-dark-100">Network Scan</h3>
              </CardHeader>
              <CardBody>
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm text-dark-400 mb-1">CIDR Range</label>
                    <input
                      type="text"
                      value={scanRange}
                      onChange={(e) => setScanRange(e.target.value)}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                      placeholder="192.168.1.0/24"
                    />
                  </div>
                  <Button onClick={handleScan} disabled={loading} className="self-end">
                    <Search className="w-4 h-4 mr-2" /> Scan Network
                  </Button>
                </div>

                {scanResults.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-dark-800 bg-dark-900/50">
                          <th className="px-4 py-2 text-left font-medium text-dark-400">Select</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">IP</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">Hostname</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">OS</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">Ports</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">SMB</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">RDP</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">WMI</th>
                          <th className="px-4 py-2 text-left font-medium text-dark-400">SSH</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResults.map((target) => (
                          <tr key={target.ip} className={clsx('border-b border-dark-800/50 hover:bg-dark-800/50', selectedTarget?.ip === target.ip && 'bg-accent-900/20')}>
                            <td className="px-4 py-2">
                              <input
                                type="radio"
                                name="target"
                                checked={selectedTarget?.ip === target.ip}
                                onChange={() => setSelectedTarget(target)}
                                className="w-4 h-4 text-accent-600 border-dark-600 focus:ring-accent-500"
                              />
                            </td>
                            <td className="px-4 py-2 font-mono text-sm text-dark-100">{target.ip}</td>
                            <td className="px-4 py-2 text-dark-300">{target.hostname || '-'}</td>
                            <td className="px-4 py-2 text-dark-400 text-sm">{target.os}</td>
                            <td className="px-4 py-2 text-dark-500 font-mono text-xs">{target.ports.slice(0, 5).join(', ')}{target.ports.length > 5 ? '...' : ''}</td>
                            <td className="px-4 py-2"><Badge variant={target.smb ? 'success' : 'outline'}>{target.smb ? '✓' : '✗'}</Badge></td>
                            <td className="px-4 py-2"><Badge variant={target.rdp ? 'success' : 'outline'}>{target.rdp ? '✓' : '✗'}</Badge></td>
                            <td className="px-4 py-2"><Badge variant={target.wmi ? 'success' : 'outline'}>{target.wmi ? '✓' : '✗'}</Badge></td>
                            <td className="px-4 py-2"><Badge variant={target.ssh ? 'success' : 'outline'}>{target.ssh ? '✓' : '✗'}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </TabContent>

          <TabContent value="execute">
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <h3 className="font-medium text-dark-100">Execute Lateral Move</h3>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-dark-100 mb-3">Target</h4>
                    {selectedTarget ? (
                      <div className="p-4 bg-dark-800/50 border border-dark-700 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-5 h-5 text-accent-400" />
                          <span className="font-mono text-dark-100">{selectedTarget.ip}</span>
                        </div>
                        <div className="text-sm text-dark-400 space-y-1">
                          <div>{selectedTarget.hostname || 'Unknown hostname'}</div>
                          <div>{selectedTarget.os}</div>
                          <div>Ports: {selectedTarget.ports.join(', ')}</div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-dark-500">Select a target from the Scan tab first</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-dark-100 mb-3">Technique</h4>
                    <select
                      value={selectedTechnique}
                      onChange={(e) => setSelectedTechnique(e.target.value)}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500 mb-4"
                    >
                      {techniques.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.category}) - {t.severity}
                        </option>
                      ))}
                    </select>
                    <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-dark-400">
                      <strong className="text-dark-100">MITRE:</strong> {techniques.find(t => t.id === selectedTechnique)?.mitre}<br />
                      <strong className="text-dark-100">Description:</strong> {techniques.find(t => t.id === selectedTechnique)?.desc}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-6">
                  <Button onClick={handleExecute} disabled={loading || !selectedTarget || !selectedCredential} className="flex-1">
                    <Zap className="w-4 h-4 mr-2" /> Execute Lateral Move
                  </Button>
                </div>

                {execOutput && (
                  <div className="mt-4 p-4 bg-dark-900 border border-dark-700 rounded-lg font-mono text-sm text-dark-300 max-h-64 overflow-auto">
                    {execOutput}
                  </div>
                )}
              </CardBody>
            </Card>
          </TabContent>

          <TabContent value="results">
            <Card>
              <CardBody className="p-0">
                {lateralMoves.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                      <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                      <ArrowRightLeft className="w-8 h-8 text-dark-600 relative mx-auto" />
                    </div>
                    <h3 className="text-lg font-medium text-dark-300 mb-1">No lateral move results</h3>
                    <p className="text-dark-500">Execute techniques to see results here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-dark-800 bg-dark-900/50">
                          <th className="px-4 py-3 text-left font-medium text-dark-400">Technique</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400">Target</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-24">Status</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Started</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Completed</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400">Output</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lateralMoves.map((move) => {
                          const tech = techniques.find(t => t.id === move.technique)
                          const cfg = statusConfig[move.status] || statusConfig.pending
                          const StatusIcon = cfg.icon
                          return (
                            <tr key={move.id} className="border-b border-dark-800/50 hover:bg-dark-800/50">
                              <td className="px-4 py-3"><span className="font-mono text-sm text-dark-100">{tech?.name || move.technique}</span></td>
                              <td className="px-4 py-3 font-mono text-sm text-dark-300">{move.target}</td>
                              <td className="px-4 py-3"><Badge variant="outline" className={clsx(cfg.color, cfg.bg + '/20')}><StatusIcon className="w-3 h-3 mr-1" />{move.status}</Badge></td>
                              <td className="px-4 py-3 text-dark-400 text-sm">{move.created_at ? formatDistanceToNow(new Date(move.created_at), { addSuffix: true }) : '-'}</td>
                              <td className="px-4 py-3 text-dark-400 text-sm">{move.completed_at ? formatDistanceToNow(new Date(move.completed_at), { addSuffix: true }) : '-'}</td>
                              <td className="px-4 py-3 text-dark-500 text-sm max-w-xs truncate font-mono">{move.output?.slice(0, 100) || '-'}</td>
                              <td className="px-4 py-3">{move.output && <button onClick={() => navigator.clipboard.writeText(move.output || '')} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400"><Copy className="w-4 h-4" /></button>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </TabContent>
        </Tabs>
      </div>
    </GradientBackground>
  )
}