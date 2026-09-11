import { useState, useEffect, useRef } from 'react'
import { ArrowRight, CheckCircle2, Shield, HeartHandshake, Zap, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DonationCard } from '@/components/DonationCard'
import { DonateDialog } from '@/components/DonateDialog'
import { Button } from '@/components/ui/button'
import { useDonationStore } from '@/store/donationStore'
import { useCountUp } from '@/hooks/useCountUp'
import type { Campaign } from '@/types'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// New StatBlock that uses the explicitly passed GSAP trigger instead of an observer
function StatBlock({ value, label, prefix = '', suffix = '', isFallback = false, trigger = false }: { value: number | string, label: string, prefix?: string, suffix?: string, isFallback?: boolean, trigger?: boolean }) {
  const numericValue = typeof value === 'number' ? value : 0
  const count = useCountUp(numericValue, 2000, trigger)
  
  const displayValue = isFallback ? value : count.toLocaleString()
  
  return (
    <div className="space-y-4">
      <div className="text-7xl lg:text-9xl font-bold tabular-nums tracking-tighter text-foreground">
        {isFallback ? displayValue : <>{prefix}{displayValue}{suffix}</>}
      </div>
      <div className="text-2xl text-foreground/40 uppercase tracking-[0.2em] font-semibold">
        {label}
      </div>
    </div>
  )
}

const CHAIN_STEPS = [
  { icon: HeartHandshake, title: "1. Donation Escrow", desc: "Funds are securely locked on-chain, pending milestone validation." },
  { icon: Shield, title: "2. Milestone Triggers", desc: "NGOs unlock capital only by providing cryptographic proof of work." },
  { icon: FileText, title: "3. Immutable Receipts", desc: "Cohort data and delivery anchoring are permanently recorded." },
  { icon: CheckCircle2, title: "4. Final Attestation", desc: "Irrevocable sign-off that aid reached the intended beneficiary." },
  { icon: Zap, title: "5. Zero-Fee Settlement", desc: "Instant value transfer bypassing traditional banking bleed." },
]

