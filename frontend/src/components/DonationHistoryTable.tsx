import { Loader2, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Donation } from '@/types'
import AttestationVerificationBadge from './AttestationVerificationBadge'

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
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <h2 className="text-2xl font-bold">My Donation History</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onRefresh}
            className={cn(
              'outline',
              'size-sm',
              loading && 'opacity-50',
              'disabled:opacity-50',
              !loading && 'hover:bg-muted/50'
            )}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>

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
                  ₹{donation.amount.toLocaleString()}
                </td>
                <td className="text-center py-4">
                  <span
                    className={cn(
                      'px-2.5 py-0.5 rounded text-xs font-medium',
                      donation.status === 'delivered'
                        ? 'bg-green-50 text-green-600'
                        : donation.status === 'disbursed'
                        ? 'bg-blue-50 text-blue-600'
                        : donation.status === 'allocated'
                        ? 'bg-yellow-50 text-yellow-600'
                        : 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {donation.status
                      .split(/(?=[A-Z])/)
                      .join(' ')
                      .toLowerCase()}
                  </span>
                </td>
                <td className="text-center py-4">
                  <AttestationVerificationBadge
                    attestationStatus={
                      donation.status === 'delivered' || donation.status === 'disbursed'
                        ? 'receipt_confirmed'
                        : 'pending'
                    }
                    onClick={() => onViewAttestation(donation.id)}
                    size="sm"
                  >
                  </AttestationVerificationBadge>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <button
                      onClick={() => onVerifyIntegrity(donation.id)}
                      className={cn(
                        'outline',
                        'size-xs',
                        'hover:bg-muted/50',
                        'text-muted-foreground hover:text-primary'
                      )}
                    >
                      Verify Integrity
                    </button>
                    <a
                      href={donation.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'outline',
                        'size-xs',
                        'hover:bg-muted/50',
                        'text-muted-foreground hover:text-primary'
                      )}
                    >
                      View on Explorer
                    </a>
                  </div>
                </td>
                <td className="text-center text-xs py-4">
                  {new Date(donation.createdAt).toLocaleDateString()}
                </td>
                <td className="text-center py-4 space-x-2">
                  <button
                    onClick={() => alert(`View donation ${donation.id} details`)}
                    className={cn(
                      'outline',
                      'size-sm',
                      'hover:bg-muted/50',
                      'text-muted-foreground hover:text-primary'
                    )}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}