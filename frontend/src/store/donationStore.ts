// Enhanced Zustand store for campaigns and donations with improved mock data simulation
// TODO: Replace fetchCampaigns with real RPC calls when integrating @solana/web3.js

import { create } from 'zustand'
import type { Campaign, Donation, DonationStatus } from '@/types'
// import { cycleMilestoneStatus } from '@/services/mockApi'
import { apiService } from '@/utils/apiClient'

interface DonationStore {
    // ── Campaigns ─────────────────────────────────────
    campaigns: Campaign[]
    campaignsLoading: boolean
    loadCampaigns: () => Promise<void>

    // ── Donations made by the connected donor ─────────
    donations: Donation[]
    donationsLoading: boolean
    fetchDonations: (userId: string) => Promise<void>
    addDonation: (d: Donation) => void
    setDonations: (d: Donation[]) => void
    createDonation: (campaign: Campaign, amount: number, paymentMethod: 'upi' | 'sol', ngoId: string) => Promise<Donation>

    // ── Attestation Management ───────────────────────
    attestationStatus: Record<string, 'pending' | 'receipt_confirmed' | 'delivery_confirmed' | 'loading'>
    requestAttestation: (donationId: string, type: 'receipt' | 'delivery') => Promise<void>
    getAttestationStatus: (donationId: string) => Promise<'pending' | 'receipt_confirmed' | 'delivery_confirmed' | null>

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
            const campaigns = await apiService.campaigns.getAll()
            set({ campaigns, campaignsLoading: false })
        } catch (error) {
            console.error('Failed to load campaigns:', error)
            set({ campaignsLoading: false })
        }
    },

    donations: [],
    donationsLoading: false,
    attestationStatus: {},

    fetchDonations: async (userId: string) => {
        set({ donationsLoading: true })
        try {
            const donations = await apiService.donations.getByUser(userId)
            set({ donations, donationsLoading: false })
        } catch (error) {
            console.error('Failed to fetch donations:', error)
            set({ donationsLoading: false })
        }
    },
    addDonation: (d) => set((s) => ({ donations: [d, ...s.donations] })),
    setDonations: (d) => set({ donations: d }),
    createDonation: async (campaign, amount, paymentMethod, ngoId) => {
        try {
            const donation = await apiService.donations.create({
                campaignId: campaign.id,
                ngoId: ngoId,
                amount: amount,
                paymentMethod: paymentMethod.toUpperCase()
            }) as Donation
            get().addDonation(donation)
            return donation
        } catch (error) {
            console.error('Failed to create donation:', error)
            throw error
        }
    },

    // Attestation management
    requestAttestation: async (donationId: string, type: 'receipt' | 'delivery') => {
        // Update state to show loading
        set(state => ({
            attestationStatus: {
                ...state.attestationStatus,
                [donationId]: 'loading'
            }
        }))

        try {
            // Request attestation from real API
            const result = await apiService.donations.requestAttestation(donationId, type) as any

            // Update state with result
            set(state => ({
                attestationStatus: {
                    ...state.attestationStatus,
                    [donationId]: result.status === 'confirmed'
                        ? (type === 'receipt' ? 'receipt_confirmed' : 'delivery_confirmed')
                        : 'pending'
                }
            }))
        } catch (error) {
            console.error('Failed to request attestation:', error)
            // Reset to pending on error
            set(state => ({
                attestationStatus: {
                    ...state.attestationStatus,
                    [donationId]: 'pending'
                }
            }))
        }
    },

    getAttestationStatus: async (donationId: string) => {
        // Check if we have cached status
        const cachedStatus = get().attestationStatus[donationId]
        if (cachedStatus) {
            return cachedStatus === 'loading' ? null : cachedStatus
        }

        // Try to fetch from API
        try {
            const attestation = await apiService.donations.getAttestation(donationId) as any
            if (!attestation) {
                return null
            }

            // Map API status to our status
            const status = attestation.type === 'receipt' ? 'receipt_confirmed' : 'delivery_confirmed'

            // Update cache
            set(state => ({
                attestationStatus: {
                    ...state.attestationStatus,
                    [donationId]: status
                }
            }))

            return status
        } catch (error) {
            console.error('Failed to get attestation status:', error)
            return null
        }
    },

    updateMilestoneStatus: (milestoneId, status: DonationStatus) => {
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
            await apiService.milestones.approve(milestoneId)
            // Optimistically update the milestone status to 'delivered'
            get().updateMilestoneStatus(milestoneId, 'delivered')
        } catch (error) {
            console.error('Failed to approve milestone:', error)
            throw error
        }
    },
    uploadMilestoneProof: async (milestoneId, description, cid) => {
        try {
            await apiService.milestones.uploadProof(milestoneId, { description, proofHash: cid })
            // Optimistically update the milestone status to 'disbursed' and set proofCid
            const campaigns = get().campaigns.map((c) => ({
                ...c,
                milestones: c.milestones.map((m) =>
                    m.id === milestoneId
                        ? {...m, status: 'disbursed' as DonationStatus, proofCid: cid}
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
        throw new Error('Not implemented')
    },

    resetStore: () => {
        set({
            campaigns: [],
            campaignsLoading: false,
            donations: [],
            donationsLoading: false,
            attestationStatus: {}
        })
    },
    simulateDonationFlow: async (campaignId, amount, paymentMethod) => {
        const { campaigns } = get()
        const campaign = campaigns.find((c) => c.id === campaignId)
        if (!campaign) throw new Error('Campaign not found')

        // Create the donation
        await get().createDonation(campaign, amount, paymentMethod, (campaign as any).ngoId || (campaign as any).ngo?.id || (campaign as any).ngo)

        // Optionally, we could also update a milestone status here for demo purposes
        // For simplicity, we'll just create the donation.
    },
}))