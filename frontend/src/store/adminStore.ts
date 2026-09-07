import { create } from 'zustand'
import type { Campaign, Milestone } from '@/types'
import { fetchCampaigns, approveMilestone, getAttestationByDonationId } from '@/services/mockApi'

interface AdminStore {
    // ── Campaigns ─────────────────────────────────────
    campaigns: Campaign[]
    campaignsLoading: boolean
    loadCampaigns: () => Promise<void>

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
    pendingAttestations: {},
    attestationStatus: {},
    pendingMilestoneApprovals: {},

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
            const mockPending = {
                'att-001': {
                    id: 'att-001',
                    donationId: 'don-001',
                    amount: 5000,
                    donorName: 'Jane Smith',
                    campaignTitle: 'Flood Relief – Assam 2025',
                    ngoName: 'AidIndia Foundation',
                    attestedAt: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
                    statement: 'AidIndia Foundation confirms receipt of ₹5,000 donated for Flood Relief – Assam 2025 on 2025-07-08',
                    type: 'receipt' as const
                }
            }
            set({ pendingAttestations: mockPending })
        }, 500)
    },

    approveAttestation: async (attestationId: string) => {
        try {
            // In a real app, this would update the attestation status on-chain
            // For demo, we'll just update local state
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
        } catch (error) {
            console.error('Failed to reject attestation:', error)
            throw error
        }
    },

    // Milestone Management
    fetchPendingMilestoneApprovals: async () => {
        // In a real app, this would fetch pending milestones needing admin approval
        setTimeout(() => {
            // Mock data - in reality would come from backend
            set({ pendingMilestoneApprovals: {} }) // Empty for now
        }, 500)
    },

    approveMilestone: async (milestoneId: string) => {
        try {
            await approveMilestone(milestoneId)
            // Update local state
            set((state: AdminStore) => {
                const campaigns = state.campaigns.map((c) => ({
                    ...c,
                    milestones: c.milestones.map((m) =>
                        m.id === milestoneId ? { ...m, status: 'delivered' } : m,
                    ),
                }))
                return { campaigns }
            })
        } catch (error) {
            console.error('Failed to approve milestone:', error)
            throw error
        }
    },

    rejectMilestone: async (milestoneId: string, reason: string) => {
        try {
            // In a real app, this would send back to NGO for revision
            // For demo, we'll just log it
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