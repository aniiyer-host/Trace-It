// NGODashboard – NGO views their campaigns, uploads proof, and manages attestations
// Contains a hidden dev button at bottom to cycle milestone statuses for live demos
import { useState, useEffect } from 'react'
import { CheckCircle2, Upload, Loader2, ChevronDown, Bell } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/StatusBadge'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { ProofUploadDialog } from '@/components/ProofUploadDialog'
import AttestationSignDialog from '@/components/AttestationSignDialog'
import { useDonationStore } from '@/store/donationStore'
import { useNGOStore } from '@/store/ngoStore'
import { apiService } from '@/utils/apiClient'
import { useToast } from '@/hooks/use-toast'
import { formatUSD } from '@/lib/utils'
import type { Campaign, Milestone } from '@/types'

// NGO only sees its own campaigns – hardcoded for demo
const NGO_CAMPAIGN_IDS = ['camp-001', 'camp-002']

export default function NGODashboard() {
    const { campaigns, loadCampaigns, updateMilestoneStatus, campaignsLoading } = useDonationStore()
    const { pendingAttestations, fetchPendingAttestations, attestationStatus } = useNGOStore()
    const [selected, setSelected] = useState<Campaign | null>(null)
    const [proofMs, setProofMs] = useState<Milestone | null>(null)
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

    const ngoCampaigns = campaigns.filter((c) => NGO_CAMPAIGN_IDS.includes(c.id))

    useEffect(() => {
        loadCampaigns();
        fetchPendingAttestations();
    }, [loadCampaigns, fetchPendingAttestations]);

    useEffect(() => {
        if (!selected && ngoCampaigns.length > 0) {
            setSelected(ngoCampaigns[0]);
        }
    }, [selected, ngoCampaigns]);

    // No need for separate effect; the above handles initialization.

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



    const activeMilestone = selected
        ? selected.milestones.find((m) => m.status !== 'delivered')
        : null

    return (
        <div className="space-y-8 pb-20 animate-fade-in">
            <h1 className="text-3xl font-bold">NGO Dashboard</h1>

            {/* Campaign tabs */}
            <Tabs
                value={selected?.id ?? ''}
                onValueChange={(id) => setSelected(ngoCampaigns.find((c) => c.id === id) ?? null)}
            >
                <TabsList>
                    {campaignsLoading ? (
                        <>
                            {[1, 2, 3].map((i) => (
                                <TabsTrigger key={`skeleton-${i}`} value={`skeleton-${i}`} className="cursor-default">
                                    Campaign {i}
                                </TabsTrigger>
                            ))}
                        </>
                    ) : (
                        <>
                            {ngoCampaigns.map((c) => (
                                <TabsTrigger key={c.id} value={c.id}>{c.title.split('–')[0].trim()}</TabsTrigger>
                            ))}
                        </>
                    )}
                </TabsList>

                {ngoCampaigns.map((c) => (
                    <TabsContent key={c.id} value={c.id} className="space-y-6 mt-6">
                        {/* Stats row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Target', value: formatUSD(c.targetAmount) },
                                { label: 'Raised', value: formatUSD(c.raisedAmount) },
                                { label: 'Milestones', value: `${c.milestones.length}` },
                                { label: 'Completed', value: `${c.milestones.filter((m) => m.status === 'delivered').length}` },
                            ].map(({ label, value }) => (
                                <Card key={label} className="glass">
                                    <CardContent className="pt-4">
                                        <p className="text-xs text-muted-foreground">{label}</p>
                                        <p className="text-xl font-bold">{value}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Active milestone action card */}
                        {activeMilestone && (
                            <Card className="glass border-primary/30">
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                        Active: {activeMilestone.title}
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground">{activeMilestone.description}</p>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-3">
                                    <StatusBadge status={activeMilestone.status} />

                                    {activeMilestone.status === 'allocated' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-2 border-primary/40 text-primary"
                                            onClick={() => {
                                                setProofMs(activeMilestone);
                                                setProofOpen(true)
                                            }}
                                        >
                                            <Upload className="h-4 w-4" /> Upload Proof
                                        </Button>
                                    )}

                                    {activeMilestone.status === 'disbursed' && (
                                        <Button
                                            size="sm"
                                            className="gap-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                                            disabled={approvingId === activeMilestone.id}
                                            onClick={() => handleApprove(activeMilestone)}
                                        >
                                            {approvingId === activeMilestone.id
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <CheckCircle2 className="h-4 w-4" />}
                                            Admin Approve & Release
                                        </Button>
                                    )}

                                    {/* Attestation button for completed milestones */}
                                    {activeMilestone.status === 'delivered' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-2 border-primary/40 text-primary"
                                            onClick={() => {
                                                // Find a donation for this milestone to show attestation request
                                                // In a real app, we'd fetch donations for this milestone
                                                // For demo, we'll show the attestation dialog with mock data
                                                handleAttestationSelect({
                                                    donationId: `don-${activeMilestone.id}`,
                                                    amount: activeMilestone.targetAmount,
                                                    donorName: 'Anonymous Donor',
                                                    campaignTitle: selected?.title ?? '',
                                                    requestedAt: new Date().toISOString()
                                                });
                                            }}
                                        >
                                            {attestationStatus[`don-${activeMilestone.id}`] === 'confirmed' ? (
                                                <>
                                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                                    Attestation Confirmed
                                                </>
                                            ) : (
                                                <>
                                                    <Bell className="mr-2 h-4 w-4" />
                                                    Request Attestation
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Pending Attestations Section */}
                        {Object.keys(pendingAttestations).length > 0 && (
                            <div className="mt-6">
                                <h3 className="font-semibold mb-4">Pending Attestation Requests</h3>
                                <div className="space-y-4">
                                    {Object.entries(pendingAttestations).map(([key, attestation]) => (
                                        <Card key={key} className="glass border-primary/30 p-4">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="font-medium">{attestation.donorName}</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        ₹{attestation.amount.toLocaleString()} • {attestation.campaignTitle}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleAttestationSelect(attestation)}
                                                    >
                                                        View Details
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Requested: {new Date(attestation.requestedAt).toLocaleString()}
                                            </p>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Full timeline */}
                        <Card className="glass">
                            <CardHeader><CardTitle className="text-base">Milestone Timeline</CardTitle></CardHeader>
                            <CardContent>
                                <MilestoneTimeline milestones={c.milestones} />
                            </CardContent>
                        </Card>
                    </TabsContent>
                ))}
            </Tabs>



            <ProofUploadDialog
                data={proofMs ? { milestone: proofMs, campaign: selected } : null}
                open={proofOpen}
                onClose={() => setProofOpen(false)}
                onSuccess={handleProofSuccess}
            />

            {/* Attestation Sign Dialog */}
            {selectedAttestation && (
                <AttestationSignDialog
                    donation={{
                        id: selectedAttestation.donationId,
                        amount: selectedAttestation.amount,
                        campaignTitle: selectedAttestation.campaignTitle,
                        // Add other required fields for Donation type
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
                        // Fetch updated pending attestations
                        fetchPendingAttestations();
                    }}
                />
            )}
        </div>
    )
}