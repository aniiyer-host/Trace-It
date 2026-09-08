import { create } from 'zustand'
import type { Campaign, Milestone } from '@/types'
import { fetchCampaigns, approveMilestone, uploadMilestoneProof, cycleMilestoneStatus, getAttestationByDonationId, requestAttestation, createAttestation } from '@/services/mockApi'

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
            const campaigns = await fetchCampaigns()
            set({ campaigns, campaignsLoading: false })
        } catch (error) {
            console.error('Failed to load campaigns:', error)
            set({ campaignsLoading: false })
        }
    },

    // Attestation Management
    fetchPendingAttestations: async () => {
        // In a real app, this would fetch from backend
        // For demo, we'll simulate some pending attestations
        setTimeout(async () => {
            // Simulate fetching pending attestations
            const mockPending = {
                'don-001': {
                    id: 'don-001',
                    donationId: 'don-001',
                    amount: 5000,
                    donorName: 'John Doe',
                    campaignTitle: 'Flood Relief – Assam 2025',
                    requestedAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
                }
            }
            set({ pendingAttestations: mockPending })
        }, 500)
    },

    signAttestation: async (donationId: string, type: 'receipt' | 'delivery', ngoName: string) => {
        try {
            // Create attestation (simulating NGO signing with private key)
            const result = await createAttestation(donationId, type, ngoName)

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