export default function Home() {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [triggerStats, setTriggerStats] = useState(false)

  const { campaigns, campaignsLoading, loadCampaigns } = useDonationStore()
  const navigate = useNavigate()

  const pinRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const panel1Ref = useRef<HTMLDivElement>(null)
  const panel2Ref = useRef<HTMLDivElement>(null)
  const panel3Ref = useRef<HTMLDivElement>(null)
  const panel4Ref = useRef<HTMLDivElement>(null)
  const panel5Ref = useRef<HTMLDivElement>(null)
  const journeyItemsRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => { void loadCampaigns() }, [loadCampaigns])

  useGSAP(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: pinRef.current,
        pin: true,
        scrub: 2.5, // High dampening for heavy inertia
        start: "top top",
        end: "+=15000", // Extended physical scroll distance
      }
    })

    const transDur = 2;
    const holdDur = 1;

    // --- TRANSITION 1: Hero to Journey ---
    tl.to(panel1Ref.current, { scale: 0.8, opacity: 0, rotateY: 10, duration: transDur, ease: "power2.inOut" }, 0)
    tl.to(trackRef.current, { x: "-100vw", duration: transDur, ease: "power2.inOut" }, 0)
    tl.from(panel2Ref.current, { scale: 1.2, opacity: 0, rotateY: -10, duration: transDur, ease: "power2.inOut" }, 0)

    // --- PANEL 2 SCRUBBING (CHAIN OF TRUST) ---
    CHAIN_STEPS.forEach((_, i) => {
      const item = journeyItemsRef.current[i]
      if (!item) return

      tl.fromTo(item, 
        { opacity: 0, scale: 0.7, z: -200, y: 50 },
        { opacity: 1, scale: 1, z: 0, y: 0, duration: 1.5, ease: "power2.out" },
        i === 0 ? "-=0.5" : "-=1" 
      )
      
      tl.to({}, { duration: 0.5 })
      
      tl.to(item, {
        opacity: 0, scale: 1.3, z: 200, y: -50, duration: 1.5, ease: "power2.in"
      }, "-=0.2")
    })

    // --- TRANSITION 2: Journey to Stats ---
    // Fire the React state trigger precisely as Panel 3 starts sliding in
    tl.call(() => setTriggerStats(true), [], "<")

    tl.to(panel2Ref.current, { scale: 0.8, opacity: 0, rotateY: 10, duration: transDur, ease: "power2.inOut" })
    tl.to(trackRef.current, { x: "-200vw", duration: transDur, ease: "power2.inOut" }, "<")
    tl.from(panel3Ref.current, { scale: 1.2, opacity: 0, rotateY: -10, duration: transDur, ease: "power2.inOut" }, "<")

    // --- TRANSITION 3: Stats to Campaigns ---
    tl.to({}, { duration: holdDur })
    tl.to(panel3Ref.current, { scale: 0.8, opacity: 0, rotateY: 10, duration: transDur, ease: "power2.inOut" })
    tl.to(trackRef.current, { x: "-300vw", duration: transDur, ease: "power2.inOut" }, "<")
    tl.from(panel4Ref.current, { scale: 1.2, opacity: 0, rotateY: -10, duration: transDur, ease: "power2.inOut" }, "<")

    // --- TRANSITION 4: Campaigns to CTA ---
    tl.to({}, { duration: holdDur })
    tl.to(panel4Ref.current, { scale: 0.8, opacity: 0, rotateY: 10, duration: transDur, ease: "power2.inOut" })
    tl.to(trackRef.current, { x: "-400vw", duration: transDur, ease: "power2.inOut" }, "<")
    tl.from(panel5Ref.current, { scale: 1.2, opacity: 0, rotateY: -10, duration: transDur, ease: "power2.inOut" }, "<")

  }, { scope: pinRef })

  const impactMetrics = {
    totalRaised: campaigns.reduce((sum, c) => sum + c.raisedAmount, 0),
    totalDonors: "—", 
    activeCampaigns: campaigns.length,
    milestonesCompleted: campaigns.reduce((sum, c) => sum + c.milestones.filter(m => m.status === 'delivered').length, 0),
  }

  const handleDonate = (c: Campaign) => { setSelectedCampaign(c); setDialogOpen(true) }
  const handleView = (c: Campaign) => navigate(`/donor?campaign=${c.id}`)

  return (
    <div className="font-sans selection:bg-foreground selection:text-background">
      
      {/* FULL PAGE PINNED SCROLLYTELLING SECTION */}
      <div 
        ref={pinRef} 
        className="w-screen relative left-1/2 -ml-[50vw] -mt-8 h-[100dvh] overflow-hidden bg-background text-foreground"
        style={{ perspective: '1200px' }}
      >
        {/* The 500vw Track */}
        <div ref={trackRef} className="flex h-full w-[500vw] will-change-transform" style={{ transformStyle: 'preserve-3d' }}>
          
          {/* PANEL 1: HERO */}
          <div ref={panel1Ref} className="w-[100vw] h-full flex-shrink-0 flex flex-col items-center justify-center relative p-6">
            <h1 className="text-7xl md:text-[10rem] font-bold leading-[0.85] tracking-tighter text-foreground text-center text-balance max-w-6xl">
              Trace Every Rupee.<br/>
              <span className="text-foreground/30">Trust Every NGO.</span>
            </h1>
            <p className="text-2xl md:text-4xl text-foreground/60 max-w-[40ch] leading-relaxed text-pretty text-center font-medium mt-12">
              We anchor every donation milestone on-chain. Verify exactly where your money went, down to the last rupee.
            </p>
            <div className="mt-20 text-foreground/30 flex flex-col items-center">
              <span className="text-sm font-bold tracking-[0.3em] uppercase mb-6 animate-pulse">Scroll to experience</span>
              <div className="w-[2px] h-32 bg-gradient-to-b from-foreground/40 to-transparent rounded-full" />
            </div>
          </div>

          {/* PANEL 2: SCRUBBING LIST */}
          <div ref={panel2Ref} className="w-[100vw] h-full flex-shrink-0 flex items-center justify-center relative">
            <div className="relative w-full max-w-5xl h-[600px] flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
              {CHAIN_STEPS.map((step, i) => (
                <div 
                  key={i} 
                  ref={el => journeyItemsRef.current[i] = el}
                  className="absolute inset-0 flex flex-col items-center justify-center text-center opacity-0"
                >
                  <div className="w-32 h-32 rounded-full bg-foreground/5 backdrop-blur-xl border border-foreground/10 flex items-center justify-center text-foreground mb-12 shadow-2xl">
                    <step.icon className="w-16 h-16" />
                  </div>
                  <h2 className="text-6xl md:text-8xl font-bold tracking-tighter text-foreground mb-8 text-balance leading-none">
                    {step.title}
                  </h2>
                  <p className="text-3xl md:text-4xl text-foreground/50 text-pretty max-w-[30ch] leading-tight">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* PANEL 3: STATS */}
          <div ref={panel3Ref} className="w-[100vw] h-full flex-shrink-0 flex items-center justify-center relative p-6">
             <div className="grid grid-cols-2 gap-y-24 gap-x-32 text-center max-w-5xl">
                <StatBlock value={impactMetrics.totalRaised} label="Rupees Raised" prefix="₹" trigger={triggerStats} />
                <StatBlock value={impactMetrics.activeCampaigns} label="Active Campaigns" trigger={triggerStats} />
                <StatBlock value={impactMetrics.milestonesCompleted} label="Milestones Completed" trigger={triggerStats} />
                <StatBlock value={impactMetrics.totalDonors} label="Verified Donors" isFallback={true} trigger={triggerStats} />
             </div>
          </div>

          {/* PANEL 4: CAMPAIGNS GRID */}
          <div ref={panel4Ref} className="w-[100vw] h-full flex-shrink-0 flex flex-col items-center justify-center relative p-6">
             <div className="w-full max-w-[1400px] mx-auto space-y-16">
                <div className="text-center space-y-6">
                  <h2 className="text-6xl md:text-8xl font-bold tracking-tighter text-foreground text-balance">Fund Verified Impact</h2>
                  <p className="text-2xl text-foreground/50 text-pretty">
                    Select a campaign to begin tracking your contribution on-chain.
                  </p>
                </div>
                <div className="flex justify-center gap-8 w-full">
                  {campaignsLoading ? (
                    [1, 2, 3].map((i) => (
                      <div key={i} className="w-[400px] h-[500px] shrink-0 bg-foreground/5 rounded-[2.5rem] animate-pulse" />
                    ))
                  ) : (
                    (campaigns || []).slice(0, 3).map((c) => (
                      <div key={c.id} className="w-[400px] shrink-0">
                        <DonationCard 
                          campaign={c} 
                          onDonate={handleDonate} 
                          onView={handleView} 
                        />
                      </div>
                    ))
                  )}
                </div>
             </div>
          </div>

          {/* PANEL 5: CTA */}
          <div ref={panel5Ref} className="w-[100vw] h-full flex-shrink-0 flex flex-col items-center justify-center relative p-6">
             <div className="text-center space-y-12">
                <h2 className="text-7xl md:text-[8rem] font-bold tracking-tighter text-foreground text-balance leading-none max-w-5xl mx-auto">
                  Demand more from your donations.
                </h2>
                <p className="text-3xl text-foreground/60 max-w-[40ch] mx-auto leading-relaxed text-pretty">
                  Join the donors who refuse to settle for black-box charities. Trace every rupee.
                </p>
                <div className="pt-12">
                  <Button
                    className="group bg-foreground text-background hover:bg-foreground/90 text-2xl px-12 py-10 h-auto rounded-full font-bold transition-transform hover:scale-[0.98] shadow-2xl"
                    onClick={() => navigate('/donor')}
                  >
                    Start Donating <ArrowRight className="ml-4 w-8 h-8 group-hover:translate-x-2 transition-transform" />
                  </Button>
                </div>
             </div>
          </div>

        </div>
      </div>

      <DonateDialog campaign={selectedCampaign} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}