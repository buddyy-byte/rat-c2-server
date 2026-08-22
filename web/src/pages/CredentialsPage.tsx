import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Monitor, Key, Shield, Globe, Search, Plus, RefreshCw, ChevronLeft, ChevronRight, Home, Wifi, WifiOff, AlertTriangle, XCircle, CheckCircle, Zap, Lock, Unlock, User, Terminal, Cpu, FileText, Keyboard, ArrowRightLeft, Settings, Download, Upload, Trash2, Copy, Eye, Play, Pause, Power } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

export function CredentialsPage() {
  const { agents, selectedAgent, credentials, fetchCredentials, addNotification } = useStore()
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (selectedAgent) {
      loadCredentials()
    }
  }, [selectedAgent])

  const loadCredentials = async () => {
    if (!selectedAgent) return
    setLoading(true)
    try {
      await fetchCredentials(selectedAgent.id)
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to load credentials: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const filtered = credentials.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return c.username.toLowerCase().includes(q) || c.domain?.toLowerCase().includes(q) || c.source.toLowerCase().includes(q)
  })

  const typeColors: Record<string, string> = {
    browser: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    wifi: 'bg-green-600/20 text-green-400 border-green-600/30',
    vpn: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
    rdp: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    ssh: 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30',
    ftp: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    database: 'bg-red-600/20 text-red-400 border-red-600/30',
    custom: 'bg-pink-600/20 text-pink-400 border-pink-600/30',
  }

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <Key className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Credentials
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'} • {credentials.length} total</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={loadCredentials} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <Card className="bg-dark-800/50 border-dark-700 mb-4">
          <CardBody className="p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="text"
                placeholder="Search credentials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </CardBody>
        </Card>

        {/* Table */}
        <Card>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-accent-400 animate-spin mx-auto mb-2" />
                <p className="text-dark-400">Loading credentials...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <Key className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No credentials found</h3>
                <p className="text-dark-500">Extract credentials from the agent first</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-800 bg-dark-900/50">
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Source</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Username</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Domain</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Password</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Extracted</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((cred) => (
                      <tr key={cred.id} className="border-b border-dark-800/50 hover:bg-dark-800/50">
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={typeColors[cred.type] || 'bg-dark-800 text-dark-400'}>
                            {cred.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-dark-300 font-mono text-sm">{cred.source}</td>
                        <td className="px-4 py-3 text-dark-100 font-mono text-sm">{cred.username}</td>
                        <td className="px-4 py-3 text-dark-400 font-mono text-sm">{cred.domain || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-dark-300 bg-dark-900 px-2 py-1 rounded select-all" title="Click to copy" onClick={() => navigator.clipboard.writeText(cred.password)}>
                            {cred.password}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-sm">
                          {cred.extracted_at ? formatDistanceToNow(new Date(cred.extracted_at), { addSuffix: true }) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => navigator.clipboard.writeText(JSON.stringify(cred, null, 2))} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400 transition-colors" title="Copy All">
                            <Copy className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </GradientBackground>
  )
}