import { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { DotGrid } from '@/components/ui/DotGrid'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Plus, RefreshCw, Download, Upload, File, Folder, Trash2, Copy, Eye, MoreVertical, Search, ChevronLeft, ChevronRight, Home, Zap } from 'lucide-react'
import clsx from 'clsx'

export function FileManagerPage() {
  const { agents, selectedAgent, addNotification, fileTransfers } = useStore()
  const [currentPath, setCurrentPath] = useState<string>('C:\\\\')
  const [files, setFiles] = useState<Array<{ name: string; size: number; type: 'file' | 'dir'; modified: string }>>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  useEffect(() => {
    if (selectedAgent) {
      loadFiles(currentPath)
    }
  }, [selectedAgent, currentPath])

  const loadFiles = async (path: string) => {
    if (!selectedAgent) return
    setLoading(true)
    try {
      // Mock file listing - replace with actual API when available
      setFiles([
        { name: 'Users', size: 0, type: 'dir', modified: '2024-01-15 10:30' },
        { name: 'Program Files', size: 0, type: 'dir', modified: '2024-01-10 08:00' },
        { name: 'Windows', size: 0, type: 'dir', modified: '2024-01-20 12:00' },
        { name: 'pagefile.sys', size: 1073741824, type: 'file', modified: '2024-01-20 12:00' },
        { name: 'hiberfil.sys', size: 2147483648, type: 'file', modified: '2024-01-18 22:00' },
      ])
    } catch (error) {
      addNotification({ type: 'error', message: `Failed to list files: ${error}` })
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (name: string) => {
    if (!selectedAgent) return
    try {
      addNotification({ type: 'info', message: `Download started: ${name}` })
      // Mock download - implement actual file transfer when API ready
    } catch (error) {
      addNotification({ type: 'error', message: `Download failed: ${error}` })
    }
  }

  const handleUpload = async (file: File) => {
    if (!selectedAgent) return
    setUploading(true)
    try {
      // Mock upload - implement actual file transfer when API ready
      await new Promise(resolve => setTimeout(resolve, 1000))
      loadFiles(currentPath)
      setShowUpload(false)
      addNotification({ type: 'success', message: `Uploaded ${file.name}` })
    } catch (error) {
      addNotification({ type: 'error', message: `Upload failed: ${error}` })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!selectedAgent || !confirm(`Delete ${name}?`)) return
    try {
      // Mock delete
      loadFiles(currentPath)
      addNotification({ type: 'success', message: `Deleted ${name}` })
    } catch (error) {
      addNotification({ type: 'error', message: `Delete failed: ${error}` })
    }
  }

  const navigateUp = () => {
    const parts = currentPath.split('\\\\').filter(Boolean)
    if (parts.length > 1) {
      parts.pop()
      setCurrentPath(parts.join('\\\\') + '\\\\')
    } else if (parts.length === 1) {
      setCurrentPath('C:\\\\')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
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
                <Folder className="w-5 h-5 text-accent-400 relative z-10" />
              </div>
              <GradientText className="text-3xl font-bold" colors={['#f8fafc', '#d946ef', '#a855f7']}>
                File Manager
              </GradientText>
            </div>
            <p className="text-dark-400 mt-1">{selectedAgent?.hostname || 'No agent selected'}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={navigateUp} disabled={currentPath === 'C:\\\\'}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" onClick={() => loadFiles(currentPath)} disabled={loading}>
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button variant="default" onClick={() => setShowUpload(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
          </div>
        </div>

        {/* Path Bar */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Home className="w-4 h-4 text-dark-400" />
              <span className="font-mono text-sm text-dark-300">C:\\\\</span>
              {currentPath !== 'C:\\\\' && currentPath.slice(3).split('\\\\').filter(Boolean).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-dark-500" />
                  <button
                    onClick={() => setCurrentPath(arr.slice(0, i + 1).join('\\\\') + '\\\\')}
                    className="font-mono text-sm text-dark-300 hover:text-accent-400 transition-colors"
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-dark-100">Files</h3>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="file-upload"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  className="hidden"
                  disabled={uploading}
                />
                <label
                  htmlFor="file-upload"
                  className="px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 hover:bg-dark-700 cursor-pointer"
                >
                  <Upload className="w-4 h-4 inline mr-1" />
                  Upload
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-800 bg-dark-900/50">
                    <th className="px-4 py-3 text-left font-medium text-dark-400 w-8"></th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400 w-32">Size</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400 w-48">Modified</th>
                    <th className="px-4 py-3 text-left font-medium text-dark-400 w-48">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-dark-500">Loading...</td>
                    </tr>
                  ) : files.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-dark-500">Empty directory</td>
                    </tr>
                  ) : (
                    files.map((file) => (
                      <tr
                        key={file.name}
                        className={clsx('border-b border-dark-800/50 hover:bg-dark-800/50 transition-colors', selectedFile === file.name && 'bg-accent-500/10')}
                        onClick={() => setSelectedFile(file.name)}
                      >
                        <td className="px-4 py-3">
                          {file.type === 'dir' ? (
                            <Folder className="w-5 h-5 text-yellow-400" />
                          ) : (
                            <File className="w-5 h-5 text-dark-400" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('font-mono text-sm', file.type === 'dir' ? 'text-yellow-300' : 'text-dark-100')}>
                            {file.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-sm font-mono">{file.type === 'dir' ? '-' : formatSize(file.size)}</td>
                        <td className="px-4 py-3 text-dark-500 text-sm">{file.modified}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {file.type === 'file' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownload(file.name) }}
                                className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-accent-400 transition-colors"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(file.name) }}
                              className="p-1.5 rounded bg-dark-800 hover:bg-red-900/30 text-dark-400 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {showUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <h3 className="font-medium text-dark-100">Upload File</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="file"
                  id="upload-file"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  className="hidden"
                />
                <label
                  htmlFor="upload-file"
                  className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-dark-700 rounded-lg cursor-pointer hover:border-accent-500 transition-colors"
                >
                  <Upload className="w-12 h-12 text-dark-500 mb-3" />
                  <p className="text-dark-400">Drag & drop or click to select</p>
                  <p className="text-xs text-dark-600 mt-1">Max size: 100MB</p>
                </label>
                <Button variant="ghost" onClick={() => setShowUpload(false)} className="w-full">
                  Cancel
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </GradientBackground>
  )
}