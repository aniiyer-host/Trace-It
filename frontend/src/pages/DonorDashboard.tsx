import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DonationHistoryTable from '@/components/DonationHistoryTable'
import AttestationDetailsModal from '@/components/AttestationDetailsModal'
import { DonateDialog } from '@/components/DonateDialog'
import { useDonationStore } from '@/store/donationStore'
import { useAuthStore } from '@/store/authStore'
import { apiService } from '@/utils/apiClient'
import type { Campaign, Donation } from '@/types'
import { useCountUp } from '@/hooks/useCountUp'
import { cn } from '@/lib/utils'

function StatBlock({ value, label, prefix = '', suffix = '' }: { value: number, label: string, prefix?: string, suffix?: string }) {
  const count = useCountUp(value, 2000)
  return (
    <div className="space-y-2">
      <div className="font-bold tabular-nums tracking-tighter text-foreground" style={{ fontSize: 'clamp(3.5rem, 6vw, 6rem)', lineHeight: 1 }}>
        {prefix}{count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm md:text-base text-foreground/40 uppercase tracking-widest font-semibold">
        {label}
      </div>
    </div>
  )
}

function SmallStatBlock({ value, label, prefix = '', suffix = '' }: { value: number, label: string, prefix?: string, suffix?: string }) {
  const count = useCountUp(value, 2000)
  return (
    <div className="space-y-1">
      <div className="text-4xl md:text-5xl font-bold tabular-nums tracking-tighter text-foreground">
        {prefix}{count.toLocaleString()}{suffix}
      </div>
      <div className="text-xs text-foreground/40 uppercase tracking-widest font-semibold">
        {label}
      </div>
    </div>
  )
}

export default function DonorDashboard() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  
  // -- CONSTRAINTS PRESERVED --
  const { campaigns, loadCampaigns, setDonations, campaignsLoading } = useDonationStore()
  const { user, setUser } = useAuthStore()
  
  /* 
   * TODO: RBAC-pending
   * When user.role exists in the backend, add a check here on mount.
   * If user.role !== 'donor', navigate away (e.g. to /ngo or /admin).
   */

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [donations, setDonationsLocal] = useState<Donation[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [attestationModalData, setAttestationModalData] = useState<{
    donationId: string
    attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed'
  } | null>(null)

  useEffect(() => {
    const id = params.get('campaign')
    let campaign: Campaign | null = null
    if (id && campaigns.length) {
      campaign = campaigns.find((x) => x.id === id) ?? null
    }
    if (campaign) setSelectedCampaign(campaign)
  }, [params, campaigns])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const loadDonations = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await apiService.donations.getByUser(user.id)
      setDonationsLocal(data)
      setDonations(data)
    } catch (error) {
      console.error('Failed to load donations:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id, setDonations])

  useEffect(() => {
    if (user?.id) {
      setLoading(true)
      loadDonations()
    }
  }, [user?.id, loadDonations])
  // -- END CONSTRAINTS PRESERVED --

  // Auto-select first funded campaign on initial load if none selected
  const fundedCampaigns = useMemo(() => {
    if (!campaigns.length || !donations.length) return []
    const fundedIds = new Set(donations.map(d => d.campaignId))
    return campaigns.filter(c => fundedIds.has(c.id))
  }, [campaigns, donations])

  useEffect(() => {
    if (!selectedCampaign && fundedCampaigns.length > 0) {
      setSelectedCampaign(fundedCampaigns[0])
    }
  }, [fundedCampaigns, selectedCampaign])

  const summary = useMemo(() => {
    const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0)
    const uniqueNGOs = new Set(donations.map(d => {
       const camp = campaigns.find(c => c.id === d.campaignId)
       return camp?.ngo || ''
    })).size
    const confirmedDonations = donations.filter(d =>
      d.status === 'delivered' || d.status === 'disbursed'
    ).length
    const successRate = donations.length > 0 ? (confirmedDonations / donations.length) * 100 : 0

    return {
      totalDonated,
      uniqueNGOs,
      successRate: Math.round(successRate)
    }
  }, [donations, campaigns])

  const handleViewAttestation = (donationId: string) => {
    const donation = donations.find(d => d.id === donationId)
    if (!donation) return
    let attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed' = 'pending'
    if (donation.status === 'delivered' || donation.status === 'disbursed') {
      attestationStatus = 'receipt_confirmed'
    }
    setAttestationModalData({ donationId, attestationStatus })
  }

  const handleVerifyIntegrity = (donationId: string) => {
    alert(`Verifying integrity for donation ${donationId}\n\nIn a real implementation, this would:\n1. Compute hash from donation data\n2. Compare with on-chain hash\n3. Show match/mismatch result`)
  }

  const handleCloseAttestationModal = () => {
    setAttestationModalData(null)
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
        <h2 className="text-4xl font-bold tracking-tighter">Access Denied</h2>
        <p className="text-muted-foreground text-lg max-w-md text-balance">Please sign in to view your donor portfolio.</p>
        <Button onClick={() => navigate('/login')}>Sign In</Button>
      </div>
    )
  }

  const isZeroState = donations.length === 0 && !loading

  return (
    <div className="max-w-7xl mx-auto space-y-24 pb-32 animate-fade-in pt-12 px-6 lg:px-8">
      
      {/* HEADER & PORTFOLIO BALANCES */}
      <div className="space-y-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground/80">
            Portfolio for {user.email.split('@')[0]}
          </h1>
          <div className="flex items-center gap-4">
             {/* 
              * TODO: RBAC-pending profile redirect 
              * Update this alert to a router navigation when Profile supports roles.
              */}
            <Button variant="ghost" onClick={() => alert('Profile page coming soon')}>Profile</Button>
            <Button variant="outline" onClick={() => setUser(null)}>Sign Out</Button>
          </div>
        </div>

        {/* 60/40 Asymmetric Typographic Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 items-end">
          <div className="md:col-span-8">
            <StatBlock value={summary.totalDonated} label="Total Capital Deployed" prefix="₹" />
          </div>
          <div className="md:col-span-4 flex flex-col gap-8 md:border-l md:border-foreground/10 md:pl-8">
            <SmallStatBlock value={summary.uniqueNGOs} label="NGOs Backed" />
            <SmallStatBlock value={summary.successRate} label="Impact Verified" suffix="%" />
          </div>
        </div>
      </div>

      {/* NGO ONBOARDING BANNER */}
      {(!('role' in user) || (user as any).role === 'DONOR') && (
        <div className="bg-foreground/[0.02] border border-foreground/10 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-medium text-foreground/70">
            Are you an NGO? Apply for institution status
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link to="/profile">Apply Now</Link>
          </Button>
        </div>
      )}

      {/* MAIN ZONE - JOURNEY VIEW OR EMPTY STATE */}
      {isZeroState ? (
        <div className="flex flex-col items-center text-center space-y-8 py-32 border-t border-foreground/10">
          <h2 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-foreground text-balance">
            Your ledger is empty.
          </h2>
          <p className="text-xl md:text-2xl text-foreground/50 max-w-2xl text-pretty font-medium">
            Join the donors who refuse to settle for black-box charities.
          </p>
          <Button asChild size="lg" className="rounded-full px-8 py-6 text-lg h-auto mt-4">
            <Link to="/campaigns">Deploy Your First Capital</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 border-t border-foreground/10 pt-16">
          
          {/* LEDGER LIST (35%) */}
          <div className="lg:col-span-4 space-y-6">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground/50 mb-8">Active Deployments</h3>
            
            {/* Mobile Snap Container */}
            <div className="relative -mx-6 px-6 lg:mx-0 lg:px-0">
              <div className="flex lg:flex-col gap-4 overflow-x-auto snap-x snap-mandatory lg:overflow-visible lg:snap-none pb-8 lg:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {fundedCampaigns.map((camp) => {
                  const isSelected = selectedCampaign?.id === camp.id
                  const campDonations = donations.filter(d => d.campaignId === camp.id)
                  const total = campDonations.reduce((sum, d) => sum + d.amount, 0)
                  
                  const hasDelivered = campDonations.some(d => d.status === 'delivered')
                  const hasDisbursed = campDonations.some(d => d.status === 'disbursed')
                  const statusColor = hasDelivered ? 'bg-primary' : hasDisbursed ? 'bg-blue-500' : 'bg-yellow-500'

                  return (
                    <button
                      key={camp.id}
                      onClick={() => setSelectedCampaign(camp)}
                      tabIndex={0}
                      className={cn(
                        "snap-start shrink-0 w-[85vw] sm:w-[300px] lg:w-full text-left p-5 transition-all outline-none focus-visible:ring-2 ring-primary border-l-2 rounded-r-lg",
                        isSelected 
                          ? "border-primary bg-foreground/[0.02]" 
                          : "border-transparent hover:bg-foreground/[0.01]"
                      )}
                    >
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div className="font-semibold text-lg line-clamp-1">{camp.title}</div>
                        <div className="flex items-center gap-2 shrink-0 mt-1.5">
                          <span className={cn("w-2.5 h-2.5 rounded-full", statusColor)} />
                        </div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="text-sm text-foreground/50">{camp.ngo}</div>
                        <div className="font-bold tabular-nums">₹{total.toLocaleString()}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
              
              {/* Fade for mobile scroll indication */}
              <div className="absolute right-0 top-0 bottom-8 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
            </div>
          </div>

          {/* STEPPER (65%) */}
          <div className="lg:col-span-8 lg:min-h-[500px] relative">
            <AnimatePresence mode="wait">
              {selectedCampaign ? (
                <motion.div
                  key={selectedCampaign.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-16"
                >
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight mb-2">{selectedCampaign.title}</h3>
                    <p className="text-lg text-foreground/50">Trace trajectory for this allocation</p>
                  </div>

                  {/* The Stepper */}
                  <Stepper journey={buildJourney(selectedCampaign, donations)} />

                </motion.div>
              ) : (
                <div className="h-full flex items-center justify-center text-foreground/30">
                  Select a deployment to trace its impact.
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* EXISTING HISTORY TABLE & MODALS */}
      {!isZeroState && (
         <div className="border-t border-foreground/10 pt-16 space-y-6">
           <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
             <h2 className="text-2xl font-bold">Transaction History</h2>
             <Button
               variant="outline"
               size="sm"
               onClick={() => {
                 setLoading(true)
                 loadDonations().finally(() => setLoading(false))
               }}
               disabled={loading}
             >
               {loading ? 'Refreshing...' : 'Refresh'}
             </Button>
           </div>
   
           <DonationHistoryTable
             donations={donations}
             loading={loading}
             onRefresh={() => {
               setLoading(true)
               loadDonations().finally(() => setLoading(false))
             }}
             onViewAttestation={handleViewAttestation}
             onVerifyIntegrity={handleVerifyIntegrity}
           />
         </div>
      )}

      <DonateDialog
        campaign={selectedCampaign}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      {attestationModalData && (
        <AttestationDetailsModal
          donationId={attestationModalData.donationId}
          attestationStatus={attestationModalData.attestationStatus}
          onClose={handleCloseAttestationModal}
        />
      )}
    </div>
  )
}

// Helper to build 5-stage status
function buildJourney(campaign: Campaign, allDonations: Donation[]) {
  const campDonations = allDonations.filter(d => d.campaignId === campaign.id)
  const hasDonation = campDonations.length > 0
  const hasMilestones = campaign.milestones.length > 0
  const hasProof = campaign.milestones.some(m => !!m.proofCid)
  const isDisbursed = campDonations.some(d => d.status === 'disbursed' || d.status === 'delivered')
  const isDelivered = campDonations.some(d => d.status === 'delivered')

  return [
    { id: 'capital', label: 'Capital Deployed', status: hasDonation ? 'completed' : 'pending' },
    { id: 'milestone', label: 'Milestone Active', status: hasMilestones ? 'completed' : 'pending' },
    { id: 'proof', label: 'Proof Uploaded', status: hasProof ? 'completed' : 'pending' },
    { id: 'attestation', label: 'Attestation Signed', status: isDisbursed ? 'completed' : 'pending', isAttestation: true },
    { id: 'impact', label: 'Impact Verified', status: isDelivered ? 'completed' : 'pending' },
  ] as const
}

function Stepper({ journey }: { journey: ReturnType<typeof buildJourney> }) {
  return (
    <div className="relative mt-8 lg:mt-16">
      {/* Mobile: Vertical Grid, Desktop: Horizontal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-0">
        {journey.map((step, idx) => {
           const isLast = idx === journey.length - 1
           const isCompleted = step.status === 'completed'
           
           return (
             <div key={step.id} className="relative flex lg:flex-col items-center lg:items-start gap-6 lg:gap-4">
                {/* Connecting Line */}
                {!isLast && (
                  <>
                    {/* Desktop Line */}
                    <div className="hidden lg:block absolute top-[15px] left-[30px] right-[-20px] h-[2px] bg-foreground/10 z-0">
                      {isCompleted && journey[idx+1].status === 'completed' && (
                        <motion.div 
                          className="absolute inset-0 bg-primary origin-left"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.6, delay: idx * 0.15, ease: "easeOut" }}
                        />
                      )}
                    </div>
                    {/* Mobile Line */}
                    <div className="lg:hidden absolute left-[15px] top-[30px] bottom-[-45px] w-[2px] bg-foreground/10 z-0">
                      {isCompleted && journey[idx+1].status === 'completed' && (
                        <motion.div 
                          className="absolute inset-0 bg-primary origin-top"
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ duration: 0.6, delay: idx * 0.15, ease: "easeOut" }}
                        />
                      )}
                    </div>
                  </>
                )}

                {/* Node */}
                <div className="relative z-10 shrink-0">
                  {step.isAttestation ? (
                    <motion.div 
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full border-2",
                        isCompleted 
                          ? "bg-[#0A1A2F] border-[#0A1A2F] text-[#FAFAFA] dark:bg-[#E5E7EB] dark:border-[#E5E7EB] dark:text-[#0A1A2F]" 
                          : "bg-background border-foreground/20 text-foreground/20"
                      )}
                      animate={isCompleted ? { scale: [1, 1.15, 1], boxShadow: ["0px 0px 0px rgba(10,26,47,0)", "0px 0px 15px rgba(10,26,47,0.3)", "0px 0px 0px rgba(10,26,47,0)"] } : {}}
                      transition={{ duration: 0.8, delay: 0.1 }}
                    >
                      {isCompleted && <CheckCircle2 className="w-5 h-5" />}
                    </motion.div>
                  ) : (
                    <div 
                      className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center bg-background",
                        isCompleted ? "border-primary text-primary" : "border-foreground/20 text-foreground/20"
                      )}
                    >
                      {isCompleted && <Check className="w-4 h-4" strokeWidth={3} />}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className={cn("pb-2 lg:pb-0 lg:pr-4", step.isAttestation && isCompleted ? "font-bold text-foreground" : "font-medium text-foreground/70")}>
                  {step.label}
                </div>
             </div>
           )
        })}
      </div>
    </div>
  )
}

