import * as React from 'react'
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAgentStore } from '@/stores/agentStore'
import { useUIStore } from '@/stores/uiStore'
import { api } from '@/services/api'
import { toast } from 'sonner'
import { Shield, RefreshCw, Search } from 'lucide-react'

const techniques = [
  { id: 'amsi_patch_memory', name: 'AMSI Bypass (memory)', category: 'amsi' },
  { id: 'etw_patch_ntdll', name: 'ETW Patch', category: 'etw' },
  { id: 'defender_disable_realtime', name: 'Disable Defender realtime', category: 'defender' },
  { id: 'defender_exclusion_path', name: 'Defender path exclusion', category: 'defender' },
  { id: 'unhook_ntdll', name: 'Unhook ntdll', category: 'edr' },
  { id: 'ppid_spoof', name: 'PPID spoof', category: 'av' },
  { id: 'sandbox_check_vm', name: 'VM detection', category: 'sandbox' },
  { id: 'firewall_disable', name: 'Disable firewall', category: 'firewall' },
]

export function EvasionPage() {
  const { agents, fetchAgents, selectedAgent, setSelectedAgent, fetchTasks, tasks } = useAgentStore()
  const pushNotice = useUIStore(s => s.pushNotice)
  const [q, setQ] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [catalog, setCatalog] = React.useState<any[]>([])

  React.useEffect(() => { fetchAgents() }, [fetchAgents])
  React.useEffect(() => {
    if (!selectedAgent && agents[0]) setSelectedAgent(agents[0])
  }, [agents, selectedAgent, setSelectedAgent])
  React.useEffect(() => {
    api.listEvasionTechniques().then(setCatalog).catch(() => setCatalog(techniques))
  }, [])

  const rows = (catalog.length ? catalog : techniques).filter((t: any) => {
    const name = (t.name || t.Name || t.id || '').toLowerCase()
    return !q || name.includes(q.toLowerCase()) || (t.id || '').includes(q.toLowerCase())
  })

  const run = async (id: string, name: string) => {
    const agentId = selectedAgent?.ID
    if (!agentId) { toast.error('pick an agent'); return }
    setBusy(id)
    try {
      await api.executeEvasion(agentId, id)
      toast.success(`${name} queued`)
      pushNotice({ kind: 'success', title: 'Evasion queued', body: `${name} on ${selectedAgent?.Hostname}` })
      await fetchTasks(agentId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <GradientText className="text-3xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>Evasion</GradientText>
          <p className="text-dark-400 mt-1">Queues the technique as a hidden PowerShell task on the agent</p>
        </div>
        <select
          className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-100"
          value={selectedAgent?.ID || ''}
          onChange={e => setSelectedAgent(agents.find(a => a.ID === e.target.value) || null)}
        >
          <option value="">select agent</option>
          {agents.map(a => <option key={a.ID} value={a.ID}>{a.Hostname} ({a.Status})</option>)}
        </select>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <Input className="pl-10" value={q} onChange={e => setQ(e.target.value)} placeholder="search techniques" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((t: any) => {
          const id = t.id || t.ID
          const name = t.name || t.Name || id
          return (
            <Card key={id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-dark-100">{name}</p>
                  <p className="text-xs text-dark-500">{t.category || t.Category || ''} {t.mitre || ''}</p>
                </div>
                <Button size="sm" disabled={!selectedAgent || busy === id} onClick={() => run(id, name)}>
                  {busy === id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  <span className="ml-2">Run</span>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {tasks.length > 0 && (
        <p className="text-xs text-dark-500 font-mono">{tasks.length} tasks on this agent</p>
      )}
    </div>
  )
}
