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
import { RefreshCw, Shield, Zap, Bug, Database, Globe, Lock, Unlock, CheckCircle, XCircle, AlertTriangle, Download, Upload, Terminal, Eye, Search, Plus, Minus, Copy, Clock } from 'lucide-react'
import clsx from 'clsx'

interface EvasionTechnique {
  id: string
  name: string
  description: string
  category: 'av' | 'edr' | 'amsi' | 'etw' | 'defender' | 'custom'
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'available' | 'running' | 'completed' | 'failed'
  mitre: string
}

const evasionTechniques: EvasionTechnique[] = [
  { id: 'defender_exclusion', name: 'Add Defender Exclusion', description: 'Add path/process to Windows Defender exclusion list via PowerShell', category: 'defender', severity: 'high', status: 'available', mitre: 'T1562.001' },
  { id: 'disable_realtime', name: 'Disable Real-time Protection', description: 'Disable Windows Defender real-time monitoring', category: 'defender', severity: 'critical', status: 'available', mitre: 'T1562.001' },
  { id: 'disable_tamper', name: 'Disable Tamper Protection', description: 'Disable Defender tamper protection via registry', category: 'defender', severity: 'critical', status: 'available', mitre: 'T1562.001' },
  { id: 'amsi_bypass', name: 'AMSI Bypass (Reflection)', description: 'Patch AmsiScanBuffer via reflection to disable scanning', category: 'amsi', severity: 'high', status: 'available', mitre: 'T1562.001' },
  { id: 'amsi_bypass2', name: 'AMSI Bypass (Memory Patch)', description: 'Direct memory patch of amsi.dll to bypass scanning', category: 'amsi', severity: 'critical', status: 'available', mitre: 'T1562.001' },
  { id: 'etw_patch', name: 'ETW Patch (Silent)', description: 'Patch EtwEventWrite to silence ETW logging', category: 'etw', severity: 'high', status: 'available', mitre: 'T1562.002' },
  { id: 'etw_disable', name: 'Disable ETW Providers', description: 'Disable Microsoft-Windows-Threat-Intelligence provider', category: 'etw', severity: 'medium', status: 'available', mitre: 'T1562.002' },
  { id: 'unhook_ntdll', name: 'Unhook NTDLL', description: 'Restore clean ntdll.dll from disk to remove userland hooks', category: 'edr', severity: 'high', status: 'available', mitre: 'T1562.001' },
  { id: 'unhook_kernel32', name: 'Unhook Kernel32/KernelBase', description: 'Restore clean kernel32.dll and kernelbase.dll', category: 'edr', severity: 'medium', status: 'available', mitre: 'T1562.001' },
  { id: 'direct_syscalls', name: 'Direct Syscalls', description: 'Execute syscalls directly bypassing userland API hooks', category: 'edr', severity: 'high', status: 'available', mitre: 'T1055' },
  { id: 'hwbp_evasion', name: 'Hardware Breakpoints', description: 'Use HW breakpoints for stealthy code execution', category: 'edr', severity: 'medium', status: 'available', mitre: 'T1055' },
  { id: 'ppid_spoof', name: 'PPID Spoofing', description: 'Spoof parent process ID to blend in with legitimate processes', category: 'av', severity: 'medium', status: 'available', mitre: 'T1055' },
  { id: 'blockdlls', name: 'BlockDLLs Policy', description: 'Enable BlockNonMicrosoftBinariesBoot to prevent non-MS DLL injection', category: 'defender', severity: 'medium', status: 'available', mitre: 'T1562.001' },
  { id: 'wdac_bypass', name: 'WDAC Bypass', description: 'Bypass Windows Defender Application Control via LOLBINs', category: 'defender', severity: 'high', status: 'available', mitre: 'T1562.001' },
  { id: 'custom_shellcode', name: 'Custom Shellcode Execution', description: 'Execute custom shellcode with custom encryption', category: 'custom', severity: 'critical', status: 'available', mitre: 'T1055' },
]

