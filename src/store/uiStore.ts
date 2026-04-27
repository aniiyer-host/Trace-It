// Zustand store for wallet + UI global state
// TODO: Replace wallet slice with useWallet() from @solana/wallet-adapter-react

import { create } from 'zustand'
import type { WalletState } from '@/types'

interface UIStore {
    // ── Wallet ──────────────────────────────────────
    wallet: WalletState
    walletLoading: boolean
    setWallet: (w: WalletState) => void
    setWalletLoading: (v: boolean) => void

    // ── Active page / tab ───────────────────────────
    activeCampaignId: string | null
    setActiveCampaignId: (id: string | null) => void

    // ── Global loading overlay ───────────────────────
    globalLoading: boolean
    setGlobalLoading: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
    wallet: { connected: false, publicKey: null, balance: 0 },
    walletLoading: false,
    setWallet: (w) => set({ wallet: w }),
    setWalletLoading: (v) => set({ walletLoading: v }),

    activeCampaignId: null,
    setActiveCampaignId: (id) => set({ activeCampaignId: id }),

    globalLoading: false,
    setGlobalLoading: (v) => set({ globalLoading: v }),
}))
