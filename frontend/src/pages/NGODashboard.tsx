// NGODashboard – NGO views their campaigns, uploads proof, and cycles status (demo)
// Contains a hidden dev button at bottom to cycle milestone statuses for live demos
import { useState, useEffect } from 'react'
import { CheckCircle2, Upload, Loader2, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/StatusBadge'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { ProofUploadDialog } from '@/components/ProofUploadDialog'
import { useDonationStore } from '@/store/donationStore'
import { approveMilestone, cycleMilestoneStatus } from '@/services/mockApi'
import { useToast } from '@/hooks/use-toast'
import { formatUSD } from '@/lib/utils'
import type { Campaign, Milestone } from '@/types'

// NGO only sees its own campaigns – hardcoded for demo
const NGO_CAMPAIGN_IDS = ['camp-001', 'camp-002']

export default function NGODashboard() {
    const { campaigns, loadCampaigns, updateMilestoneStatus } = useDonationStore()
    const [selected, setSelected] = useState<Campaign | null>(null)
    const [proofMs, setProofMs] = useState<Milestone | null>(null)
    const [proofOpen, setProofOpen] = useState(false)
    const [approvingId, setApprovingId] = useState<string | null>(null)
    const [cyclingId, setCyclingId] = useState<string | null>(null)
    const { toast } = useToast()

    const ngoCampaigns = campaigns.filter((c) => NGO_CAMPAIGN_IDS.includes(c.id))

    useEffect(() => {
        loadCampaigns().then(() => {
            // Auto-select first campaign on load
            setSelected((prev) => prev)
        })
    }, [loadCampaigns])

    useEffect(() => {
        if (!selected && ngoCampaigns.length) setSelected(ngoCampaigns[0])
    }, [ngoCampaigns, selected])

    const handleApprove = async (ms: Milestone) => {
        setApprovingId(ms.id)
        try {
            await approveMilestone(ms.id)
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

    /** Hidden demo helper – cycles all milestones of selected campaign one step */
    const handleDemoCycle = async () => {
        if (!selected) return
        for (const ms of selected.milestones) {
            setCyclingId(ms.id)
            const next = await cycleMilestoneStatus(ms.id)
            updateMilestoneStatus(ms.id, next)
        }
        setCyclingId(null)
        toast({ title: '🔄 Demo: milestone statuses cycled' })
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
                    {ngoCampaigns.map((c) => (
                        <TabsTrigger key={c.id} value={c.id}>{c.title.split('–')[0].trim()}</TabsTrigger>
                    ))}
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
                                            onClick={() => { setProofMs(activeMilestone); setProofOpen(true) }}
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
                                </CardContent>
                            </Card>
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

            {/* ── HIDDEN DEMO BUTTON ── Only visible during live presentations */}
            {/* This cycles all milestone statuses for the selected campaign */}
            <button
                id="demo-cycle-btn"
                aria-label="Demo: cycle milestone statuses"
                onClick={handleDemoCycle}
                disabled={!!cyclingId}
                className="fixed bottom-6 right-6 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity
          bg-muted/80 border border-border text-muted-foreground text-xs px-3 py-2 rounded-lg flex items-center gap-1"
            >
                {cyclingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
                Cycle Status
            </button>

            <ProofUploadDialog
                milestone={proofMs}
                open={proofOpen}
                onClose={() => setProofOpen(false)}
                onSuccess={handleProofSuccess}
            />
        </div>
    )
}
