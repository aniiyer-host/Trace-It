import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiService } from '../utils/apiClient'


interface NgoSummary {
  id: string
  name: string
  totalCampaigns: number
  activeCampaigns: number
  totalRaised: number
}

export function NgoDirectory() {
  const [ngos, setNgos] = useState<NgoSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNgos() {
      try {
        const data = await apiService.public.getNgos()
        setNgos(data)
      } catch (error) {
        console.error('Failed to fetch NGOs:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchNgos()
  }, [])

  return (
    <div className="container max-w-6xl mx-auto px-4 py-12 animate-in fade-in duration-500">
      <div className="mb-12">
        <h1 className="text-4xl font-extrabold text-foreground tracking-tight mb-2">
          Verified Institutions
        </h1>
        <p className="text-lg text-muted-foreground">
          Every organisation verified and tracked on Trace-It
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-6 rounded-xl bg-foreground/[0.03] space-y-4">
              <div className="h-6 w-2/3 bg-muted rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
              <div className="h-8 w-1/3 mt-4 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : ngos.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-xl text-muted-foreground font-medium">
            No verified institutions yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ngos.map((ngo) => (
            <div 
              key={ngo.id} 
              className="p-6 rounded-xl bg-foreground/[0.03] hover:bg-foreground/[0.05] transition-colors flex flex-col justify-between h-full"
            >
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <h2 className="text-xl font-bold text-foreground truncate">
                    {ngo.name}
                  </h2>
                </div>
                
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Campaigns</span>
                    <span className="font-medium text-foreground">{ngo.totalCampaigns}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Active Campaigns</span>
                    <span className="font-medium text-foreground">{ngo.activeCampaigns}</span>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Raised</div>
                  <div className="text-2xl font-bold tabular-nums text-foreground">
                    ₹{ngo.totalRaised.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <Link 
                to={`/campaigns?ngo=${ngo.id}`}
                className="text-primary font-medium hover:underline text-sm mt-auto inline-flex"
              >
                View Campaigns →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
