import { create } from 'zustand'
import type { Role } from '@/lib/auth-guards'

export interface User {
  id: string
  role: Role
  company_id: string
  name?: string
}

interface AppState {
  user: User | null
  setUser: (user: User | null) => void
  isInitialized: boolean
  setInitialized: (val: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  isInitialized: false,
  setInitialized: (val) => set({ isInitialized: val }),
}))
