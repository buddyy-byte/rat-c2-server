import { create } from 'zustand'
import { api } from '@/services/api'
import type { Agent, Task, FileTransfer, Credential, Cookie, DiscordToken, Keystroke, Screenshot, ProcessInfo, LateralMove, EvasionAction, Module } from '@/types'

interface AgentState {
  agents: Agent[]
  selectedAgent: Agent | null
  tasks: Task[]
  fileTransfers: FileTransfer[]
  credentials: Credential[]
  cookies: Cookie[]
  discordTokens: DiscordToken[]
  keystrokes: Keystroke[]
  screenshots: Screenshot[]
  processes: ProcessInfo[]
  lateralMoves: LateralMove[]
  evasionResults: EvasionAction[]
  modules: Module[]
  loading: boolean
  error: string | null
  wsConnected: boolean

  fetchAgents: () => Promise<void>
  fetchAgent: (id: string) => Promise<void>
  setSelectedAgent: (agent: Agent | null) => void
  fetchTasks: (agentId: string) => Promise<void>
  fetchFileTransfers: (agentId: string) => Promise<void>
  fetchCredentials: (agentId: string) => Promise<void>
  fetchCookies: (agentId: string) => Promise<void>
  fetchDiscordTokens: (agentId: string) => Promise<void>
  fetchKeystrokes: (agentId: string) => Promise<void>
  fetchScreenshots: (agentId: string) => Promise<void>
  fetchProcesses: (agentId: string) => Promise<void>
  fetchLateralMoves: (agentId: string) => Promise<void>
  fetchEvasionResults: (agentId: string) => Promise<void>
  fetchModules: (agentId: string) => Promise<void>
  
  executeShell: (agentId: string, command: string) => Promise<Task>
  takeScreenshot: (agentId: string) => Promise<Task>
  sleep: (agentId: string, seconds: number) => Promise<Task>
  uninstall: (agentId: string) => Promise<Task>
  updateAgentBinary: (agentId: string, url: string) => Promise<Task>
  
  suspendProcess: (agentId: string, pid: number) => Promise<void>
  resumeProcess: (agentId: string, pid: number) => Promise<void>
  killProcess: (agentId: string, pid: number) => Promise<void>
  
  connectWS: (agentId?: string) => Promise<void>
  disconnectWS: () => void
  onAgentUpdate: (handler: (agent: Agent) => void) => () => void
  onTaskUpdate: (handler: (task: Task) => void) => () => void
  onNewTask: (handler: (task: Task) => void) => () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgent: null,
  tasks: [],
  fileTransfers: [],
  credentials: [],
  cookies: [],
  discordTokens: [],
  keystrokes: [],
  screenshots: [],
  processes: [],
  lateralMoves: [],
  evasionResults: [],
  modules: [],
  loading: false,
  error: null,
  wsConnected: false,

  fetchAgents: async () => {
    set({ loading: true, error: null })
    try {
      const agents = await api.getAgents()
      set({ agents, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch agents', loading: false })
    }
  },

  fetchAgent: async (id: string) => {
    try {
      const agent = await api.getAgent(id)
      set({ selectedAgent: agent })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch agent' })
    }
  },

  setSelectedAgent: (agent) => set({ selectedAgent: agent }),

  fetchTasks: async (agentId: string) => {
    try {
      const tasks = await api.getTasks(agentId)
      set({ tasks })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch tasks' })
    }
  },

  fetchFileTransfers: async (agentId: string) => {
    try {
      const fileTransfers = await api.getFileTransfers(agentId)
      set({ fileTransfers })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch file transfers' })
    }
  },

  fetchCredentials: async (agentId: string) => {
    try {
      const credentials = await api.getCredentials(agentId)
      set({ credentials })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch credentials' })
    }
  },

  fetchCookies: async (agentId: string) => {
    try {
      const cookies = await api.getCookies(agentId)
      set({ cookies })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch cookies' })
    }
  },

  fetchDiscordTokens: async (agentId: string) => {
    try {
      const discordTokens = await api.getDiscordTokens(agentId)
      set({ discordTokens })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch Discord tokens' })
    }
  },

  fetchKeystrokes: async (agentId: string) => {
    try {
      const keystrokes = await api.getKeystrokes(agentId)
      set({ keystrokes })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch keystrokes' })
    }
  },

  fetchScreenshots: async (agentId: string) => {
    try {
      const screenshots = await api.getScreenshots(agentId)
      set({ screenshots })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch screenshots' })
    }
  },

  fetchProcesses: async (agentId: string) => {
    try {
      const processes = await api.getProcesses(agentId)
      set({ processes })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch processes' })
    }
  },

  fetchLateralMoves: async (agentId: string) => {
    try {
      const lateralMoves = await api.getLateralMoves(agentId)
      set({ lateralMoves })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch lateral moves' })
    }
  },

  fetchEvasionResults: async (agentId: string) => {
    try {
      const evasionResults = await api.getEvasionResults(agentId)
      set({ evasionResults })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch evasion results' })
    }
  },

  fetchModules: async (agentId: string) => {
    try {
      const modules = await api.getModules(agentId)
      set({ modules })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch modules' })
    }
  },

  executeShell: async (agentId: string, command: string) => {
    const task = await api.executeShell(agentId, command)
    set((state) => ({ tasks: [task, ...state.tasks] }))
    return task
  },

  takeScreenshot: async (agentId: string) => {
    return api.takeScreenshot(agentId)
  },

  sleep: async (agentId: string, seconds: number) => {
    return api.sleep(agentId, seconds)
  },

  uninstall: async (agentId: string) => {
    return api.uninstall(agentId)
  },

  updateAgentBinary: async (agentId: string, url: string) => {
    return api.updateAgentBinary(agentId, url)
  },

  suspendProcess: async (agentId: string, pid: number) => {
    await api.suspendProcess(agentId, pid)
    get().fetchProcesses(agentId)
  },

  resumeProcess: async (agentId: string, pid: number) => {
    await api.resumeProcess(agentId, pid)
    get().fetchProcesses(agentId)
  },

  killProcess: async (agentId: string, pid: number) => {
    await api.killProcess(agentId, pid)
    get().fetchProcesses(agentId)
  },

  connectWS: async (agentId?: string) => {
    try {
      await api.connectWS(agentId)
      set({ wsConnected: true })
      
      api.onMessage('agent_update', (agent: Agent) => {
        set((state) => ({
          agents: state.agents.map((a) => (a.ID === agent.ID ? agent : a)),
          selectedAgent: state.selectedAgent?.ID === agent.ID ? agent : state.selectedAgent,
        }))
      })
      
      api.onMessage('task_update', (task: Task) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.ID === task.ID ? task : t)),
        }))
      })
      
      api.onMessage('new_task', (task: Task) => {
        set((state) => ({ tasks: [task, ...state.tasks] }))
      })
    } catch (error) {
      set({ wsConnected: false })
    }
  },

  disconnectWS: () => {
    api.disconnectWS()
    set({ wsConnected: false })
  },

  onAgentUpdate: (handler) => {
    api.onMessage('agent_update', handler)
    return () => api.offMessage('agent_update')
  },

  onTaskUpdate: (handler) => {
    api.onMessage('task_update', handler)
    return () => api.offMessage('task_update')
  },

  onNewTask: (handler) => {
    api.onMessage('new_task', handler)
    return () => api.offMessage('new_task')
  },
}))