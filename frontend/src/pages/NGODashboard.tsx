import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Upload, Loader2, Bell, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { StatusBadge } from '@/components/StatusBadge'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { ProofUploadDialog } from '@/components/ProofUploadDialog'
import AttestationSignDialog from '@/components/AttestationSignDialog'
import { useDonationStore } from '@/store/donationStore'
import { useNGOStore } from '@/store/ngoStore'
import { apiService } from '@/utils/apiClient'
import { useToast } from '@/hooks/use-toast'
import { formatUSD, cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/useCountUp'
import type { Campaign, Milestone } from '@/types'

/* 
 * TODO: RBAC-pending — replace with apiService.campaigns.getByNgo(user.id) 
 * once backend branch merges 
 */
const NGO_CAMPAIGN_IDS = ['camp-001', 'camp-002']

function AnimatedStat({ value, label, isCurrency }: { value: number, label: string, isCurrency?: boolean }) {
    const count = useCountUp(value, 1500, true)
    return (
        <div className="space-y-2">
            <div className="text-3xl md:text-5xl font-bold tabular-nums tracking-tighter">
                {isCurrency ? formatUSD(count) : count.toLocaleString()}
            </div>
            <div className="text-sm font-semibold uppercase tracking-widest text-foreground/40">
                {label}
            </div>
        </div>
    )
}

export default function NGODashboard() {
    const { campaigns, loadCampaigns, updateMilestoneStatus, campaignsLoading } = useDonationStore()
    const { pendingAttestations, fetchPendingAttestations, attestationStatus } = useNGOStore()
    
    // selectedView: 'inbox' | campaignId
    const [selectedView, setSelectedView] = useState<string>('inbox')
    
    const [proofMs, setProofMs] = useState<Milestone | null>(null)
    const [proofCampaign, setProofCampaign] = useState<Campaign | null>(null)
    const [proofOpen, setProofOpen] = useState(false)
    const [approvingId, setApprovingId] = useState<string | null>(null)
    const [attestationDialogOpen, setAttestationDialogOpen] = useState(false)
    const [selectedAttestation, setSelectedAttestation] = useState<{
        donationId: string;
        amount: number;
        donorName: string;
        campaignTitle: string;
        requestedAt: string;
    } | null>(null)
    const { toast } = useToast()
    const { user } = useAuthStore()
    const navigate = useNavigate()

    const ngoCampaigns = campaigns.filter((c) => NGO_CAMPAIGN_IDS.includes(c.id))

    useEffect(() => {
        loadCampaigns();
        fetchPendingAttestations();
    }, [loadCampaigns, fetchPendingAttestations]);

    const handleApprove = async (ms: Milestone) => {
        setApprovingId(ms.id)
        try {
            await apiService.milestones.approve(ms.id)
            updateMilestoneStatus(ms.id, 'delivered')
            toast({ title: `Milestone "${ms.title}" approved & funds released!` })
        } catch {
            toast({ title: 'Approval failed', variant: 'destructive' })
        } finally {
            setApprovingId(null)
        }
    }

    const handleProofSuccess = (ms: Milestone) => {
        updateMilestoneStatus(ms.id, ms.status)
        toast({ title: 'Proof submitted — awaiting admin approval' })
    }

    const handleAttestationSelect = (attestation: {
        donationId: string;
        amount: number;
        donorName: string;
        campaignTitle: string;
        requestedAt: string;
    }) => {
        setSelectedAttestation(attestation);
        setAttestationDialogOpen(true);
    }

    // Collect all pending milestone actions across NGO campaigns
    const pendingMilestoneActions = ngoCampaigns.flatMap(camp => {
        return camp.milestones
          .filter(m => m.status === 'allocated' || m.status === 'disbursed' || m.status === 'delivered')
          .map(m => ({ campaign: camp, milestone: m }))
    })

    const selectedCampaignObj = ngoCampaigns.find(c => c.id === selectedView)

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
                <h2 className="text-4xl font-bold tracking-tighter">Access Denied</h2>
                <p className="text-muted-foreground text-lg max-w-md text-balance">Please sign in to access the NGO operational console.</p>
                <Button onClick={() => navigate('/login')}>Sign In</Button>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto min-h-[80vh] flex flex-col md:flex-row pb-20 animate-fade-in md:pt-16">
            
            {/* LEFT PANE - Typographic Sidebar (Mobile Sticky Ribbon) */}
            <div className="md:w-64 shrink-0 md:pr-8 lg:pr-12 border-b md:border-b-0 border-foreground/10 md:border-none sticky top-[64px] md:top-32 z-40 bg-background md:bg-transparent pt-4 md:pt-0">
                <div className="flex md:flex-col overflow-x-auto snap-x snap-mandatory hide-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <button
                        onClick={() => setSelectedView('inbox')}
                        className={cn(
                            "snap-start shrink-0 flex items-center justify-between md:w-full text-left py-4 px-6 md:px-4 text-sm font-semibold transition-colors outline-none",
                            selectedView === 'inbox' 
                                ? "text-foreground border-b-2 md:border-b-0 md:border-l-2 border-foreground"
                                : "text-foreground/50 border-b-2 md:border-b-0 md:border-l-2 border-transparent hover:text-foreground"
                        )}
                    >
                        <span>Action Inbox</span>
                        {(Object.keys(pendingAttestations).length + pendingMilestoneActions.filter(x => !(x.milestone.status === 'delivered' && attestationStatus[`don-${x.milestone.id}`] === 'confirmed')).length) > 0 && (
                            <span className="text-foreground/40 ml-2">{Object.keys(pendingAttestations).length + pendingMilestoneActions.filter(x => !(x.milestone.status === 'delivered' && attestationStatus[`don-${x.milestone.id}`] === 'confirmed')).length}</span>
                        )}
                    </button>

                    {ngoCampaigns.map(c => {
                        const count = pendingMilestoneActions.filter(x => x.campaign.id === c.id && !(x.milestone.status === 'delivered' && attestationStatus[`don-${x.milestone.id}`] === 'confirmed')).length + Object.values(pendingAttestations).filter(att => att.campaignTitle === c.title).length;
                        return (
                            <button
                                key={c.id}
                                onClick={() => setSelectedView(c.id)}
                                className={cn(
                                    "snap-start shrink-0 flex items-center justify-between md:w-full text-left py-4 px-6 md:px-4 text-sm font-medium transition-colors outline-none",
                                    selectedView === c.id 
                                        ? "text-foreground border-b-2 md:border-b-0 md:border-l-2 border-foreground"
                                        : "text-foreground/50 border-b-2 md:border-b-0 md:border-l-2 border-transparent hover:text-foreground"
                                )}
                            >
                                <span className="truncate">{c.title.split('–')[0].trim()}</span>
                                {count > 0 && <span className="text-foreground/40 ml-2 shrink-0">{count}</span>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* RIGHT PANE - Workspace */}
            <div className="flex-1 md:pl-8 lg:pl-16 pt-8 md:pt-0 px-6 md:px-0">
                <AnimatePresence mode="wait">
                    
                    {/* INBOX VIEW */}
                    {selectedView === 'inbox' && (
                        <motion.div
                            key="inbox"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-12"
                        >
                            <div>
                                <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter">Action Inbox</h1>
                                <p className="text-foreground/50 mt-2">Global tasks requiring your signature or proof upload.</p>
                            </div>

                            <div className="space-y-4">
                                {/* Attestation Requests */}
                                {Object.entries(pendingAttestations).map(([key, attestation]) => (
                                    <div key={`att-${key}`} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 border-l-emerald-500 transition-colors">
                                        <div className="space-y-1">
                                            <div className="text-sm font-semibold tracking-widest text-emerald-600 dark:text-emerald-500 uppercase">Attestation Request</div>
                                            <div className="text-2xl font-bold tracking-tighter tabular-nums">{formatUSD(attestation.amount)}</div>
                                            <div className="text-foreground/70">{attestation.donorName} <span className="text-foreground/30 mx-2">•</span> {attestation.campaignTitle}</div>
                                            <div className="text-xs text-foreground/40 mt-1">Requested {new Date(attestation.requestedAt).toLocaleDateString()}</div>
                                        </div>
                                        <Button
                                            onClick={() => handleAttestationSelect(attestation)}
                                            size="lg"
                                            className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
                                        >
                                            Sign & Release
                                        </Button>
                                    </div>
                                ))}

                                {/* Milestone Tasks */}
                                {pendingMilestoneActions.map(({ campaign, milestone }) => {
                                    // If delivered and attestation is confirmed, skip rendering it in the inbox
                                    if (milestone.status === 'delivered' && attestationStatus[`don-${milestone.id}`] === 'confirmed') return null;

                                    const borderLeftColor = 
                                        milestone.status === 'allocated' ? 'border-l-primary' :
                                        milestone.status === 'delivered' ? 'border-l-emerald-500' :
                                        'border-l-foreground/20';

                                    return (
                                        <div key={milestone.id} className={cn("group flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-foreground/5 border-l-4 transition-colors", borderLeftColor)}>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <StatusBadge status={milestone.status} />
                                                    <span className="text-sm font-medium text-foreground/50">{campaign.title}</span>
                                                </div>
                                                <div className="text-2xl font-bold tracking-tighter">{milestone.title}</div>
                                                <div className="text-foreground/70 line-clamp-1">{milestone.description}</div>
                                                <div className="text-sm text-foreground/50 mt-1 tabular-nums">Target: <span className="font-bold text-foreground">{formatUSD(milestone.targetAmount)}</span></div>
                                            </div>
                                            
                                            <div className="shrink-0 w-full sm:w-auto">
                                                {milestone.status === 'allocated' && (
                                                    <Button
                                                        size="lg"
                                                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                                                        onClick={() => {
                                                            setProofCampaign(campaign)
                                                            setProofMs(milestone);
                                                            setProofOpen(true)
                                                        }}
                                                    >
                                                        <Upload className="mr-2 h-4 w-4" /> Upload Proof
                                                    </Button>
                                                )}
                                                {milestone.status === 'disbursed' && (
                                                    <Button
                                                        size="lg"
                                                        className="w-full bg-foreground text-background hover:bg-foreground/90"
                                                        disabled={approvingId === milestone.id}
                                                        onClick={() => handleApprove(milestone)}
                                                    >
                                                        {approvingId === milestone.id
                                                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                                        Admin Approve & Release
                                                    </Button>
                                                )}
                                                {milestone.status === 'delivered' && attestationStatus[`don-${milestone.id}`] !== 'confirmed' && (
                                                    <Button
                                                        size="lg"
                                                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                                                        onClick={() => {
                                                            handleAttestationSelect({
                                                                donationId: `don-${milestone.id}`,
                                                                amount: milestone.targetAmount,
                                                                donorName: 'Anonymous Donor',
                                                                campaignTitle: campaign.title,
                                                                requestedAt: new Date().toISOString()
                                                            });
                                                        }}
                                                    >
                                                        <Bell className="mr-2 h-4 w-4" /> Request Attestation
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}

                                {/* EMPTY STATE */}
                                {Object.keys(pendingAttestations).length === 0 && pendingMilestoneActions.filter(x => !(x.milestone.status === 'delivered' && attestationStatus[`don-${x.milestone.id}`] === 'confirmed')).length === 0 && (
                                    <div className="py-24 text-center space-y-4">
                                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5 mb-4">
                                            <CheckCircle className="h-8 w-8 text-foreground/40" />
                                        </div>
                                        <h3 className="text-2xl font-bold tracking-tight">Inbox Zero</h3>
                                        <p className="text-foreground/50">All tasks complete. Funds are flowing smoothly.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* CAMPAIGN DETAIL VIEW */}
                    {selectedView !== 'inbox' && selectedCampaignObj && (
                        <motion.div
                            key={selectedCampaignObj.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-16"
                        >
                            <div>
                                <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter text-balance">
                                    {selectedCampaignObj.title}
                                </h1>
                            </div>

                            {/* Top Stats Grid (No dividers, spatial tension) */}
                            <div className="flex flex-wrap gap-x-16 gap-y-10">
                                <AnimatedStat key={`target-${selectedCampaignObj.id}`} label="Target" value={selectedCampaignObj.targetAmount} isCurrency />
                                <AnimatedStat key={`raised-${selectedCampaignObj.id}`} label="Raised" value={selectedCampaignObj.raisedAmount} isCurrency />
                                <AnimatedStat key={`ms-${selectedCampaignObj.id}`} label="Milestones" value={selectedCampaignObj.milestones.length} />
                                <AnimatedStat key={`done-${selectedCampaignObj.id}`} label="Completed" value={selectedCampaignObj.milestones.filter(m => m.status === 'delivered').length} />
                            </div>

                            {/* Timeline */}
                            <div className="pt-8">
                                <h3 className="text-xl font-bold tracking-tight mb-8">Execution Timeline</h3>
                                <div className="border-l border-foreground/10 pl-2 lg:pl-0 lg:border-0">
                                    <MilestoneTimeline milestones={selectedCampaignObj.milestones} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* MODALS */}
            <ProofUploadDialog
                data={proofMs && proofCampaign ? { milestone: proofMs, campaign: proofCampaign } : null}
                open={proofOpen}
                onClose={() => setProofOpen(false)}
                onSuccess={handleProofSuccess}
            />

            {selectedAttestation && (
                <AttestationSignDialog
                    donation={{
                        id: selectedAttestation.donationId,
                        amount: selectedAttestation.amount,
                        campaignTitle: selectedAttestation.campaignTitle,
                        paymentMethod: 'upi',
                        orderId: `order_${selectedAttestation.donationId}`,
                        txHash: `tx_${selectedAttestation.donationId}`,
                        walletAddress: 'demo_wallet',
                        status: 'disbursed',
                        createdAt: selectedAttestation.requestedAt,
                        explorerUrl: `https://explorer.solana.com/tx/tx_${selectedAttestation.donationId}?cluster=devnet`
                    } as any }
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
    )
}