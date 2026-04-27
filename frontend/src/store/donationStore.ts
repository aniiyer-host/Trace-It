// Zustand store for campaigns and donations
// TODO: Replace fetchCampaigns with real RPC calls when integrating @solana/web3.js

import { create } from 'zustand'
import type { Campaign, Donation } from '@/types'
import { fetchCampaigns } from '@/services/mockApi'

interface DonationStore {
    // ── Campaigns ─────────────────────────────────────
    campaigns: Campaign[]
    campaignsLoading: boolean
    loadCampaigns: () => Promise<void>

    // ── Donations made by the connected donor ─────────
    donations: Donation[]
    addDonation: (d: Donation) => void
    setDonations: (d: Donation[]) => void

    // ── Optimistic milestone status updates ───────────
    updateMilestoneStatus: (milestoneId: string, status: Campaign['milestones'][0]['status']) => void
}

export const useDonationStore = create<DonationStore>((set, get) => ({
    campaigns: [],
    campaignsLoading: false,
    loadCampaigns: async () => {
        set({ campaignsLoading: true })
        const campaigns = await fetchCampaigns()
        set({ campaigns, campaignsLoading: false })
    },

    donations: [],
    addDonation: (d) => set((s) => ({ donations: [d, ...s.donations] })),
    setDonations: (d) => set({ donations: d }),

    updateMilestoneStatus: (milestoneId, status) => {
        const campaigns = get().campaigns.map((c) => ({
            ...c,
            milestones: c.milestones.map((m) =>
                m.id === milestoneId ? { ...m, status } : m,
            ),
        }))
        set({ campaigns })
    },
}))
