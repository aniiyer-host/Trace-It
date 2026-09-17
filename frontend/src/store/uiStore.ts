// Enhanced Zustand store for wallet + UI global state with better simulation
// TODO: Replace wallet slice with useWallet() from @solana/wallet-adapter-react

import { create } from 'zustand'
import type { User } from '@/types'


interface UIStore {
    // ── Auth ──────────────────────────────────────
    user: User | null
    setUser: (u: User | null) => void
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>

    // ── Active page / tab ───────────────────────────
    activeCampaignId: string | null
    setActiveCampaignId: (id: string | null) => void

    // ── Global loading overlay ───────────────────────
    globalLoading: boolean
    setGlobalLoading: (v: boolean) => void

    // ── UI State ─────────────────────────────────────
    sidebarCollapsed: boolean
    setSidebarCollapsed: (collapsed: boolean) => void
    notifications: Array<{ id: string; title: string; description: string; variant?: 'default' | 'destructive' | 'success' }>
    addNotification: (notification: Omit<{ id: string; title: string; description: string; variant?: 'default' | 'destructive' | 'success' }, 'id'>) => void
    removeNotification: (id: string) => void
    clearNotifications: () => void

    // ── Demo helpers ─────────────────────────────────
    resetUIState: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
    user: null,
    setUser: (u) => set({ user: u }),
    login: async (email: string, password: string) => {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500))
        // In a real app, this would call an auth API
        // For demo, we'll accept any email/password
        if (!email.trim() || !password.trim()) {
            throw new Error('Email and password are required')
        }
        const mockUser: User = {
            id: 'user_' + Date.now(),
            email,
            name: email.split('@')[0],
        }
        set({ user: mockUser })
    },
    logout: async () => {
        await new Promise(resolve => setTimeout(resolve, 300))
        set({ user: null })
        // Optionally disconnect wallet on logout
        // get().disconnectWallet()
    },

    activeCampaignId: null,
    setActiveCampaignId: (id) => set({ activeCampaignId: id }),

    globalLoading: false,
    setGlobalLoading: (v) => set({ globalLoading: v }),

    sidebarCollapsed: false,
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

    notifications: [],
    addNotification: (notification) => {
        const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        set(state => ({
            notifications: [...state.notifications, { ...notification, id }]
        }))
        // Auto-remove after 5 seconds
        setTimeout(() => {
            get().removeNotification(id)
        }, 5000)
    },
    removeNotification: (id) => set(state => ({
        notifications: state.notifications.filter(n => n.id !== id)
    })),
    clearNotifications: () => set({ notifications: [] }),

    resetUIState: () => {
        set({
            user: null,
            activeCampaignId: null,
            globalLoading: false,
            sidebarCollapsed: false,
            notifications: [],
        })
    },
}))