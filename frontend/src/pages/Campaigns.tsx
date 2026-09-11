import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useDonationStore } from '@/store/donationStore'
import { DonationCard } from '@/components/DonationCard'
import { DonateDialog } from '@/components/DonateDialog'
import { cn } from '@/lib/utils'
import type { Campaign } from '@/types'

const CATEGORIES = ['All', 'Health', 'Education', 'Environment', 'Crisis Relief']

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.4 } 
  },
}

export default function Campaigns() {
  const { campaigns, campaignsLoading, loadCampaigns } = useDonationStore()
  const [activeFilter, setActiveFilter] = useState('All')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [donateOpen, setDonateOpen] = useState(false)

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const filteredCampaigns = useMemo(() => {
    if (activeFilter === 'All') return campaigns
    return campaigns.filter((c) => c.category === activeFilter)
  }, [campaigns, activeFilter])

  const dynamicStagger = filteredCampaigns.length > 12 ? 0.05 : 0.07;
  
  const dynamicContainerVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: dynamicStagger,
      },
    },
  }

  return (
    <div className="min-h-[80vh] flex flex-col pt-12 pb-24">
      {/* Typographic Header */}
      <div className="mb-12">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground mb-4">
          Explore Campaigns
        </h1>
        <p className="text-xl text-muted-foreground font-medium max-w-2xl text-balance">
          Every donation verified and tracked on-chain. Find a cause and make a transparent impact.
        </p>
      </div>

      {/* Filter Controls (Horizontal scroll on mobile) */}
      <div className="flex overflow-x-auto pb-4 mb-8 -mx-4 px-4 md:mx-0 md:px-0 space-x-2 md:space-x-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={cn(
              "whitespace-nowrap px-6 py-3 rounded-full text-base font-bold transition-all active:scale-[0.98]",
              activeFilter === cat
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid or Empty State */}
      {campaignsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 opacity-50">
           {[1, 2, 3, 4, 5, 6].map(i => (
             <div key={i} className="h-96 rounded-[2.5rem] bg-muted animate-pulse" />
           ))}
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24">
           <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
             No active campaigns
           </h2>
           <p className="text-lg text-muted-foreground font-medium">
             There are no campaigns matching this category right now.
           </p>
        </div>
      ) : (
        <motion.div
          key={activeFilter}
          variants={dynamicContainerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12"
        >
          {filteredCampaigns.map((campaign) => (
            <motion.div key={campaign.id} variants={itemVariants}>
              <DonationCard
                campaign={campaign}
                onDonate={(c) => {
                  setSelectedCampaign(c)
                  setDonateOpen(true)
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {selectedCampaign && (
        <DonateDialog
          campaign={selectedCampaign}
          open={donateOpen}
          onClose={() => {
             setDonateOpen(false)
             setTimeout(() => setSelectedCampaign(null), 300)
          }}
        />
      )}
    </div>
  )
}
