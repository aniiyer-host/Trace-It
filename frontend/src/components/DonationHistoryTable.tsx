import { useState } from 'react'
import { Loader2, DollarSign, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Donation } from '@/types'
import { StatusBadge } from '@/components/StatusBadge'
import { apiService } from '@/utils/apiClient'
import { useToast } from '@/hooks/use-toast'

interface DonationHistoryTableProps {
  donations: Donation[]
  loading: boolean
  onRefresh: () => void
  onViewAttestation: (donationId: string) => void
  onVerifyIntegrity: (donationId: string) => void
}

export default function DonationHistoryTable({
  donations,
  loading,
  onRefresh,
  onViewAttestation,
  onVerifyIntegrity,
}: DonationHistoryTableProps) {
  const [simulatingId, setSimulatingId] = useState<string | null>(null)
  const { toast } = useToast()

  const handleSimulatePayment = async (donationId: string) => {
    setSimulatingId(donationId)
    try {
      await apiService.webhooks.simulateSuccess(donationId)
      toast({ title: 'Payment simulated successfully! Donation is now SUCCESS.' })
      onRefresh()
    } catch (err) {
      console.error('Simulation error:', err)
      toast({ title: 'Simulation failed', variant: 'destructive' })
    } finally {
      setSimulatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-xl h-48 animate-pulse" />
        ))}
      </div>
    )
  }

  if (donations.length === 0) {
    return (
      <div className="glass p-8 text-center">
        <DollarSign className="h-8 w-8 text-primary mx-auto mb-4" />
        <h3 className="font-semibold mb-3">No Donations Yet</h3>
        <p className="text-muted-foreground">
          Start your giving journey by donating to one of our active campaigns.
        </p>
        <button
          onClick={() => {
            // In a real app, we'd use navigate('/')
            alert('Please go to the Home page to see active campaigns')
          }}
          className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded"
        >
          Browse Campaigns
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 overflow-x-auto">
        <table className="w-full">
          <caption className="text-left text-sm font-medium text-muted-foreground mb-2">
            Showing {donations.length} donation{donations.length === 1 ? '' : 's'}
          </caption>
          <thead>
            <tr>
              <th className="text-left">Campaign</th>
              <th className="text-center">Amount</th>
              <th className="text-center">Status</th>
              <th className="text-center">Attestation</th>
              <th className="text-center">Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {donations.map((donation) => {
              const normStatus = (donation.status || '').toString().toUpperCase()
              const isInitiated = normStatus === 'INITIATED' || normStatus === 'PENDING'
              const isConfirmed = normStatus === 'SUCCESS' || normStatus === 'DELIVERED' || normStatus === 'DISBURSED' || normStatus === 'ALLOCATED'

              return (
                <tr key={donation.id} className="border-t">
                  <td className="font-medium text-left max-w-xs truncate py-4">
                    {donation.campaignTitle || 'Campaign'}
                  </td>
                  <td className="text-center font-medium py-4">
                    ₹{Number(donation.amount).toLocaleString()}
                  </td>
                  <td className="text-center py-4">
                    <div className="flex flex-col items-center gap-1.5">
                      <StatusBadge status={donation.status} size="sm" />
                      {/* DEV ONLY SIMULATION BUTTON */}
                      {import.meta.env.DEV && isInitiated && (
                        <button
                          onClick={() => handleSimulatePayment(donation.id)}
                          disabled={simulatingId === donation.id}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors cursor-pointer"
                        >
                          {simulatingId === donation.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Zap className="h-2.5 w-2.5" />
                          )}
                          Simulate Payment
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="text-center py-4">
                    <button
                      onClick={() => onViewAttestation(donation.id)}
                      className="flex items-center justify-center gap-2 text-xs font-medium w-full hover:opacity-80"
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full inline-block',
                          isConfirmed ? 'bg-green-500' : 'bg-yellow-500'
                        )}
                      />
                      {isConfirmed ? 'Receipt Confirmed' : 'Pending NGO Confirmation'}
                    </button>
                  </td>
                  <td className="text-center text-xs py-4">
                    {new Date(donation.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-center py-4">
                    <div className="flex items-center gap-3 justify-center">
                      <button
                        onClick={() => alert(`View donation ${donation.id} details`)}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors bg-transparent border-none p-0 cursor-pointer"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => onVerifyIntegrity(donation.id)}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors bg-transparent border-none p-0 cursor-pointer"
                      >
                        Verify Integrity
                      </button>
                      {donation.explorerUrl && (
                        <a
                          href={donation.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors"
                        >
                          View on Explorer
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}