// AdminPanel – Admin views all campaigns, manages attestations, and approves disbursements
import { useState, useEffect } from 'react'
import { CheckCircle2, Upload, Loader2, ChevronDown, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/StatusBadge'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { ProofUploadDialog } from '@/components/ProofUploadDialog'
import AttestationVerificationDialog from '@/components/AttestationVerificationDialog'
import { useDonationStore } from '@/store/donationStore'
import { useAdminStore } from '@/store/adminStore'
import { useToast } from '@/hooks/use-toast'
import { formatUSD } from '@/lib/utils'
import type { Campaign, Milestone } from '@/types'

export default function AdminPanel() {
    const { campaigns, loadCampaigns, updateMilestoneStatus } = useDonationStore()
    const { pendingAttestations, fetchPendingAttestations, approveAttestation, rejectAttestation, attestationStatus, pendingMilestoneApprovals, fetchPendingMilestoneApprovals, approveMilestone: approveMilestoneAction, rejectMilestone } = useAdminStore()
    const [selected, setSelected] = useState<Campaign | null>(null)
    const [proofMs, setProofMs] = useState<Milestone | null>(null)
    const [proofOpen, setProofOpen] = useState(false)
    const [approvingId, setApprovingId] = useState<string | null>(null)
    const [attestationDialogOpen, setAttestationDialogOpen] = useState(false)
    const [selectedAttestation, setSelectedAttestation] = useState<{
        id: string;
        donationId: string;
        amount: number;
        donorName: string;
        campaignTitle: string;
        ngoName: string;
        attestedAt: string;
        statement: string;
        type: 'receipt' | 'delivery';
    } | null>(null)
    const [milestoneDialogOpen, setMilestoneDialogOpen] = useState<boolean>(false)
    const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null)
    const { toast } = useToast()

    // Filter to show all campaigns (admin sees everything)
    const adminCampaigns = campaigns

    useEffect(() => {
        loadCampaigns();
        fetchPendingAttestations();
        fetchPendingMilestoneApprovals();
    }, [loadCampaigns, fetchPendingAttestations, fetchPendingMilestoneApprovals]);

    useEffect(() => {
        if (!selected && adminCampaigns.length > 0) {
            setSelected(adminCampaigns[0]);
        }
    }, [selected, adminCampaigns]);

    const handleApprove = async (ms: Milestone) => {
        setApprovingId(ms.id)
        try {
            await approveMilestoneAction(ms.id)
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

    const handleAttestationApprove = async (attestationId: string) => {
        try {
            await approveAttestation(attestationId)
            toast({ title: 'Attestation approved successfully!' })
            // Refresh pending attestations
            await fetchPendingAttestations();
        } catch (error) {
            console.error('Failed to approve attestation:', error)
            toast({ title: 'Approval failed', variant: 'destructive' })
        }
    }

    const handleAttestationReject = async (attestationId: string, reason: string) => {
        try {
            await rejectAttestation(attestationId, reason)
            toast({ title: 'Attestation rejected' })
            // Refresh pending attestations
            await fetchPendingAttestations();
        } catch (error) {
            console.error('Failed to reject attestation:', error)
            toast({ title: 'Rejection failed', variant: 'destructive' })
        }
    }

    const handleMilestoneApprove = async (milestoneId: string) => {
        try {
            await approveMilestoneAction(milestoneId)
            toast({ title: 'Milestone approved successfully!' })
            // Refresh pending milestone approvals
            await fetchPendingMilestoneApprovals();
        } catch (error) {
            console.error('Failed to approve milestone:', error)
            toast({ title: 'Approval failed', variant: 'destructive' })
        }
    }

    const handleMilestoneReject = async (milestoneId: string, reason: string) => {
        try {
            await rejectMilestone(milestoneId, reason)
            toast({ title: 'Milestone rejected' })
            // Refresh pending milestone approvals
            await fetchPendingMilestoneApprovals();
        } catch (error) {
            console.error('Failed to reject milestone:', error)
            toast({ title: 'Rejection failed', variant: 'destructive' })
        }
    }

    const handleAttestationSelect = (attestation: {
        id: string;
        donationId: string;
        amount: number;
        donorName: string;
        campaignTitle: string;
        ngoName: string;
        attestedAt: string;
        statement: string;
        type: 'receipt' | 'delivery';
    }) => {
        setSelectedAttestation(attestation);
        setAttestationDialogOpen(true);
    }

    const handleMilestoneSelect = (milestone: Milestone) => {
        setSelectedMilestone(milestone)
        setMilestoneDialogOpen(true)
    }

    const activeMilestone = selected
        ? selected.milestones.find((m) => m.status !== 'delivered')
        : null

    return (
        <div className="space-y-8 pb-20 animate-fade-in">
            <h1 className="text-3xl font-bold">Admin Panel</h1>

            {/* Campaign tabs */}
            <Tabs
                value={selected?.id ?? ''}
                onValueChange={(id) => setSelected(adminCampaigns.find((c) => c.id === id) ?? null)}
            >
                <TabsList>
                    {adminCampaigns.map((c) => (
                        <TabsTrigger key={c.id} value={c.id}>{c.title.split('–')[0].trim()}</TabsTrigger>
                    ))}
                </TabsList>

                {adminCampaigns.map((c) => (
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
                                                // Find attestations for this milestone
                                                // In a real app, we'd fetch attestations for donations related to this milestone
                                                handleAttestationSelect({
                                                    id: `att-${activeMilestone.id}`,
                                                    donationId: `don-${activeMilestone.id}`,
                                                    amount: activeMilestone.targetAmount,
                                                    donorName: 'Anonymous Donor',
                                                    campaignTitle: selected?.title ?? '',
                                                    ngoName: selected?.ngo ?? '',
                                                    attestedAt: new Date().toISOString(),
                                                    statement: `${selected?.ngo ?? 'NGO'} confirms receipt of ₹${activeMilestone.targetAmount} for ${selected?.title ?? 'Campaign'}`,
                                                    type: 'receipt'
                                                })
                                            }}
                                        >
                                            {attestationStatus[`att-${activeMilestone.id}`] === 'approved' ? (
                                                <>
                                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                                    Attestation Approved
                                                </>
                                            ) : (
                                                <>
                                                    <Shield className="mr-2 h-4 w-4" />
                                                    Review Attestation
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
                                <h3 className="font-semibold mb-4">Pending Attestation Reviews</h3>
                                <div className="space-y-4">
                                    {Object.entries(pendingAttestations).map(([key, attestation]) => (
                                        <Card key={key} className="glass border-primary/30 p-4">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="font-medium">{attestation.donorName}</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        ₹{attestation.amount.toLocaleString()} • {attestation.campaignTitle} • {attestation.ngoName}
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
                                            <div className="space-y-2">
                                                <p className="text-xs text-muted-foreground">
                                                    Statement: {attestation.statement}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Requested: {new Date(attestation.attestedAt).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="flex justify-end space-x-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleAttestationReject(key, 'Insufficient information')}
                                                    className="text-sm"
                                                >
                                                    Reject
                                                </Button>
                                                <Button
                                                    onClick={() => handleAttestationApprove(key)}
                                                    className="ml-2"
                                                >
                                                    Approve
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pending Milestone Approvals Section */}
                        {Object.keys(pendingMilestoneApprovals).length > 0 && (
                            <div className="mt-6">
                                <h3 className="font-semibold mb-4">Pending Milestone Approvals</h3>
                                <div className="space-y-4">
                                    {Object.entries(pendingMilestoneApprovals).map(([key, milestone]) => (
                                        <Card key={key} className="glass border-primary/30 p-4">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="font-medium">{milestone.title}</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        ₹{milestone.targetAmount.toLocaleString()} • {milestone.status}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleMilestoneSelect(milestone)}
                                                    >
                                                        View Details
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Description: {milestone.description}
                                            </p>
                                            <div className="flex justify-end space-x-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleMilestoneReject(key, 'Requires revision')}
                                                    className="text-sm"
                                                >
                                                    Reject
                                                </Button>
                                                <Button
                                                    onClick={() => handleMilestoneApprove(key)}
                                                    className="ml-2"
                                                >
                                                    Approve
                                                </Button>
                                            </div>
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

            {/* Attestation Verification Dialog */}
            {selectedAttestation && (
                <AttestationVerificationDialog
                    donation={{
                        id: selectedAttestation.donationId,
                        amount: selectedAttestation.amount,
                        campaignTitle: selectedAttestation.campaignTitle,
                        paymentMethod: 'upi',
                        orderId: `order_${selectedAttestation.donationId}`,
                        txHash: `tx_${selectedAttestation.donationId}`,
                        walletAddress: 'demo_wallet',
                        status: 'disbursed',
                        createdAt: selectedAttestation.attestedAt,
                        explorerUrl: `https://explorer.solana.com/tx/tx_${selectedAttestation.donationId}?cluster=devnet`
                    } as any }
                    open={attestationDialogOpen}
                    onOpenChange={(open) => setAttestationDialogOpen(open)}
                />
            )}

            {/* Milestone Details Dialog */}
            {milestoneDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className="w-96 max-w-xs mx-4">
                        <CardHeader className="flex items-start justify-between p-6">
                            <CardTitle className="text-xl font-semibold">Milestone Details</CardTitle>
                            <button
                                onClick={() => setMilestoneDialogOpen(false)}
                                className="text-gray-400 hover:text-gray-500"
                            >
                                ✕
                            </button>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    <strong>Milestone ID:</strong> {selectedMilestone?.id.substring(0, 8)}...
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <strong>Title:</strong> {selectedMilestone?.title}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <strong>Description:</strong> {selectedMilestone?.description}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <strong>Target Amount:</strong> ₹{selectedMilestone?.targetAmount.toLocaleString()}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <strong>Status:</strong> {selectedMilestone?.status.split(/(?=[A-Z])/).join(' ').toLowerCase()}
                                </p>
                                {selectedMilestone?.proofCid && (
                                    <>
                                        <p className="text-sm text-muted-foreground">
                                            <strong>Proof CID:</strong> {selectedMilestone?.proofCid.substring(0, 8)}...
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            <strong>Disbursed At:</strong> {new Date(selectedMilestone?.disbursedAt ?? Date.now()).toLocaleString()}
                                        </p>
                                    </>
                                )}
                            </div>
                        </CardContent>
                        <div className="flex justify-end p-6">
                            <button
                                onClick={() => setMilestoneDialogOpen(false)}
                                className="px-4 py-2 bg-muted text-muted-foreground hover:bg-muted/50 rounded"
                            >
                                Close
                            </button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}