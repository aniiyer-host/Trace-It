import { create } from 'zustand'
import type { Campaign, Milestone } from '@/types'
// import { cycleMilestoneStatus } from '@/services/mockApi'
import { apiService } from '@/utils/apiClient'

interface NGOStore {
    // ── Campaigns ─────────────────────────────────────
    campaigns: Campaign[]
    campaignsLoading: boolean
    loadCampaigns: () => Promise<void>

    // ── Attestation Management for NGO ───────────────
    pendingAttestations: Record<string, {
        id: string;
        donationId: string;
        amount: number;
        donorName: string;
        campaignTitle: string;
        requestedAt: string;
    }>
    fetchPendingAttestations: () => Promise<void>
    signAttestation: (donationId: string, type: 'receipt' | 'delivery', ngoName: string) => Promise<void>
    attestationStatus: Record<string, 'pending' | 'confirmed' | null>

    // ── Milestone Management ─────────────────────────
    updateMilestoneStatus: (milestoneId: string, status: NonNullable<Campaign['milestones'][0]['status']>) => void
    approveMilestone: (milestoneId: string) => Promise<void>
    uploadMilestoneProof: (milestoneId: string, description: string, cid: string) => Promise<void>
    cycleMilestoneStatus: (milestoneId: string) => Promise<void>

    // ── Demo helpers ──────────────────────────────────
    resetStore: () => void
    simulateNGOWorkflow: (campaignId: string) => Promise<void>
}

export const useNGOStore = create<NGOStore>((set, get) => ({
    campaigns: [],
    campaignsLoading: false,
    pendingAttestations: {},
    attestationStatus: {},

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

    // Attestation Management
    fetchPendingAttestations: async () => {
        try {
            const pendingList = await apiService.ngos.getPendingAttestations();
            // Convert array to Record<string, ...>
            const pendingMap = pendingList.reduce((acc, curr) => {
                acc[curr.id] = curr;
                return acc;
            }, {} as Record<string, any>);
            set({ pendingAttestations: pendingMap });
        } catch (error) {
            console.error('Failed to fetch pending attestations:', error);
        }
    },

    signAttestation: async (donationId: string, type: 'receipt' | 'delivery', ngoName: string) => {
        try {
            // Call real backend API for NGO attestation
            const result = await apiService.ngos.signAttestation(donationId, type)

            // Update attestation status
            set(state => ({
                attestationStatus: {
                    ...state.attestationStatus,
                    [donationId]: 'confirmed'
                }
            }))

            // Remove from pending attestations
            const { [donationId]: removed, ...rest } = state.pendingAttestations
            set({ pendingAttestations: rest })

        } catch (error) {
            console.error('Failed to sign attestation:', error)
            throw error
        }
    },

    // Milestone Management
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
            // The real API takes (milestoneId, proofData) where proofData contains description and proofHash (cid)
            await apiService.milestones.uploadProof(milestoneId, { description, proofHash: cid })
            // Optimistically update the milestone status to 'disbursed' and set proofCid
            const campaigns = get().campaigns.map((c) => ({
                ...c,
                milestones: c.milestones.map((m) =>
                    m.id === milestoneId
                        ? {...m, status: 'disbursed' as const, proofCid: cid}
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
            pendingAttestations: {},
            attestationStatus: {}
        })
    },
    simulateNGOWorkflow: async (campaignId) => {
        const { campaigns } = get()
        const campaign = campaigns.find((c) => c.id === campaignId)
        if (!campaign) throw new Error('Campaign not found')

        // Simulate a complete workflow: proof upload -> approval -> attestation
        const firstMilestone = campaign.milestones[0]
        if (firstMilestone) {
            // Upload proof
            await get().uploadMilestoneProof(
                firstMilestone.id,
                "Proof of work completed for this milestone",
                `QmProof${Date.now()}`
            )

            // Approve milestone
            await get().approveMilestone(firstMilestone.id)
        }
    },
}))