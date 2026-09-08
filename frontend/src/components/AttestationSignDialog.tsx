import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, Shield } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { createAttestation } from '@/services/mockApi'
import type { Donation } from '@/types'

interface AttestationSignDialogProps {
  donation: Donation
  ngoName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAttestationSigned: () => void
}

export default function AttestationSignDialog({
  donation,
  ngoName,
  open,
  onOpenChange,
  onAttestationSigned,
}: AttestationSignDialogProps) {
  const [loading, setLoading] = useState(false)
  const [attestationType, setAttestationType] = useState<'receipt' | 'delivery'>('receipt')
  const { toast } = useToast()

  const handleSignAttestation = async () => {
    setLoading(true)
    try {
      // Create attestation (simulating NGO signing with their private key)
      const result = await createAttestation(donation.id, attestationType, ngoName)

      toast({
        title: `${attestationType === 'receipt' ? 'Receipt' : 'Delivery'} attestation signed!`,
        description: `Attestation stored on-chain with ID: ${result.id}`,
      })

      onAttestationSigned()
    } catch (error) {
      console.error('Failed to sign attestation:', error)
      toast({
        title: 'Failed to sign attestation',
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
          <DialogTitle className="text-xl">Sign Attestation</DialogTitle>
          <DialogDescription>
            Simulate NGO signing an attestation to confirm {attestationType === 'receipt' ? 'receipt of funds' : 'delivery to beneficiaries'}.
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
            <p className="text-muted-foreground">
              NGO: {ngoName}
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium">Attestation Type:</p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="receipt"
                    checked={attestationType === 'receipt'}
                    onChange={(e) => setAttestationType(e.target.value as 'receipt')}
                    className="h-4 w-4 text-primary"
                  />
                  Receipt Confirmation
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="delivery"
                    checked={attestationType === 'delivery'}
                    onChange={(e) => setAttestationType(e.target.value as 'delivery')}
                    className="h-4 w-4 text-primary"
                  />
                  Delivery Confirmation
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {attestationType === 'receipt'
                  ? 'Confirm that the NGO has received the funds from this donation.'
                  : 'Confirm that the NGO has delivered the aid/funds to the intended beneficiaries.'}
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSignAttestation}
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  {attestationType === 'receipt' ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirm Receipt
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Confirm Delivery
                    </>
                  )}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}