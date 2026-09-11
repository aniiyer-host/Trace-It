import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDonationStore } from '@/store/donationStore'
import { useAdminStore } from '@/store/adminStore'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/use-toast'
import { formatUSD } from '@/lib/utils'
import type { Campaign } from '@/types'

/*
 * TODO: RBAC-pending 
 * When user.role exists in the backend, add a check here on mount.
 * If user.role !== 'admin', navigate away (e.g. to /donor).
 */

function ActionRow({ 
    item, 
    loadingId, 
    onApprove, 
    onReject 
}: { 
    item: any, 
    loadingId: string | null, 
    onApprove: (id: string, type: 'milestone' | 'attestation') => Promise<void>,
    onReject: (id: string, type: 'milestone' | 'attestation', reason: string) => Promise<void>
}) {
    const [isRejecting, setIsRejecting] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const isLoading = loadingId === item.id
    const anyLoading = loadingId !== null

    const handleRejectConfirm = () => {
        if (!rejectReason.trim()) return
        onReject(item.id, item.type, rejectReason)
    }

    return (
        <tr className="border-b border-border/10 hover:bg-muted/10 transition-colors group">
            <td className="py-4 px-4 font-medium">{item.campaign}</td>
            <td className="py-4 px-4 text-muted-foreground">{item.ngo}</td>
            <td className="py-4 px-4">
                <span className="flex items-center gap-2 text-sm">
                    <span className={`h-1.5 w-1.5 rounded-full ${item.type === 'milestone' ? 'bg-primary' : 'bg-emerald-500'}`} />
                    {item.type === 'milestone' ? 'Milestone Proof' : 'Attestation Request'}
                </span>
            </td>
            <td className="py-4 px-4 text-right tabular-nums font-semibold">{formatUSD(item.amount)}</td>
            <td className="py-4 px-4 text-right">
                {isRejecting ? (
                    <div className="flex items-center justify-end gap-2">
                        <Input 
                            autoFocus
                            className="h-8 w-48 text-xs bg-transparent"
                            placeholder="Reason for rejection..." 
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            disabled={anyLoading}
                            onKeyDown={e => e.key === 'Enter' && handleRejectConfirm()}
                        />
                        <Button size="sm" variant="ghost" onClick={() => setIsRejecting(false)} disabled={anyLoading}>Cancel</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleRejectConfirm} disabled={!rejectReason.trim() || anyLoading}>
                            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => setIsRejecting(true)} disabled={anyLoading}>
                            Reject
                        </Button>
                        <Button size="sm" variant="ghost" className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => onApprove(item.id, item.type)} disabled={anyLoading}>
                            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                            Approve
                        </Button>
                    </div>
                )}
            </td>
        </tr>
    )
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
    return (
        <tr className="border-b border-border/10 hover:bg-muted/10 transition-colors">
            <td className="py-4 px-4 font-medium">{campaign.title}</td>
            <td className="py-4 px-4 text-muted-foreground">{campaign.ngo}</td>
            <td className="py-4 px-4">
                <span className="flex items-center gap-2 text-sm">
                    <span className={`h-1.5 w-1.5 rounded-full ${campaign.raisedAmount >= campaign.targetAmount ? 'bg-emerald-500' : 'bg-primary'}`} />
                    {campaign.raisedAmount >= campaign.targetAmount ? 'Funded' : 'Active'}
                </span>
            </td>
            <td className="py-4 px-4 text-right tabular-nums">{campaign.milestones.length}</td>
            <td className="py-4 px-4 text-right tabular-nums">{formatUSD(campaign.raisedAmount)}</td>
            <td className="py-4 px-4 text-right tabular-nums font-semibold">{formatUSD(campaign.targetAmount)}</td>
        </tr>
    )
}

