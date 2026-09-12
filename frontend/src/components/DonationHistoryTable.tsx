import { Loader2, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Donation } from '@/types'


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

      <div className="space-y-4">
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
            {donations.map((donation) => (
              <tr key={donation.id} className="border-t">
                <td className="font-medium text-left max-w-xs truncate py-4">
                  {donation.campaignTitle}
                </td>
                <td className="text-center text-font-medium py-4">
                  ₹{Number(donation.amount).toLocaleString()}
                </td>
                <td className="text-center py-4">
                  <span className="flex items-center justify-center gap-2 text-xs font-medium">
                    {donation.status.charAt(0).toUpperCase() + donation.status.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="text-center py-4">
                  <button
                    onClick={() => onViewAttestation(donation.id)}
                    className="flex items-center justify-center gap-2 text-xs font-medium w-full hover:opacity-80"
                  >
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full inline-block',
                        donation.status === 'delivered' || donation.status === 'disbursed'
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      )}
                    />
                    {donation.status === 'delivered' || donation.status === 'disbursed'
                      ? 'Receipt Confirmed'
                      : 'Pending NGO Confirmation'}
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
                    <a
                      href={donation.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors"
                    >
                      View on Explorer
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}