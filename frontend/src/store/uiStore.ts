// Enhanced Zustand store for wallet + UI global state with better simulation
// TODO: Replace wallet slice with useWallet() from @solana/wallet-adapter-react

import { create } from 'zustand'
import type { WalletState } from '@/types'
import type { User } from '@/services/mockAuth'
import { connectWallet, disconnectWallet } from '@/services/mockWallet'
import { shortenHash } from '@/lib/utils'

interface UIStore {
    // ── Auth ──────────────────────────────────────
    user: User | null
    setUser: (u: User | null) => void
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>

    // ── Wallet ──────────────────────────────────────
    wallet: WalletState
    walletLoading: boolean
    setWallet: (w: WalletState) => void
    setWalletLoading: (v: boolean) => void
    connectWallet: () => Promise<void>
    disconnectWallet: () => Promise<void>
    simulateBalanceChange: (amount: number) => void
    simulateTransaction: (txHash: string, amount: number, type: 'deposit' | 'withdrawal') => void

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
    addNotification: (notification: Omit<typeof UIStore['notifications'][0], 'id'>) => void
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
        const mockUser: User = {
            id: 'user_' + Date.now(),
            email,
            name: email.split('@')[0],
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(email.split('@')[0])}&background=random`,
        }
        set({ user: mockUser })
    },
    logout: async () => {
        await new Promise(resolve => setTimeout(resolve, 300))
        set({ user: null })
        // Optionally disconnect wallet on logout
        // get().disconnectWallet()
    },

    wallet: { connected: false, publicKey: null, balance: 0 },
    walletLoading: false,
    setWallet: (w) => set({ wallet: w }),
    setWalletLoading: (v) => set({ walletLoading: v }),
    connectWallet: async () => {
        set({ walletLoading: true })
        try {
            const state = await connectWallet()
            set({ wallet: state })
            // Simulate a balance fetch
            setTimeout(() => {
                get().simulateBalanceChange(parseFloat((Math.random() * 5).toFixed(2))) // Random balance between 0-5 SOL
            }, 1000)
        } catch (error) {
            console.error('Wallet connection failed:', error)
            // Toast will be handled by the calling component
            throw error
        } finally {
            set({ walletLoading: false })
        }
    },
    disconnectWallet: async () => {
        set({ walletLoading: true })
        const state = await disconnectWallet()
        set({ wallet: state })
        set({ walletLoading: false })
    },
    simulateBalanceChange: (amount: number) => {
        set(state => ({
            wallet: {
                ...state.wallet,
                balance: Math.max(0, state.wallet.balance + amount),
            }
        }))
    },
    simulateTransaction: (txHash: string, amount: number, type: 'deposit' | 'withdrawal') => {
        // In a real app, this would add to transaction history
        // For demo, we'll just adjust balance and maybe add a notification
        const balanceChange = type === 'deposit' ? amount : -amount
        get().simulateBalanceChange(balanceChange)
        get().addNotification({
            title: `Transaction ${type === 'deposit' ? 'received' : 'sent'}`,
            description: `${type === 'deposit' ? '+' : '-'}${amount} SOL • ${shortenHash(txHash)}`,
            variant: type === 'deposit' ? 'success' : 'default',
        })
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
            wallet: { connected: false, publicKey: null, balance: 0 },
            walletLoading: false,
            activeCampaignId: null,
            globalLoading: false,
            sidebarCollapsed: false,
            notifications: [],
        })
    },
}))