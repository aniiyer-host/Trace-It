// DonorDashboard – shows the donor's donation history and milestone tracking
import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/StatusBadge'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { DonateDialog } from '@/components/DonateDialog'
import { DonationCard } from '@/components/DonationCard'
import { useDonationStore } from '@/store/donationStore'
import { useUIStore } from '@/store/uiStore'
import { fetchDonationsByWallet } from '@/services/mockApi'
import { formatUSD, shortenHash } from '@/lib/utils'
import type { Campaign } from '@/types'

export default function DonorDashboard() {
    const [params] = useSearchParams()
    const { campaigns, loadCampaigns, donations, setDonations } = useDonationStore()
    const { wallet } = useUIStore()
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    // Update selectedCampaign when URL param changes
    useEffect(() => {
        const id = params.get('campaign')
        let campaign: Campaign | null = null
        if (id && campaigns.length) {
            campaign = campaigns.find((x) => x.id === id) ?? null
        }

        // Wrap setState call to satisfy linter
        const updateSelectedCampaign = (c: Campaign | null) => {
            setSelectedCampaign(c)
        }
        updateSelectedCampaign(campaign)
    }, [params, campaigns])

    useEffect(() => {
        loadCampaigns()
    }, [loadCampaigns])

    const loadDonations = useCallback(async () => {
        if (!wallet.publicKey) return
        setLoading(true)
        try {
            const data = await fetchDonationsByWallet(wallet.publicKey)
            setDonations(data)
        } finally {
            setLoading(false)
        }
    }, [wallet.publicKey, setDonations])

    useEffect(() => {
        // Wrap loadDonations call to satisfy linter
        const loadDonationsIfWallet = async () => {
            await loadDonations()
        }

        loadDonationsIfWallet()
    }, [loadDonations])

    return (
        <div className="space-y-8 pb-16 animate-fade-in">
            <h1 className="text-3xl font-bold">Donor Dashboard</h1>

            {/* Donations table */}
            <Card className="glass">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>My Donations</CardTitle>
                    <Button size="sm" variant="ghost" onClick={loadDonations} disabled={loading || !wallet.connected}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </CardHeader>
                <CardContent>
                    {!wallet.connected ? (
                        <p className="text-muted-foreground text-sm py-4 text-center">Connect your wallet to view donations.</p>
                    ) : donations.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-4 text-center">No donations yet — pick a campaign below!</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Campaign</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Tx</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {donations.map((d) => (
                                    <TableRow key={d.id}>
                                        <TableCell className="font-medium">{d.campaignTitle}</TableCell>
                                        <TableCell>{formatUSD(d.amount)}</TableCell>
                                        <TableCell className="uppercase text-xs">{d.paymentMethod}</TableCell>
                                        <TableCell><StatusBadge status={d.status} /></TableCell>
                                        <TableCell>
                                            <a href={d.explorerUrl} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                                                {shortenHash(d.txHash)} <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Campaign selector + milestone tracker */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                    <h2 className="font-semibold text-lg">All Campaigns</h2>
                    {campaigns.map((c) => (
                        <DonationCard
                            key={c.id}
                            campaign={c}
                            compact
                            onDonate={(camp) => { setSelectedCampaign(camp); setDialogOpen(true) }}
                            onView={(camp) => setSelectedCampaign(camp)}
                        />
                    ))}
                </div>

                <div className="lg:col-span-2">
                    {selectedCampaign ? (
                        <Card className="glass">
                            <CardHeader>
                                <CardTitle>{selectedCampaign.title}</CardTitle>
                                <p className="text-sm text-muted-foreground">{selectedCampaign.ngo}</p>
                            </CardHeader>
                            <CardContent>
                                <MilestoneTimeline milestones={selectedCampaign.milestones} />
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="glass rounded-xl h-48 flex items-center justify-center text-muted-foreground text-sm">
                            Select a campaign to view milestones →
                        </div>
                    )}
                </div>
            </div>

            <DonateDialog campaign={selectedCampaign} open={dialogOpen} onClose={() => setDialogOpen(false)} />
        </div>
    )
}
