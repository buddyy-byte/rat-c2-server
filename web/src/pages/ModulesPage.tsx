import * as React from 'react'
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAgentStore } from '@/stores/agentStore'
import { useUIStore } from '@/stores/uiStore'
import { api } from '@/services/api'
import { toast } from 'sonner'
import { Play, Pause, RefreshCw } from 'lucide-react'

export function ModulesPage() {
  const { agents, fetchAgents, selectedAgent, setSelectedAgent } = useAgentStore()
  const pushNotice = useUIStore(s => s.pushNotice)
  const [mods, setMods] = React.useState<any[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => { fetchAgents() }, [fetchAgents])
  React.useEffect(() => {
    if (!selectedAgent && agents[0]) setSelectedAgent(agents[0])
  }, [agents, selectedAgent, setSelectedAgent])
  React.useEffect(() => {
    api.getModules(selectedAgent?.ID || '').then(setMods).catch(() => setMods([]))
  }, [selectedAgent])

  const load = async (id: string, unload = false) => {
    const agentId = selectedAgent?.ID
    if (!agentId) { toast.error('pick an agent'); return }
    setBusy(id)
    try {
      if (unload) await api.unloadModule(agentId, id)
      else await api.loadModule(agentId, id)
      toast.success(`${unload ? 'unload' : 'load'} queued: ${id}`)
      pushNotice({ kind: 'info', title: 'Module', body: `${unload ? 'unload' : 'load'} ${id}` })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <GradientText className="text-3xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>Modules</GradientText>
          <p className="text-dark-400 mt-1">Load / unload queues a task on the selected agent</p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mods.map((m: any) => {
          const id = m.id || m.ID || m.name
          return (
            <Card key={id}>
              <CardContent className="p-5 space-y-3">
                <p className="font-medium text-dark-100">{m.name || m.Name}</p>
                <p className="text-sm text-dark-500">{m.description || m.Description}</p>
                <p className="text-xs uppercase tracking-wider text-dark-600">{m.category || m.Category}</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!selectedAgent || busy === id} onClick={() => load(id, false)}>
                    {busy === id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    <span className="ml-1">Load</span>
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selectedAgent} onClick={() => load(id, true)}>
                    <Pause className="w-4 h-4" />
                    <span className="ml-1">Unload</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {mods.length === 0 && <p className="text-dark-500 text-sm">no modules from API yet</p>}
    </div>
  )
}
