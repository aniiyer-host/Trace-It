// Home page – landing with campaigns grid + hero section
import { useState, useEffect } from 'react'
import { Shield, TrendingUp, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DonationCard } from '@/components/DonationCard'
import { DonateDialog } from '@/components/DonateDialog'
import { useDonationStore } from '@/store/donationStore'
import type { Campaign } from '@/types'

const FEATURES = [
    { icon: Shield, title: 'Zero PII Exposure', desc: 'Only wallet addresses and on-chain hashes. No personal data ever stored.' },
    { icon: TrendingUp, title: 'Milestone-gated Funds', desc: 'Funds release only when NGOs submit verifiable proof of milestone completion.' },
    { icon: Zap, title: 'Solana Speed', desc: 'Sub-second settlement with SOL or UPI – every transaction anchored on-chain.' },
]

export default function Home() {
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const { campaigns, campaignsLoading, loadCampaigns } = useDonationStore()
    const navigate = useNavigate()

    useEffect(() => { void loadCampaigns() }, [loadCampaigns])

    const handleDonate = (c: Campaign) => { setSelectedCampaign(c); setDialogOpen(true) }
    const handleView = (c: Campaign) => navigate(`/donor?campaign=${c.id}`)

    return (
        <div className="space-y-16 pb-16">
            {/* Hero */}
            <section className="text-center py-16 space-y-5 animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-2">
                    🔗 Powered by Solana Devnet
                </div>
                <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight">
                    <span className="gradient-text">Trace</span> Every Rupee.<br />
                    <span className="text-foreground/80">Trust Every NGO.</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                    TraceIt anchors every donation milestone on Solana — you can always verify
                    where your money went, down to the block.
                </p>
            </section>

            {/* Feature pills */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {FEATURES.map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="glass rounded-xl p-5 space-y-2 hover:border-primary/40 transition-colors">
                        <Icon className="h-6 w-6 text-primary" />
                        <h3 className="font-semibold">{title}</h3>
                        <p className="text-sm text-muted-foreground">{desc}</p>
                    </div>
                ))}
            </section>

            {/* Campaign grid */}
            <section>
                <h2 className="text-2xl font-bold mb-6">Active Campaigns</h2>
                {campaignsLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="glass rounded-xl h-60 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {campaigns.map((c) => (
                            <DonationCard key={c.id} campaign={c} onDonate={handleDonate} onView={handleView} />
                        ))}
                    </div>
                )}
            </section>

            <DonateDialog campaign={selectedCampaign} open={dialogOpen} onClose={() => setDialogOpen(false)} />
        </div>
    )
}
