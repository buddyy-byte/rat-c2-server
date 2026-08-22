import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Monitor, Search, RefreshCw, Copy, Trash2, Download, Image, ChevronLeft, ChevronRight, RefreshCw as RefreshIcon, Eye, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

export function ScreenshotsPage() {
  const { agents, selectedAgent, screenshots, fetchScreenshots, addNotification } = useStore()
  const [loading, setLoading] = useState(false)
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null)

  useEffect(() => {
    if (selectedAgent) {
      loadScreenshots()
    }
  }, [selectedAgent])

  const loadScreenshots = async () => {
    if (!selectedAgent) return
    setLoading(true)
    try {
      await fetchScreenshots(selectedAgent.id)
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to load screenshots: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const downloadScreenshot = async (id: string) => {
    try {
      const blob = await api.downloadScreenshot(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `screenshot-${id}.png`
      a.click()
      URL.revokeObjectURL(url)
      addNotification({ type: 'success', message: 'Screenshot downloaded' })
    } catch (error) {
      addNotification({ type: 'error', message: `Download failed: ${error}` })
    }
  }

  return (
    <GradientBackground>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700 flex items-center justify-center overflow-hidden">
                <DotGrid className="absolute inset-0" dotSize={2} gap={8} baseColor="#1e293b" activeColor="#d946ef" proximity={50} />
                <Monitor className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                Screenshots
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'} • {screenshots.length} total</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={loadScreenshots} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <Card>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-accent-400 animate-spin mx-auto mb-2" />
                <p className="text-dark-400">Loading screenshots...</p>
              </div>
            ) : screenshots.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <DotGrid className="absolute inset-0" dotSize={3} gap={16} baseColor="#1e293b" activeColor="#d946ef" proximity={80} />
                  <Monitor className="w-8 h-8 text-dark-600 relative mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-dark-300 mb-1">No screenshots found</h3>
                <p className="text-dark-500">Take a screenshot from the agent first</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                {screenshots.map((shot) => (
                  <div key={shot.id} className="group relative bg-dark-800/50 border border-dark-700 rounded-lg overflow-hidden transition-all hover:border-accent-500/50 hover:shadow-lg">
                    <div className="aspect-video bg-dark-900 relative overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-br from-accent-900/30 to-purple-900/30 flex items-center justify-center">
                        <Image className="w-12 h-12 text-accent-400/50" />
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => downloadScreenshot(shot.id)} className="p-2 bg-dark-900/80 hover:bg-dark-800 rounded-lg text-dark-300 hover:text-accent-400 transition-colors" title="Download">
                          <Download className="w-5 h-5" />
                        </button>
                        <button onClick={() => setSelectedScreenshot(shot.id)} className="p-2 bg-dark-900/80 hover:bg-dark-800 rounded-lg text-dark-300 hover:text-accent-400 transition-colors" title="View">
                          <Eye className="w-5 h-5" />
                        </button>
                        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(shot, null, 2))} className="p-2 bg-dark-900/80 hover:bg-dark-800 rounded-lg text-dark-300 hover:text-accent-400 transition-colors" title="Copy Info">
                          <Copy className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="font-mono text-xs text-dark-300 truncate">{shot.filename}</p>
                      <div className="flex items-center justify-between text-xs text-dark-500">
                        <span>{shot.width}x{shot.height}</span>
                        <span>{(shot.size / 1024).toFixed(1)} KB</span>
                        <span>{formatDistanceToNow(new Date(shot.taken_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Modal */}
        {selectedScreenshot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in" onClick={() => setSelectedScreenshot(null)}>
            <div className="relative max-w-4xl max-h-[90vh] w-full mx-4">
              <button onClick={() => setSelectedScreenshot(null)} className="absolute top-4 right-4 z-10 p-2 bg-dark-900/80 rounded-full text-dark-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
              <img src={`/api/screenshots/${selectedScreenshot}/download`} alt="Screenshot" className="w-full h-auto rounded-lg" />
            </div>
          </div>
        )}
      </div>
    </GradientBackground>
  )
}