export default function AdminPanel() {
    const { user } = useAuthStore()
    const navigate = useNavigate()
    const { toast } = useToast()

    const { campaigns, loadCampaigns } = useDonationStore()
    const { 
        pendingAttestations, fetchPendingAttestations, approveAttestation, rejectAttestation, 
        pendingMilestoneApprovals, fetchPendingMilestoneApprovals, approveMilestone, rejectMilestone 
    } = useAdminStore()

    const [loadingId, setLoadingId] = useState<string | null>(null)

    useEffect(() => {
        loadCampaigns();
        fetchPendingAttestations();
        fetchPendingMilestoneApprovals();
    }, [loadCampaigns, fetchPendingAttestations, fetchPendingMilestoneApprovals]);

    const actionItems = useMemo(() => {
        const items: any[] = [];
        Object.entries(pendingMilestoneApprovals).forEach(([key, ms]: [string, any]) => {
            const camp = campaigns.find(c => c.milestones.some(m => m.id === ms.id))
            items.push({
                type: 'milestone',
                id: key,
                entityId: ms.id,
                title: ms.title,
                amount: ms.targetAmount,
                ngo: camp?.ngo || 'Unknown NGO',
                campaign: camp?.title || 'Unknown Campaign'
            })
        });
        Object.entries(pendingAttestations).forEach(([key, att]: [string, any]) => {
            items.push({
                type: 'attestation',
                id: key,
                entityId: att.donationId,
                title: att.statement,
                amount: att.amount,
                ngo: att.ngoName,
                campaign: att.campaignTitle
            })
        });
        return items;
    }, [pendingMilestoneApprovals, pendingAttestations, campaigns]);

    const totalTarget = campaigns.reduce((sum, c) => sum + c.targetAmount, 0);
    const totalRaised = campaigns.reduce((sum, c) => sum + c.raisedAmount, 0);
    const pendingCount = actionItems.length;

    const handleApprove = async (id: string, type: 'milestone' | 'attestation') => {
        setLoadingId(id)
        try {
            if (type === 'milestone') {
                await approveMilestone(id)
                await fetchPendingMilestoneApprovals()
                toast({ title: 'Milestone approved & funds released!' })
            } else {
                await approveAttestation(id)
                await fetchPendingAttestations()
                toast({ title: 'Attestation approved successfully!' })
            }
        } catch (error) {
            toast({ title: 'Approval failed', variant: 'destructive' })
        } finally {
            setLoadingId(null)
        }
    }

    const handleReject = async (id: string, type: 'milestone' | 'attestation', reason: string) => {
        setLoadingId(id)
        try {
            if (type === 'milestone') {
                await rejectMilestone(id, reason)
                await fetchPendingMilestoneApprovals()
                toast({ title: 'Milestone rejected' })
            } else {
                await rejectAttestation(id, reason)
                await fetchPendingAttestations()
                toast({ title: 'Attestation rejected' })
            }
        } catch (error) {
            toast({ title: 'Rejection failed', variant: 'destructive' })
        } finally {
            setLoadingId(null)
        }
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
                <h2 className="text-4xl font-bold tracking-tighter">Access Denied</h2>
                <p className="text-muted-foreground text-lg max-w-md text-balance">Please sign in to access the administrator console.</p>
                <Button onClick={() => navigate('/login')}>Sign In</Button>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16 space-y-16 animate-fade-in">
            {/* ZONE 3: Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                <div className="space-y-2">
                    <div className="text-4xl md:text-5xl font-bold tabular-nums tracking-tighter text-foreground">
                        {pendingCount}
                    </div>
                    <div className="text-sm text-foreground/40 uppercase tracking-widest font-semibold">
                        Pending Actions
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="text-4xl md:text-5xl font-bold tabular-nums tracking-tighter text-foreground">
                        {formatUSD(totalRaised)}
                    </div>
                    <div className="text-sm text-foreground/40 uppercase tracking-widest font-semibold">
                        Total Raised
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="text-4xl md:text-5xl font-bold tabular-nums tracking-tighter text-foreground">
                        {formatUSD(totalTarget)}
                    </div>
                    <div className="text-sm text-foreground/40 uppercase tracking-widest font-semibold">
                        Global Target
                    </div>
                </div>
            </div>

            {/* ZONE 1: Action Queue */}
            <div className="space-y-6">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-2xl font-bold tracking-tight">Action Queue</h2>
                    {pendingCount === 0 && <span className="text-sm text-muted-foreground">All caught up</span>}
                </div>
                
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead>
                            <tr className="border-b border-border/20 text-muted-foreground">
                                <th className="py-3 px-4 font-medium w-1/4">Campaign</th>
                                <th className="py-3 px-4 font-medium w-1/4">NGO</th>
                                <th className="py-3 px-4 font-medium w-1/6">Type</th>
                                <th className="py-3 px-4 font-medium text-right w-1/6">Amount</th>
                                <th className="py-3 px-4 font-medium text-right w-1/6">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {actionItems.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                                        No pending actions requiring review.
                                    </td>
                                </tr>
                            ) : (
                                actionItems.map(item => (
                                    <ActionRow 
                                        key={`${item.type}-${item.id}`} 
                                        item={item} 
                                        loadingId={loadingId}
                                        onApprove={handleApprove}
                                        onReject={handleReject}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ZONE 2: Campaign Overview */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight">Platform Campaigns</h2>
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead>
                            <tr className="border-b border-border/20 text-muted-foreground">
                                <th className="py-3 px-4 font-medium w-1/3">Campaign</th>
                                <th className="py-3 px-4 font-medium w-1/4">NGO</th>
                                <th className="py-3 px-4 font-medium w-1/6">Status</th>
                                <th className="py-3 px-4 font-medium text-right">Milestones</th>
                                <th className="py-3 px-4 font-medium text-right">Raised</th>
                                <th className="py-3 px-4 font-medium text-right">Target</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaigns.map(c => (
                                <CampaignRow key={c.id} campaign={c} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    )
}