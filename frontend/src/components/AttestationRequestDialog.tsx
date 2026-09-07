import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { requestAttestation } from '@/services/mockApi'
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
      // Request receipt attestation (NGO confirming receipt of funds)
      await requestAttestation(donation.id, 'receipt')
      toast({
        title: 'Attestation requested successfully!',
        description: 'The NGO has been notified to confirm receipt of this donation.',
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
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Request NGO Attestation</DialogTitle>
          <DialogDescription>
            Request the NGO to confirm receipt of funds for this donation.
            Once confirmed, the attestation will be stored on-chain.
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
                The NGO will receive a notification to confirm receipt of funds.
              </li>
              <li>
                Upon confirmation, an attestation will be generated and stored on-chain.
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