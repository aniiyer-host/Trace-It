import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import type { Donation } from '@/types'

interface AttestationRequestDialogProps {
  donation: Donation
  open: boolean
  onOpenChange: (open: boolean) => void
  onAttestationRequested: () => void
}

export default function AttestationRequestDialog({
  donation,
  open,
  onOpenChange,
  onAttestationRequested,
}: AttestationRequestDialogProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleRequestAttestation = async () => {
    setLoading(true)
    try {
      // await requestAttestation(donation.id, 'receipt')
      await apiService.donations.requestAttestation(donation.id, 'receipt')
      toast({
        title: 'Attestation request submitted',
        description: 'The request will appear in the NGO’s pending attestations list.',
      })
      onAttestationRequested()
    } catch (error) {
      console.error('Failed to request attestation:', error)
      toast({
        title: 'Failed to request attestation',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-border bg-card shadow-sm">
        <DialogHeader>
          <DialogTitle className="text-xl">Request NGO Attestation</DialogTitle>
          <DialogDescription>
            Request the NGO to confirm receipt of funds for this donation. The
            request appears in the NGO’s pending attestations list; this does
            not send an email notification.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Donation ID: {donation.id.substring(0, 8)}...
            </p>
            <p className="text-muted-foreground">
              Amount: ₹{donation.amount.toLocaleString()}
            </p>
            <p className="text-muted-foreground">
              Campaign: {donation.campaignTitle}
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-medium">What happens next?</p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                The request will appear in the NGO’s pending attestations list.
              </li>
              <li>
                The NGO’s confirmation updates the stored attestation record.
              </li>
              <li>
                You will be able to verify this attestation anytime.
              </li>
            </ol>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestAttestation}
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                'Request Attestation'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
