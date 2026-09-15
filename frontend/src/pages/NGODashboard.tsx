import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
// import { Upload, Bell, CheckCircle, Plus, Clock } from 'lucide-react'
import {
  Upload,
  Bell,
  CheckCircle,
  Plus,
  Clock,
  Loader2,
  Eye,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { StatusBadge } from "@/components/StatusBadge";
import { MilestoneTimeline } from "@/components/MilestoneTimeline";
import { ProofUploadDialog } from "@/components/ProofUploadDialog";
import { CreateCampaignDialog } from "@/components/CreateCampaignDialog";
import AttestationSignDialog from "@/components/AttestationSignDialog";
import { useDonationStore } from "@/store/donationStore";
import { useNGOStore } from "@/store/ngoStore";
import { apiService } from "@/utils/apiClient";
import { useToast } from "@/hooks/use-toast";
import { formatUSD, cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import type { Campaign, Milestone } from "@/types";

/*
 * OLD CODE PRESERVED (Commented):
 * const NGO_CAMPAIGN_IDS = ['camp-001', 'camp-002']
 */

function AnimatedStat({
  value,
  label,
  isCurrency,
}: {
  value: number;
  label: string;
  isCurrency?: boolean;
}) {
  const count = useCountUp(value, 1500, true);
  return (
    <div className="space-y-2">
      <div className="text-3xl md:text-5xl font-bold tabular-nums tracking-tighter">
        {isCurrency ? formatUSD(count) : count.toLocaleString()}
      </div>
      <div className="text-sm font-semibold uppercase tracking-widest text-foreground/40">
        {label}
      </div>
    </div>
  );
}

function BeneficiaryIdReveal({ campaignId }: { campaignId: string }) {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleReveal = async () => {
    if (revealedId) return;
    setLoading(true);
    try {
      const res = await apiService.campaigns.getBeneficiaryId(campaignId);
      setRevealedId(res.beneficiaryId);
      // } catch (err: any) {
      //   toast({
      //     title: "Error fetching Beneficiary ID",
      //     description: err.response?.data?.error || err.message,
      //     variant: "destructive",
      //   });
      // }
    } catch (err: unknown) {
      //Cause of LINT error
      const error = err as {
        response?: {
          data?: {
            error?: string;
          };
        };
        message?: string;
      };

      toast({
        title: "Error fetching Beneficiary ID",
        description:
          error.response?.data?.error ||
          error.message ||
          "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!revealedId) return;
    navigator.clipboard.writeText(revealedId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!revealedId) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleReveal}
        disabled={loading}
        className="gap-2 rounded-full h-8 px-3 text-xs border-foreground/20 text-muted-foreground hover:text-foreground"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        Unlock Beneficiary ID
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="font-mono text-xs bg-foreground/[0.03] border border-foreground/10 px-3 py-1.5 rounded-l-md text-muted-foreground select-all h-8 flex items-center">
        {revealedId}
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={handleCopy}
        className="h-8 w-8 rounded-r-md rounded-l-none border-l-0 bg-background hover:bg-foreground/5"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

export default function NGODashboard() {
  //Cause of LINT error
  // const { campaigns: _storeCampaigns, updateMilestoneStatus } =
  //   useDonationStore();
  const { updateMilestoneStatus } = useDonationStore();
  const { pendingAttestations, fetchPendingAttestations, attestationStatus } =
    useNGOStore();

  // selectedView: 'inbox' | campaignId
  const [selectedView, setSelectedView] = useState<string>("inbox");

  const [ngoCampaigns, setNgoCampaigns] = useState<Campaign[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [reapplyingId, setReapplyingId] = useState<string | null>(null);

  const [proofMs, setProofMs] = useState<Milestone | null>(null);
  const [proofCampaign, setProofCampaign] = useState<Campaign | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [attestationDialogOpen, setAttestationDialogOpen] = useState(false);
  const [selectedAttestation, setSelectedAttestation] = useState<{
    id: string;
    donationId: string;
    type: "RECEIPT" | "DELIVERY";
    createdAt: string;
    donation?: {
      amount: number;
      donorId: string;
      campaignId?: string;
    };
  } | null>(null);
  const { toast } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const fetchNgoData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [rawCampaigns, rawDisbursements] = await Promise.all([
        apiService.campaigns.getByNgo(),
        apiService.charity.getDisbursements(),
      ]);

      //FOr LINT Error
      type CampaignResponse = Omit<Campaign, "ngo"> & {
        ngo?: {
          organisationName?: string;
        };
      };

      type DisbursementResponse = {
        id: string;
        campaignId: string;
        amountInr: number | string;
        status: string;
        cohort?: {
          name?: string;
        };
        fieldReportUrl?: string | null;
        proofSubmittedAt?: string | null;
        rejectionReason?: string | null;
        solanaTxHash?: string | null;
      };

      // Stitch disbursements onto campaigns client-side as milestones
      //Cause of LINT Error
      // const stitched: Campaign[] = (rawCampaigns || []).map((camp) => {
      //   const relatedDisbursements = (rawDisbursements || []).filter(
      //     (d: any) => d.campaignId === camp.id,
      //   );
      const stitched: Campaign[] = (rawCampaigns || []).map(
        (camp: CampaignResponse) => {
          const relatedDisbursements = (rawDisbursements || []).filter(
            (d: DisbursementResponse) => d.campaignId === camp.id,
          );

          const milestones: Milestone[] =
            relatedDisbursements.length > 0
              ? relatedDisbursements.map((d: DisbursementResponse) => ({
                  id: d.id,
                  campaignId: camp.id,
                  title:
                    d.cohort?.name ||
                    `Disbursement: ₹${Number(d.amountInr).toLocaleString()}`,
                  description: d.fieldReportUrl
                    ? `Report attached`
                    : `Disbursement request for ₹${Number(d.amountInr).toLocaleString()} (${d.status})`,
                  targetAmount: Number(d.amountInr),
                  status:
                    d.status === "SETTLED"
                      ? "delivered"
                      : d.status === "APPROVED"
                        ? "disbursed"
                        : "allocated",
                  proofSubmittedAt: d.proofSubmittedAt,
                  rejectionReason: d.rejectionReason,
                  txHash: d.solanaTxHash,
                }))
              : camp.milestones || [];

          return {
            id: camp.id,
            title: camp.title,
            ngoId: camp.ngoId,
            ngo: camp.ngo?.organisationName || camp.ngo || "My NGO",
            ngoName: camp.ngo?.organisationName || camp.ngo || "My NGO",
            description: camp.description,
            targetAmount: Number(camp.targetAmount),
            raisedAmount: Number(camp.raisedAmount || 0),
            status: camp.status,
            milestones,
            category: camp.category || "education",
          };
        },
      );

      setNgoCampaigns(stitched);
    } catch (err) {
      console.error("Failed to fetch NGO campaigns/disbursements:", err);
    } finally {
      setLoadingData(false);
    }
  }, []);
  //Cause of LINT error
  // useEffect(() => {
  //   if (user && user.role === "CHARITY") {
  //     fetchNgoData();
  //     fetchPendingAttestations();
  //   }
  // }, [user, fetchNgoData, fetchPendingAttestations]);
  useEffect(() => {
    if (!user || user.role !== "CHARITY") return;

    const loadNgoData = async () => {
      await fetchNgoData();
      await fetchPendingAttestations();
    };

    void loadNgoData();
  }, [user, fetchNgoData, fetchPendingAttestations]);

  /*
   * OLD CODE PRESERVED (Commented):
   * The old handleApprove called the admin-only endpoint from NGO dashboard, causing 403 Forbidden.
   * const handleApproveOld = async (ms: Milestone) => {
   *     setApprovingId(ms.id)
   *     try {
   *         await apiService.milestones.approve(ms.id)
   *         updateMilestoneStatus(ms.id, 'delivered')
   *         toast({ title: `Milestone "${ms.title}" approved & funds released!` })
   *     } catch {
   *         toast({ title: 'Approval failed', variant: 'destructive' })
   *     } finally {
   *         setApprovingId(null)
   *     }
   * }
   */

  const handleProofSuccess = (ms: Milestone) => {
    updateMilestoneStatus(ms.id, ms.status);
    fetchNgoData();
    toast({ title: "Proof submitted — awaiting admin approval" });
  };

  const handleAttestationSelect = (attestation: {
    id: string;
    donationId: string;
    type: "RECEIPT" | "DELIVERY";
    createdAt: string;
    donation?: {
      amount: number;
      donorId: string;
      campaignId?: string;
    };
  }) => {
    setSelectedAttestation(attestation);
    setAttestationDialogOpen(true);
  };

  const handleReapply = async (campaignId: string) => {
    setReapplyingId(campaignId);
    try {
      await apiService.campaigns.submit(campaignId);
      toast({ title: "Campaign resubmitted for approval" });
      fetchNgoData();
    } catch (err) {
      console.error("Failed to resubmit campaign:", err);
      toast({ title: "Failed to resubmit", variant: "destructive" });
    } finally {
      setReapplyingId(null);
    }
  };

  // Collect all pending milestone actions across NGO campaigns
  const pendingMilestoneActions = ngoCampaigns.flatMap((camp) => {
    return (camp.milestones || [])
      .filter(
        (m) =>
          m.status === "allocated" ||
          m.status === "disbursed" ||
          m.status === "delivered",
      )
      .map((m) => ({ campaign: camp, milestone: m }));
  });

  const selectedCampaignObj = ngoCampaigns.find((c) => c.id === selectedView);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
        <h2 className="text-4xl font-bold tracking-tighter">Access Denied</h2>
        <p className="text-muted-foreground text-lg max-w-md text-balance">
          Please sign in to access the NGO operational console.
        </p>
        <Button onClick={() => navigate("/login")}>Sign In</Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto min-h-[80vh] flex flex-col md:flex-row pb-20 animate-fade-in md:pt-16">
      {/* LEFT PANE - Typographic Sidebar (Mobile Sticky Ribbon) */}
      <div className="md:w-64 shrink-0 md:pr-8 lg:pr-12 border-b md:border-b-0 border-foreground/10 md:border-none sticky top-[64px] md:top-32 z-40 bg-background md:bg-transparent pt-4 md:pt-0">
        <div className="mb-4 hidden md:block">
          <Button
            onClick={() => setCreateCampaignOpen(true)}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
            size="sm"
          >
            <Plus className="h-4 w-4" /> Create Campaign
          </Button>
        </div>

        <div className="flex md:flex-col overflow-x-auto snap-x snap-mandatory hide-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            onClick={() => setSelectedView("inbox")}
            className={cn(
              "snap-start shrink-0 flex items-center justify-between md:w-full text-left py-4 px-6 md:px-4 text-sm font-semibold transition-colors outline-none",
              selectedView === "inbox"
                ? "text-foreground border-b-2 md:border-b-0 md:border-l-2 border-foreground"
                : "text-foreground/50 border-b-2 md:border-b-0 md:border-l-2 border-transparent hover:text-foreground",
            )}
          >
            <span>Action Inbox</span>
            {Object.keys(pendingAttestations).length +
              pendingMilestoneActions.filter(
                (x) =>
                  !(
                    x.milestone.status === "delivered" &&
                    attestationStatus[`don-${x.milestone.id}`] === "confirmed"
                  ),
              ).length >
              0 && (
              <span className="text-foreground/40 ml-2">
                {Object.keys(pendingAttestations).length +
                  pendingMilestoneActions.filter(
                    (x) =>
                      !(
                        x.milestone.status === "delivered" &&
                        attestationStatus[`don-${x.milestone.id}`] ===
                          "confirmed"
                      ),
                  ).length}
              </span>
            )}
          </button>

          {ngoCampaigns.map((c) => {
            const count = pendingMilestoneActions.filter(
              (x) =>
                x.campaign.id === c.id &&
                !(
                  x.milestone.status === "delivered" &&
                  attestationStatus[`don-${x.milestone.id}`] === "confirmed"
                ),
            ).length;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedView(c.id)}
                className={cn(
                  "snap-start shrink-0 flex items-center justify-between md:w-full text-left py-4 px-6 md:px-4 text-sm font-medium transition-colors outline-none",
                  selectedView === c.id
                    ? "text-foreground border-b-2 md:border-b-0 md:border-l-2 border-foreground"
                    : "text-foreground/50 border-b-2 md:border-b-0 md:border-l-2 border-transparent hover:text-foreground",
                )}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="truncate">
                    {c.title.split("–")[0].trim()}
                  </span>
                  <StatusBadge
                    status={c.status ?? "UNKNOWN"}
                    className="shrink-0"
                  />
                </div>
                {count > 0 && (
                  <span className="text-foreground/40 ml-2 shrink-0">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANE - Workspace */}
      <div className="flex-1 md:pl-8 lg:pl-16 pt-8 md:pt-0 px-6 md:px-0">
        <AnimatePresence mode="wait">
          {/* INBOX VIEW */}
          {selectedView === "inbox" && (
            <motion.div
              key="inbox"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-12"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter flex items-center gap-3">
                    Action Inbox
                    {loadingData && (
                      <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
                    )}
                  </h1>
                  <p className="text-foreground/50 mt-2">
                    Global tasks requiring your signature or proof upload.
                  </p>
                </div>
                <Button
                  onClick={() => setCreateCampaignOpen(true)}
                  className="sm:hidden bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Create Campaign
                </Button>
              </div>

              <div className="space-y-4">
                {/* Attestation Requests */}
                {Object.entries(pendingAttestations).map(
                  ([key, attestation]) => {
                    const campaignTitle =
                      ngoCampaigns.find(
                        (c) =>
                          //Cause of LINT Error
                          // c.id === (attestation.donation as any)?.campaignId,
                          c.id ===
                          (typeof attestation.donation === "object" &&
                          attestation.donation !== null
                            ? attestation.donation.campaignId
                            : undefined),
                      )?.title ||
                      `Campaign ${attestation.donationId?.substring(0, 8)}`;

                    const isDelivery = attestation.type === "DELIVERY";

                    return (
                      <div
                        key={`att-${key}`}
                        className={cn(
                          "group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 transition-colors",
                          isDelivery
                            ? "border-l-blue-500"
                            : "border-l-emerald-500",
                        )}
                      >
                        <div className="space-y-1">
                          <div
                            className={cn(
                              "text-sm font-semibold tracking-widest uppercase",
                              isDelivery
                                ? "text-blue-600 dark:text-blue-500"
                                : "text-emerald-600 dark:text-emerald-500",
                            )}
                          >
                            {isDelivery
                              ? "Delivery Attestation"
                              : "Receipt Attestation"}
                          </div>
                          <div className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
                            {isDelivery
                              ? "Confirm delivery to beneficiary"
                              : "Confirm you received the funds"}
                          </div>
                          <div className="text-2xl font-bold tracking-tighter tabular-nums pt-1">
                            {formatUSD(Number(attestation.donation?.amount))}
                          </div>
                          <div className="text-foreground/70">
                            {attestation.donation?.donorId
                              ? `Donor ${attestation.donation.donorId.substring(0, 8)}`
                              : "Donor"}{" "}
                            <span className="text-foreground/30 mx-2">•</span>{" "}
                            {campaignTitle}
                          </div>
                          <div className="text-xs text-foreground/40 mt-1">
                            Requested{" "}
                            {new Date(
                              attestation.createdAt,
                            ).toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleAttestationSelect(attestation)}
                          size="lg"
                          className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          Sign & Release
                        </Button>
                      </div>
                    );
                  },
                )}

                {/* Milestone Tasks */}
                {pendingMilestoneActions.map(({ campaign, milestone }) => {
                  // If delivered and attestation is confirmed, skip rendering it in the inbox
                  if (
                    milestone.status === "delivered" &&
                    attestationStatus[`don-${milestone.id}`] === "confirmed"
                  )
                    return null;

                  const borderLeftColor =
                    milestone.status === "allocated"
                      ? "border-l-primary"
                      : milestone.status === "delivered"
                        ? "border-l-emerald-500"
                        : "border-l-foreground/20";

                  return (
                    <div
                      key={milestone.id}
                      className={cn(
                        "group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 transition-colors",
                        borderLeftColor,
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-3 mb-1">
                          <StatusBadge status={milestone.status} />
                          <span className="text-sm font-medium text-foreground/50">
                            {campaign.title}
                          </span>
                        </div>
                        <div className="text-2xl font-bold tracking-tighter">
                          {milestone.title}
                        </div>
                        <div className="text-foreground/70 line-clamp-1">
                          {milestone.description}
                        </div>
                        <div className="text-sm text-foreground/50 mt-1 tabular-nums">
                          Target:{" "}
                          <span className="font-bold text-foreground">
                            {formatUSD(milestone.targetAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 w-full sm:w-auto">
                        {milestone.status === "allocated" && (
                          <Button
                            size="lg"
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => {
                              setProofCampaign(campaign);
                              setProofMs(milestone);
                              setProofOpen(true);
                            }}
                          >
                            <Upload className="mr-2 h-4 w-4" /> Upload Proof
                          </Button>
                        )}
                        {/* Fixed: NGO view for disbursed milestones - does not call admin endpoint */}
                        {milestone.status === "disbursed" && (
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground/5 border border-foreground/10 text-sm font-medium text-foreground/70">
                            <Clock className="h-4 w-4 text-primary animate-pulse" />
                            Awaiting Admin Release
                          </div>
                        )}
                        {milestone.status === "delivered" &&
                          attestationStatus[`don-${milestone.id}`] !==
                            "confirmed" && (
                            <Button
                              size="lg"
                              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                              onClick={() => {
                                handleAttestationSelect({
                                  id: `mock-${milestone.id}`,
                                  donationId: `don-${milestone.id}`,
                                  type: "DELIVERY",
                                  createdAt: new Date().toISOString(),
                                  donation: {
                                    amount: milestone.targetAmount,
                                    donorId: "anonymous",
                                  },
                                });
                              }}
                            >
                              <Bell className="mr-2 h-4 w-4" /> Request
                              Attestation
                            </Button>
                          )}
                      </div>
                    </div>
                  );
                })}

                {/* EMPTY STATE */}
                {Object.keys(pendingAttestations).length === 0 &&
                  pendingMilestoneActions.filter(
                    (x) =>
                      !(
                        x.milestone.status === "delivered" &&
                        attestationStatus[`don-${x.milestone.id}`] ===
                          "confirmed"
                      ),
                  ).length === 0 && (
                    <div className="py-24 text-center space-y-4">
                      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5 mb-4">
                        <CheckCircle className="h-8 w-8 text-foreground/40" />
                      </div>
                      <h3 className="text-2xl font-bold tracking-tight">
                        Inbox Zero
                      </h3>
                      <p className="text-foreground/50">
                        All tasks complete. Funds are flowing smoothly.
                      </p>
                    </div>
                  )}
              </div>
            </motion.div>
          )}

          {/* CAMPAIGN DETAIL VIEW */}
          {selectedView !== "inbox" && selectedCampaignObj && (
            <motion.div
              key={selectedCampaignObj.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-16"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter text-balance mb-4">
                    {selectedCampaignObj.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4">
                    <StatusBadge
                      status={selectedCampaignObj.status ?? "UNKNOWN"}
                      className="text-sm border px-3 py-1.5 rounded-full"
                    />
                    {selectedCampaignObj.status === "PENDING_APPROVAL" && (
                      <span className="text-sm text-muted-foreground font-medium">
                        Not yet publicly visible.
                      </span>
                    )}
                    <BeneficiaryIdReveal campaignId={selectedCampaignObj.id} />
                  </div>
                </div>
                {selectedCampaignObj.status === "REJECTED" && (
                  <Button
                    onClick={() => handleReapply(selectedCampaignObj.id)}
                    disabled={reapplyingId === selectedCampaignObj.id}
                  >
                    {reapplyingId === selectedCampaignObj.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Reapply for Approval
                  </Button>
                )}
              </div>

              {/* Top Stats Grid (No dividers, spatial tension) */}
              <div className="flex flex-wrap gap-x-16 gap-y-10">
                <AnimatedStat
                  key={`target-${selectedCampaignObj.id}`}
                  label="Target"
                  value={selectedCampaignObj.targetAmount}
                  isCurrency
                />
                <AnimatedStat
                  key={`raised-${selectedCampaignObj.id}`}
                  label="Raised"
                  value={selectedCampaignObj.raisedAmount}
                  isCurrency
                />
                <AnimatedStat
                  key={`ms-${selectedCampaignObj.id}`}
                  label="Milestones"
                  value={selectedCampaignObj.milestones.length}
                />
                <AnimatedStat
                  key={`done-${selectedCampaignObj.id}`}
                  label="Completed"
                  value={
                    selectedCampaignObj.milestones.filter(
                      (m) => m.status === "delivered",
                    ).length
                  }
                />
              </div>

              {/* Timeline */}
              <div className="pt-8">
                <h3 className="text-xl font-bold tracking-tight mb-8">
                  Execution Timeline
                </h3>
                <div className="border-l border-foreground/10 pl-2 lg:pl-0 lg:border-0">
                  <MilestoneTimeline
                    milestones={selectedCampaignObj.milestones}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MODALS */}
      <CreateCampaignDialog
        open={createCampaignOpen}
        onClose={() => setCreateCampaignOpen(false)}
        onSuccess={() => {
          fetchNgoData();
        }}
      />

      <ProofUploadDialog
        data={
          proofMs && proofCampaign
            ? { milestone: proofMs, campaign: proofCampaign }
            : null
        }
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        onSuccess={handleProofSuccess}
      />

      {selectedAttestation && (
        <AttestationSignDialog
          donation={{
            id: selectedAttestation.donationId,
            campaignId: selectedAttestation.donation?.campaignId || "",
            amount: Number(selectedAttestation.donation?.amount),
            campaignTitle: `Campaign ${selectedAttestation.donationId?.substring(0, 8)}`,
            paymentMethod: "upi",
            orderId: `order_${selectedAttestation.donationId}`,
            txHash: `tx_${selectedAttestation.donationId}`,
            walletAddress: "demo_wallet",
            status: "disbursed",
            createdAt: selectedAttestation.createdAt,
            explorerUrl: `https://explorer.solana.com/tx/tx_${selectedAttestation.donationId}?cluster=devnet`,
          }}
          ngoName="AidIndia Foundation"
          open={attestationDialogOpen}
          onOpenChange={(open) => setAttestationDialogOpen(open)}
          onAttestationSigned={() => {
            setAttestationDialogOpen(false);
            setSelectedAttestation(null);
            fetchPendingAttestations();
          }}
        />
      )}
    </div>
  );
}
