// Home page – landing with campaigns grid + hero section
import { useState, useEffect } from 'react'
import { Shield, TrendingUp, Zap, DollarSign, Users, MapPin } from 'lucide-react'
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

  // Simulated impact metrics (in a real app, these would come from an API)
  const impactMetrics = {
    totalRaised: 284750, // INR
    totalDonors: 1240,
    activeCampaigns: campaigns.length,
    milestonesCompleted: 8,
  }

  const handleDonate = (c: Campaign) => { setSelectedCampaign(c); setDialogOpen(true) }
  const handleView = (c: Campaign) => navigate(`/donor?campaign=${c.id}`)

  return (
    <div className="space-y-16 pb-16">
      {/* Impact Metrics */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-center animate-fade-in">
        <div className="glass rounded-xl p-6 space-y-3">
          <DollarSign className="h-6 w-6 text-primary mx-auto" />
          <h3 className="font-semibold text-2xl">₹{impactMetrics.totalRaised.toLocaleString()}</h3>
          <p className="text-sm text-muted-foreground">Total Raised</p>
        </div>
        <div className="glass rounded-xl p-6 space-y-3">
          <Users className="h-6 w-6 text-primary mx-auto" />
          <h3 className="font-semibold text-2xl">{impactMetrics.totalDonors.toLocaleString()}</h3>
          <p className="text-sm text-muted-foreground">Donors</p>
        </div>
        <div className="glass rounded-xl p-6 space-y-3">
          <MapPin className="h-6 w-6 text-primary mx-auto" />
          <h3 className="font-semibold text-2xl">{impactMetrics.activeCampaigns}</h3>
          <p className="text-sm text-muted-foreground">Active Campaigns</p>
        </div>
        <div className="glass rounded-xl p-6 space-y-3">
          <TrendingUp className="h-6 w-6 text-primary mx-auto" />
          <h3 className="font-semibold text-2xl">{impactMetrics.milestonesCompleted}</h3>
          <p className="text-sm text-muted-foreground">Milestones Completed</p>
        </div>
      </section>

      {/* Hero */}
      <section className="text-center py-16 space-y-5 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-4">
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
        <div className="mt-6 flex justify-center gap-4 flex-wrap">
          <button
            onClick={() => {
              // Scroll to campaigns section
              document.getElementById('campaigns-section')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="btn-primary px-6 py-3 rounded-md text-font-medium transition-all hover:bg-primary/90"
          >
            Explore Campaigns
          </button>
          <button
            onClick={() => {
              // For demo, show the first campaign's donate dialog
              if (campaigns.length > 0) {
                setSelectedCampaign(campaigns[0])
                setDialogOpen(true)
              }
            }}
            className="btn-outline px-6 py-3 rounded-md border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
          >
            How It Works
          </button>
        </div>
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
      <section id="campaigns-section">
        <div className="space-y-6">
          <div className="flex justify-between items-center wrap">
            <h2 className="text-2xl font-bold">Active Campaigns</h2>
            <div className="flex gap-2 flex-wrap">
              {/* In a real app, we would have filters here */}
              <select
                className="select-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Filter campaigns"
              >
                <option value="all">All Categories</option>
                <option value="education">Education</option>
                <option value="health">Health</option>
                <option value="disaster">Disaster Relief</option>
                <option value="environment">Environment</option>
              </select>
            </div>
          </div>
          {campaignsLoading ? (
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="glass rounded-xl h-72 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {campaigns.map((c) => (
                <DonationCard key={c.id} campaign={c} onDonate={handleDonate} onView={handleView} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Call to action for donors */}
      <section className="text-center py-12 bg-muted/5 rounded-xl">
        <h3 className="text-xl font-semibold mb-4">Ready to make a difference?</h3>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Donate with confidence knowing every rupee is tracked on-chain from source to impact.
        </p>
        <Button
          className="btn-primary mt-6 px-8 py-3"
          onClick={() => {
            if (campaigns.length > 0) {
              setSelectedCampaign(campaigns[0])
              setDialogOpen(true)
            }
          }}
        >
          Start Donating
        </Button>
      </section>

      <DonateDialog campaign={selectedCampaign} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}