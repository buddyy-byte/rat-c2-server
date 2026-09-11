import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Density = 'compact' | 'comfortable' | 'spacious'
export type MonoFont = 'jetbrains' | 'fira' | 'cascadia' | 'monospace'

export type NotifyPrefs = {
  agent_online: boolean
  agent_offline: boolean
  command_complete: boolean
  file_transfer: boolean
  screenshot: boolean
  security_alerts: boolean
}

export type Notice = {
  id: string
  title: string
  body: string
  kind: 'info' | 'success' | 'error'
  read: boolean
  ts: number
}

type UIState = {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
  density: Density
  setDensity: (d: Density) => void
  monoFont: MonoFont
  setMonoFont: (f: MonoFont) => void
  notifyPrefs: NotifyPrefs
  setNotifyPref: (k: keyof NotifyPrefs, v: boolean) => void
  notices: Notice[]
  pushNotice: (n: Omit<Notice, 'id' | 'read' | 'ts'>) => void
  markAllRead: () => void
  clearNotices: () => void
  startedAt: number
}

const defaultPrefs: NotifyPrefs = {
  agent_online: true,
  agent_offline: true,
  command_complete: true,
  file_transfer: true,
  screenshot: true,
  security_alerts: true,
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      density: 'comfortable',
      setDensity: (d) => {
        set({ density: d })
        document.documentElement.dataset.density = d
      },
      monoFont: 'jetbrains',
      setMonoFont: (f) => {
        set({ monoFont: f })
        document.documentElement.dataset.mono = f
      },
      notifyPrefs: defaultPrefs,
      setNotifyPref: (k, v) => set({ notifyPrefs: { ...get().notifyPrefs, [k]: v } }),
      notices: [],
      pushNotice: (n) => set({
        notices: [{ ...n, id: crypto.randomUUID(), read: false, ts: Date.now() }, ...get().notices].slice(0, 80),
      }),
      markAllRead: () => set({ notices: get().notices.map(n => ({ ...n, read: true })) }),
      clearNotices: () => set({ notices: [] }),
      startedAt: Date.now(),
    }),
    {
      name: 'umbra-ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        density: s.density,
        monoFont: s.monoFont,
        notifyPrefs: s.notifyPrefs,
        notices: s.notices.slice(0, 40),
      }),
    }
  )
)
