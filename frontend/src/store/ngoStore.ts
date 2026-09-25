import { create } from "zustand";
import type { Campaign } from "@/types";
// import { cycleMilestoneStatus } from '@/services/mockApi'
import { apiService } from "@/utils/apiClient";

// FOR LINT error
interface PendingAttestation {
  id: string;
  donationId: string;
  type: "RECEIPT" | "DELIVERY";
  createdAt: string;
  allocatedAmount?: number | string;
  donation?: {
    amount: number;
    donorId: string;
    campaignId?: string;
  };
}

interface NGOStore {
  // ── Campaigns ─────────────────────────────────────
  campaigns: Campaign[];
  campaignsLoading: boolean;
  loadCampaigns: () => Promise<void>;
  //Cause of LINT Error
  // ── Attestation Management for NGO ───────────────
  //   pendingAttestations: Record<
  //     string,
  //     {
  //       id: string;
  //       donationId: string;
  //       type: "RECEIPT" | "DELIVERY";
  //       createdAt: string;
  //       donation?: {
  //         amount: number;
  //         donorId: string;
  //         campaignId?: string;
  //       };
  //     }
  //   >;

  pendingAttestations: Record<string, PendingAttestation>;
  fetchPendingAttestations: () => Promise<void>;
  signAttestation: (
    donationId: string,
    type: "receipt" | "delivery",
    ngoName: string,
  ) => Promise<void>;
  attestationStatus: Record<string, "pending" | "confirmed" | null>;

  // ── Milestone Management ─────────────────────────
  updateMilestoneStatus: (
    milestoneId: string,
    status: NonNullable<Campaign["milestones"][0]["status"]>,
  ) => void;
  approveMilestone: (milestoneId: string) => Promise<void>;
  uploadMilestoneProof: (
    milestoneId: string,
    description: string,
    cid: string,
  ) => Promise<void>;
  cycleMilestoneStatus: (milestoneId: string) => Promise<void>;

  // ── Demo helpers ──────────────────────────────────
  resetStore: () => void;
  simulateNGOWorkflow: (campaignId: string) => Promise<void>;
}

export const useNGOStore = create<NGOStore>((set, get) => ({
  campaigns: [],
  campaignsLoading: false,
  pendingAttestations: {},
  attestationStatus: {},

  loadCampaigns: async () => {
    set({ campaignsLoading: true });
    try {
      const campaigns = await apiService.campaigns.getAll();
      set({ campaigns, campaignsLoading: false });
    } catch (error) {
      console.error("Failed to load campaigns:", error);
      set({ campaignsLoading: false });
    }
  },

  // Attestation Management
  fetchPendingAttestations: async () => {
    try {
      const pendingList = await apiService.ngos.getPendingAttestations();
      // Convert array to Record<string, ...>
      const pendingMap = pendingList.reduce(
        (acc, curr) => {
          const type =
            curr.type === "RECEIPT" || curr.type === "DELIVERY"
              ? curr.type
              : null;
          if (!type) return acc;
          acc[curr.id] = { ...curr, type };
          return acc;
        },
        //Replaced any with PendingAttestation to fix LINT error
        {} as Record<string, PendingAttestation>,
      );
      set({ pendingAttestations: pendingMap });
    } catch (error) {
      console.error("Failed to fetch pending attestations:", error);
    }
  },
  // OLD ONE to test
  // signAttestation: async (
  //   donationId: string,
  //   type: "receipt" | "delivery",
  //   //Cause of LINT error
  //   //_ngoName: string,
  //   ngoName: string,
  // ) => {
  //   void ngoName; // Currently unused, but kept for future use or logging
  //   try {
  //     // Call real backend API for NGO attestation
  //     await apiService.ngos.signAttestation(donationId, type);

  //     // Update attestation status
  //     set((state) => ({
  //       attestationStatus: {
  //         ...state.attestationStatus,
  //         [donationId]: "confirmed",
  //       },
  //     }));

  //     // Remove from pending attestations
  //     //Cause of LINT error
  //     //const { [donationId]: removed, ...rest } = get().pendingAttestations;
  //     //const { [donationId]: removed, ...rest } = get().pendingAttestations
  //     const rest = { ...get().pendingAttestations };
  //     delete rest[donationId];
  //     set({ pendingAttestations: rest });
  //   } catch (error) {
  //     console.error("Failed to sign attestation:", error);
  //     throw error;
  //   }
  // },
  signAttestation: async (
    donationId: string,
    type: "receipt" | "delivery",
    ngoName: string,
  ) => {
    void ngoName;

    try {
      await apiService.ngos.signAttestation(donationId, type);

      set((state) => ({
        attestationStatus: {
          ...state.attestationStatus,
          [donationId]: "confirmed",
        },
      }));

      // Refresh from backend so only PENDING attestations remain
      await get().fetchPendingAttestations();
    } catch (error) {
      console.error("Failed to sign attestation:", error);
      throw error;
    }
  },
  // Milestone Management
  updateMilestoneStatus: (milestoneId, status) => {
    const campaigns = get().campaigns.map((c) => ({
      ...c,
      milestones: c.milestones.map((m) =>
        m.id === milestoneId ? { ...m, status } : m,
      ),
    }));
    set({ campaigns });
  },
  approveMilestone: async (milestoneId) => {
    try {
      await apiService.milestones.approve(milestoneId);
      // Optimistically update the milestone status to 'delivered'
      get().updateMilestoneStatus(milestoneId, "delivered");
    } catch (error) {
      console.error("Failed to approve milestone:", error);
      throw error;
    }
  },
  uploadMilestoneProof: async (milestoneId, _desc, cid) => {
    try {
      // The real API takes (milestoneId, proofData) where proofData contains description and proofHash (cid)
      await apiService.milestones.uploadProof(milestoneId, [] as File[]);
      // Optimistically update the milestone status to 'disbursed' and set proofCid
      const campaigns = get().campaigns.map((c) => ({
        ...c,
        milestones: c.milestones.map((m) =>
          m.id === milestoneId
            ? { ...m, status: "disbursed" as const, proofCid: cid }
            : m,
        ),
      }));
      set({ campaigns });
    } catch (error) {
      console.error("Failed to upload milestone proof:", error);
      throw error;
    }
  },
  // cycleMilestoneStatus: async (milestoneId) => {
  //LINT Error cause : no need of param removed _milestoneId
  cycleMilestoneStatus: async () => {
    throw new Error("Not implemented");
  },

  resetStore: () => {
    set({
      campaigns: [],
      campaignsLoading: false,
      pendingAttestations: {},
      attestationStatus: {},
    });
  },
  simulateNGOWorkflow: async (campaignId) => {
    const { campaigns } = get();
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new Error("Campaign not found");

    // Simulate a complete workflow: proof upload -> approval -> attestation
    const firstMilestone = campaign.milestones[0];
    if (firstMilestone) {
      // Upload proof
      await get().uploadMilestoneProof(
        firstMilestone.id,
        "Proof of work completed for this milestone",
        `QmProof${Date.now()}`,
      );

      // Approve milestone
      await get().approveMilestone(firstMilestone.id);
    }
  },
}));
