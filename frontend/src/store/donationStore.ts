// Enhanced Zustand store for campaigns and donations with improved mock data simulation
// TODO: Replace fetchCampaigns with real RPC calls when integrating @solana/web3.js

import { create } from 'zustand'
import type { Campaign, Donation, Milestone } from '@/types'
import { fetchCampaigns, createDonation, fetchDonationsByWallet, approveMilestone, uploadMilestoneProof, cycleMilestoneStatus } from '@/services/mockApi'
import type { WalletState } from '@/types'
import { useUIStore } from '@/store/uiStore'

interface DonationStore {
    // ── Campaigns ─────────────────────────────────────
    campaigns: Campaign[]
    campaignsLoading: boolean
    loadCampaigns: () => Promise<void>

    // ── Donations made by the connected donor ─────────
    donations: Donation[]
    donationsLoading: boolean
    fetchDonations: (walletAddress: string) => Promise<void>
    addDonation: (d: Donation) => void
    setDonations: (d: Donation[]) => void
    createDonation: (campaign: Campaign, amount: number, paymentMethod: 'upi' | 'sol', orderId: string, txHash: string, walletAddress: string) => Promise<Donation>

    // ── Optimistic milestone status updates ───────────
    updateMilestoneStatus: (milestoneId: string, status: NonNullable<Campaign['milestones'][0]['status']>) => void
    approveMilestone: (milestoneId: string) => Promise<void>
    uploadMilestoneProof: (milestoneId: string, description: string, cid: string) => Promise<void>
    cycleMilestoneStatus: (milestoneId: string) => Promise<void>

    // ── Demo helpers ──────────────────────────────────
    resetStore: () => void
    simulateDonationFlow: (campaignId: string, amount: number, paymentMethod: 'upi' | 'sol') => Promise<void>
}

export const useDonationStore = create<DonationStore>((set, get) => ({
    campaigns: [],
    campaignsLoading: false,
    loadCampaigns: async () => {
        set({ campaignsLoading: true })
        try {
            const campaigns = await fetchCampaigns()
            set({ campaigns, campaignsLoading: false })
        } catch (error) {
            console.error('Failed to load campaigns:', error)
            set({ campaignsLoading: false })
        }
    },

    donations: [],
    donationsLoading: false,
    fetchDonations: async (walletAddress: string) => {
        set({ donationsLoading: true })
        try {
            const donations = await fetchDonationsByWallet(walletAddress)
            set({ donations, donationsLoading: false })
        } catch (error) {
            console.error('Failed to fetch donations:', error)
            set({ donationsLoading: false })
        }
    },
    addDonation: (d) => set((s) => ({ donations: [d, ...s.donations] })),
    setDonations: (d) => set({ donations: d }),
    createDonation: async (campaign, amount, paymentMethod, orderId, txHash, walletAddress) => {
        try {
            const donation = await createDonation(campaign, amount, paymentMethod, orderId, txHash, walletAddress)
            get().addDonation(donation)
            return donation
        } catch (error) {
            console.error('Failed to create donation:', error)
            throw error
        }
    },

    updateMilestoneStatus: (milestoneId, status) => {
        const campaigns = get().campaigns.map((c) => ({
            ...c,
            milestones: c.milestones.map((m) =>
                m.id === milestoneId ? { ...m, status } : m,
            ),
        }))
        set({ campaigns })
    },
    approveMilestone: async (milestoneId) => {
        try {
            await approveMilestone(milestoneId)
            // Optimistically update the milestone status to 'delivered'
            get().updateMilestoneStatus(milestoneId, 'delivered')
        } catch (error) {
            console.error('Failed to approve milestone:', error)
            throw error
        }
    },
    uploadMilestoneProof: async (milestoneId, description, cid) => {
        try {
            await uploadMilestoneProof({ milestoneId, description, cid })
            // Optimistically update the milestone status to 'disbursed' and set proofCid
            const campaigns = get().campaigns.map((c) => ({
                ...c,
                milestones: c.milestones.map((m) =>
                    m.id === milestoneId
                        ? { ...m, status: 'disbursed', proofCid: cid }
                        : m,
                ),
            }))
            set({ campaigns })
        } catch (error) {
            console.error('Failed to upload milestone proof:', error)
            throw error
        }
    },
    cycleMilestoneStatus: async (milestoneId) => {
        try {
            const newStatus = await cycleMilestoneStatus(milestoneId)
            get().updateMilestoneStatus(milestoneId, newStatus)
        } catch (error) {
            console.error('Failed to cycle milestone status:', error)
            throw error
        }
    },

    resetStore: () => {
        set({
            campaigns: [],
            campaignsLoading: false,
            donations: [],
            donationsLoading: false,
        })
        // Also reset UI store wallet state? Maybe not, as wallet connection might persist.
        // We'll reset the active campaign and user in UI store via separate action if needed.
    },
    simulateDonationFlow: async (campaignId, amount, paymentMethod) => {
        const { campaigns } = get()
        const campaign = campaigns.find((c) => c.id === campaignId)
        if (!campaign) throw new Error('Campaign not found')

        // Generate a mock orderId and txHash
        const orderId = `demo_order_${Date.now()}`
        const txHash = `demo_tx_${Date.now()}`

        // Create the donation
        await get().createDonation(campaign, amount, paymentMethod, orderId, txHash, 'demo_wallet_address')

        // Optionally, we could also update a milestone status here for demo purposes
        // For simplicity, we'll just create the donation.
    },
}))