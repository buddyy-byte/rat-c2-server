import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/services/api'
import type { Agent } from '@/types'

interface AuthState {
  token: string | null
  user: { username: string } | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        const data = await api.login(username, password)
        localStorage.setItem('auth_token', data.token)
        set({ token: data.token, user: data.user, isAuthenticated: true })
      },

      logout: async () => {
        try {
          await api.logout()
        } catch {}
        localStorage.removeItem('auth_token')
        set({ token: null, user: null, isAuthenticated: false })
      },

      checkAuth: async () => {
        const token = localStorage.getItem('auth_token')
        if (token) {
          set({ token, isAuthenticated: true, user: { username: 'admin' } })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)