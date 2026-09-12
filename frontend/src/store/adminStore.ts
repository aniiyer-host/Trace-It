import { create } from 'zustand'
import type { Campaign, Milestone } from '@/types'
import { apiService } from '@/utils/apiClient'

interface AdminStore {
    // ── Campaigns ─────────────────────────────────────
    campaigns: Campaign[]
    campaignsLoading: boolean
    loadCampaigns: () => Promise<void>

    // ── Campaign Approval Management ──────────────────
    pendingCampaigns: any[]
    pendingCampaignsLoading: boolean
    fetchPendingCampaigns: () => Promise<void>
    approveCampaign: (campaignId: string) => Promise<void>

    // ── Attestation Management for Admin ─────────────
    pendingAttestations: Record<string, {
        id: string;
        donationId: string;
        amount: number;
        donorName: string;
        campaignTitle: string;
        ngoName: string;
        attestedAt: string;
        statement: string;
        type: 'receipt' | 'delivery';
    }>
    fetchPendingAttestations: () => Promise<void>
    approveAttestation: (attestationId: string) => Promise<void>
    rejectAttestation: (attestationId: string, reason: string) => Promise<void>
    attestationStatus: Record<string, 'pending' | 'approved' | 'rejected' | null>

    // ── Milestone Management ─────────────────────────
    pendingMilestoneApprovals: Record<string, Milestone>
    fetchPendingMilestoneApprovals: () => Promise<void>
    approveMilestone: (milestoneId: string) => Promise<void>
    rejectMilestone: (milestoneId: string, reason: string) => Promise<void>

    // ── Demo helpers ──────────────────────────────────
    resetStore: () => void
    simulateAdminWorkflow: () => Promise<void>
}

export const useAdminStore = create<AdminStore>((set, get) => ({
    campaigns: [],
    campaignsLoading: false,
    pendingCampaigns: [],
    pendingCampaignsLoading: false,
    pendingAttestations: {},
    attestationStatus: {},
    pendingMilestoneApprovals: {},

    fetchPendingCampaigns: async () => {
        set({ pendingCampaignsLoading: true })
        try {
            const pending = await apiService.admin.getPendingCampaigns()
            set({ pendingCampaigns: Array.isArray(pending) ? pending : [], pendingCampaignsLoading: false })
        } catch (error) {
            console.error('Failed to fetch pending campaigns:', error)
            set({ pendingCampaignsLoading: false })
        }
    },

    approveCampaign: async (campaignId: string) => {
        try {
            await apiService.admin.approveCampaign(campaignId)
            set((state) => ({
                pendingCampaigns: state.pendingCampaigns.filter((c: any) => c.id !== campaignId),
            }))
        } catch (error) {
            console.error('Failed to approve campaign:', error)
            throw error
        }
    },

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
            const attestations = await apiService.admin.getPendingAttestations();
            const pendingMap = attestations.reduce((acc, curr) => {
                acc[curr.id] = curr;
                return acc;
            }, {} as Record<string, any>);
            set({ pendingAttestations: pendingMap });
        } catch (error) {
            console.error('Failed to fetch pending attestations:', error);
        }
    },

    approveAttestation: async (attestationId: string) => {
        try {
            await apiService.admin.approveAttestation(attestationId)
            
            set((state: AdminStore) => ({
                attestationStatus: {
                    ...state.attestationStatus,
                    [attestationId]: 'approved'
                }
            }))

            // Remove from pending attestations
            set((state: AdminStore) => {
                const { [attestationId]: removed, ...rest } = state.pendingAttestations
                return { pendingAttestations: rest }
            })
        } catch (error) {
            console.error('Failed to approve attestation:', error)
            throw error
        }
    },

    rejectAttestation: async (attestationId: string, reason: string) => {
        try {
            await apiService.admin.rejectAttestation(attestationId, reason)

            set((state: AdminStore) => ({
                attestationStatus: {
                    ...state.attestationStatus,
                    [attestationId]: 'rejected'
                }
            }))

            // Remove from pending attestations
            set((state: AdminStore) => {
                const { [attestationId]: removed, ...rest } = state.pendingAttestations
                return { pendingAttestations: rest }
            })

            // Log the reason for debugging
            console.log(`Attestation ${attestationId} rejected: ${reason}`)
        } catch (error) {
            console.error('Failed to reject attestation:', error)
            throw error
        }
    },

    // Milestone Management
    fetchPendingMilestoneApprovals: async () => {
        try {
            const milestones = await apiService.admin.getPendingMilestones();
            const pendingMap = milestones.reduce((acc, curr) => {
                acc[curr.id] = curr;
                return acc;
            }, {} as Record<string, Milestone>);
            set({ pendingMilestoneApprovals: pendingMap });
        } catch (error) {
            console.error('Failed to fetch pending milestones:', error);
        }
    },

    approveMilestone: async (milestoneId: string) => {
        try {
            await apiService.admin.approveMilestone(milestoneId)
            // Update local state
            set((state: AdminStore) => {
                const campaigns = state.campaigns.map((c) => ({
                    ...c,
                    milestones: c.milestones.map((m) =>
                        m.id === milestoneId ? { ...m, status: 'delivered' as const } : m,
                    ),
                }))
                return { ...state, campaigns }
            })
        } catch (error) {
            console.error('Failed to approve milestone:', error)
            throw error
        }
    },

    rejectMilestone: async (milestoneId: string, reason: string) => {
        try {
            await apiService.admin.rejectMilestone(milestoneId, reason)
            console.log(`Milestone ${milestoneId} rejected: ${reason}`)
        } catch (error) {
            console.error('Failed to reject milestone:', error)
            throw error
        }
    },

    resetStore: () => {
        set({
            campaigns: [],
            campaignsLoading: false,
            pendingAttestations: {},
            attestationStatus: {},
            pendingMilestoneApprovals: {}
        })
    },
    simulateAdminWorkflow: async () => {
        // Simulate approving a pending attestation
        const pendingAttestations = get().pendingAttestations
        const firstAttestationId = Object.keys(pendingAttestations)[0]
        if (firstAttestationId) {
            await get().approveAttestation(firstAttestationId)
        }

        // Simulate approving a pending milestone
        const pendingMilestones = get().pendingMilestoneApprovals
        const firstMilestoneId = Object.keys(pendingMilestones)[0]
        if (firstMilestoneId) {
            await get().approveMilestone(firstMilestoneId)
        }
    }
}))