export function EvasionPage() {
  const { agents, selectedAgent, evasionResults, fetchEvasionResults, addNotification } = useStore()
  const [activeTab, setActiveTab] = useState<string>('techniques')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  useEffect(() => {
    if (selectedAgent) {
      fetchEvasionResults(selectedAgent.id)
    }
  }, [selectedAgent, fetchEvasionResults])

  const filteredTechniques = evasionTechniques.filter((t) => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.mitre.toLowerCase().includes(q)
    }
    return true
  })

  const executeTechnique = async (technique: EvasionTechnique) => {
    if (!selectedAgent) return
    try {
      await api.executeEvasion(selectedAgent.id, technique.id)
      addNotification({ type: 'success', message: `${technique.name} queued` })
    } catch (error) {
      addNotification({ type: 'error', message: `Failed: ${error}` })
    }
  }

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'defender': return 'bg-blue-600/20 text-blue-400 border-blue-600/30'
      case 'edr': return 'bg-purple-600/20 text-purple-400 border-purple-600/30'
      case 'amsi': return 'bg-orange-600/20 text-orange-400 border-orange-600/30'
      case 'etw': return 'bg-green-600/20 text-green-400 border-green-600/30'
      case 'av': return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30'
      case 'custom': return 'bg-red-600/20 text-red-400 border-red-600/30'
      default: return 'bg-dark-800 text-dark-400 border-dark-600'
    }
  }

  const getSeverityConfig = (sev: string) => {
    switch (sev) {
      case 'critical': return { color: 'text-red-400', bg: 'bg-red-400', icon: XCircle }
      case 'high': return { color: 'text-orange-400', bg: 'bg-orange-400', icon: AlertTriangle }
      case 'medium': return { color: 'text-yellow-400', bg: 'bg-yellow-400', icon: AlertTriangle }
      case 'low': return { color: 'text-green-400', bg: 'bg-green-400', icon: CheckCircle }
      default: return { color: 'text-dark-400', bg: 'bg-dark-400', icon: CheckCircle }
    }
  }

  return (
    <GradientBackground>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <Shield className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Evasion
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'} • Anti-analysis & Defense Evasion</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => selectedAgent && fetchEvasionResults(selectedAgent.id)}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabList>
            <TabTrigger value="techniques">Techniques ({evasionTechniques.length})</TabTrigger>
            <TabTrigger value="results">Results ({evasionResults.length})</TabTrigger>
          </TabList>

          <TabContent value="techniques">
            {/* Filters */}
            <Card className="mb-4">
              <CardBody className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                    <input
                      type="text"
                      placeholder="Search techniques..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    <option value="all">All Categories</option>
                    <option value="defender">Defender</option>
                    <option value="edr">EDR</option>
                    <option value="amsi">AMSI</option>
                    <option value="etw">ETW</option>
                    <option value="av">AV</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </CardBody>
            </Card>

            {/* Techniques Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTechniques.map((tech) => {
                const sev = getSeverityConfig(tech.severity)
                const SeverityIcon = sev.icon
                return (
                  <Card key={tech.id} className="group relative overflow-hidden transition-all duration-300 hover:border-accent-500/50 hover:shadow-lg hover:shadow-accent-500/10">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-dark-100">{tech.name}</h3>
                          <p className="text-xs text-dark-500 mt-1">{tech.mitre}</p>
                        </div>
                        <Badge variant="outline" className={getCategoryColor(tech.category)}>{tech.category.toUpperCase()}</Badge>
                      </div>
                    </CardHeader>
                    <CardBody className="pt-0">
                      <p className="text-sm text-dark-400 mb-4 line-clamp-2">{tech.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', sev.color, sev.bg + '/20')}>
                            <SeverityIcon className="w-3 h-3 mr-1" />
                            {tech.severity}
                          </span>
                          <span className={clsx('px-2 py-0.5 rounded text-xs font-medium',
                            tech.status === 'available' ? 'bg-green-600/20 text-green-400' :
                            tech.status === 'running' ? 'bg-blue-600/20 text-blue-400 animate-pulse' :
                            tech.status === 'completed' ? 'bg-green-600/20 text-green-400' :
                            'bg-red-600/20 text-red-400'
                          )}>
                            {tech.status}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant={tech.status === 'available' ? 'primary' : 'ghost'}
                          onClick={() => executeTechnique(tech)}
                          disabled={tech.status !== 'available' || !selectedAgent}
                        >
                          {tech.status === 'running' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                )
              })}
            </div>
          </TabContent>

          <TabContent value="results">
            <Card>
              <CardBody className="p-0">
                {evasionResults.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                      <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                      <Shield className="w-8 h-8 text-dark-600 relative mx-auto" />
                    </div>
                    <h3 className="text-lg font-medium text-dark-300 mb-1">No evasion results</h3>
                    <p className="text-dark-500">Execute techniques to see results here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-dark-800 bg-dark-900/50">
                          <th className="px-4 py-3 text-left font-medium text-dark-400">Technique</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-24">Status</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Executed</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Completed</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400">Output</th>
                          <th className="px-4 py-3 text-left font-medium text-dark-400 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {evasionResults.map((result) => {
                          const tech = evasionTechniques.find(t => t.id === result.technique_id)
                          return (
                            <tr key={result.id} className="border-b border-dark-800/50 hover:bg-dark-800/50">
                              <td className="px-4 py-3">
                                <span className="font-mono text-sm text-dark-100">{tech?.name || result.technique_id}</span>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={result.status === 'completed' ? 'success' : result.status === 'failed' ? 'destructive' : result.status === 'running' ? 'default' : 'outline'}>
                                  {result.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-dark-400 text-sm">
                                {result.executed_at ? new Date(result.executed_at).toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-3 text-dark-400 text-sm">
                                {result.completed_at ? new Date(result.completed_at).toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-3 text-dark-500 text-sm max-w-xs truncate font-mono">
                                {result.output?.slice(0, 100) || '-' }
                              </td>
                              <td className="px-4 py-3">
                                {result.output && (
                                  <button
                                    onClick={() => navigator.clipboard.writeText(result.output || '')}
                                    className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400 transition-colors"
                                    title="Copy Output"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
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