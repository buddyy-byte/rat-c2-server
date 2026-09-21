import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/services/api'

export type AuthUser = {
  username: string
  email?: string
  bio?: string
  role?: 'owner' | 'operator'
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  login: (username: string, password: string, register?: boolean, email?: string) => Promise<void>
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

      login: async (username: string, password: string, register?: boolean, email?: string) => {
        const data = register
          ? await api.register(username, password, email)
          : await api.login(username, password)
        localStorage.setItem('auth_token', data.token)
        set({
          token: data.token,
          user: { username: data.user?.username || username, email: email || (data.user as any)?.email, role: data.user?.role || (username.toLowerCase() === 'chemical' ? 'owner' : 'operator') },
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
        if (!token) {
          set({ token: null, user: null, isAuthenticated: false })
          return
        }
        try {
          const me = await api.me()
          set({
            token,
            isAuthenticated: true,
            user: { username: me.username, email: me.email || '', role: (me.role === 'owner' ? 'owner' : 'operator') },
          })
        } catch {
          // invalid/expired token — request() already cleared storage + redirected
          set({ token: null, user: null, isAuthenticated: false })
        }
      },

      updateProfile: async (username: string, email: string) => {
        const current = get().user
        if (username && current && username !== current.username) {
          throw new Error('Username is permanent — it is tied to your license key')
        }
        await api.updateSettings({ email })
        set({ user: { ...(current || { username }), username: current?.username || username, email } })
      },

      changePassword: async (current: string, next: string) => {
        await api.updateSettings({ current_password: current, new_password: next })
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
