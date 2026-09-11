import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/services/api'

export type AuthUser = {
  username: string
  email?: string
  bio?: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  updateProfile: (username: string, email: string) => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      loading: false,

      login: async (username: string, password: string) => {
        const data = await api.login(username, password)
        localStorage.setItem('auth_token', data.token)
        set({
          token: data.token,
          user: { username: data.user?.username || username, email: '' },
          isAuthenticated: true,
        })
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
          const existing = get().user
          set({
            token,
            isAuthenticated: true,
            user: existing || { username: 'admin', email: '' },
          })
        }
      },

      updateProfile: async (username: string, email: string) => {
        const current = get().user
        set({ user: { ...(current || { username }), username, email } })
      },

      changePassword: async (_current: string, _next: string) => {
        return
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
