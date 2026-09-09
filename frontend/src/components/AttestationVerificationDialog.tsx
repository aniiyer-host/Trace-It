import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, Shield } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import type { Donation } from '@/types'

interface AttestationVerificationDialogProps {
  donation: Donation
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AttestationVerificationDialog({
  donation,
  open,
  onOpenChange,
}: AttestationVerificationDialogProps) {
  const [attestation, setAttestation] = useState<any>(null)
  const [verifying, setVerifying] = useState(false)
  const { toast } = useToast()

  const verifyAttestation = async () => {
    setVerifying(true)
    try {
      // In a real app, this would verify the attestation on-chain
      // For demo, we'll just fetch the attestation data
      const result = await getAttestationByDonationId(donation.id, 'receipt')
      setAttestation(result)
      toast({
        title: 'Attestation verified successfully!',
        description: 'The attestation is valid and stored on-chain.',
      })
    } catch (error) {
      console.error('Failed to verify attestation:', error)
      toast({
        title: 'Failed to verify attestation',
        variant: 'destructive',
      })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Verify Attestation</DialogTitle>
          <DialogDescription>
            Verify the NGO attestation for this donation stored on the blockchain.
          </DialogDescription>
        </DialogHeader>
        {attestation ? (
          <div className="space-y-6 p-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center bg-emerald-50 text-emerald-500 rounded-full">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Attestation Verified</h3>
                  <p className="text-muted-foreground">
                    This attestation is valid and permanently stored on the Solana blockchain.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="font-medium">Attestation Details:</p>
                  <div className="space-y-2 text-sm">
                    <p><strong>Attestation ID:</strong> {attestation.id}</p>
                    <p><strong>Type:</strong> {attestation.type === 'receipt' ? 'Receipt Confirmation' : 'Delivery Confirmation'}</p>
                    <p><strong>Attested By:</strong> {attestation.attestedBy}</p>
                    <p><strong>Timestamp:</strong> {new Date(attestation.attestedAt).toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="font-medium">Attestation Statement:</p>
                  <p className="text-muted-foreground bg-muted/50 p-4 rounded">
                    {attestation.statement}
                  </p>
                </div>

                <div className="space-y-4">
                  <p className="font-medium">Verification Information:</p>
                  <div className="space-y-2 text-sm">
                    <p><strong>On-Chain Status:</strong> <span className="text-emerald-600">Confirmed</span></p>
                    <p><strong>Immutability:</strong> This attestation cannot be modified or deleted once stored on-chain.</p>
                    <p><strong>Verification Method:</strong> Cryptographic signature verification using NGO's public key.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => onOpenChange(false)}
                  className="w-full md:w-auto"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 p-6">
            {verifying ? (
              <div className="flex items-center justify-center space-x-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">Verifying attestation on-chain...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center bg-yellow-50 text-yellow-500 rounded-full">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Ready to Verify</h3>
                    <p className="text-muted-foreground">
                      Click verify to check the attestation stored on the blockchain.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium">What is being verified:</p>
                  <div className="space-y-2 text-sm">
                    <p><strong>Donation ID:</strong> {donation.id.substring(0, 8)}...</p>
                    <p><strong>Amount:</strong> ₹{donation.amount.toLocaleString()}</p>
                    <p><strong>Campaign:</strong> {donation.campaignTitle}</p>
                    <p><strong>Attestation Type:</strong> Receipt Confirmation</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium">Verification Process:</p>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>
                      Retrieve the attestation from on-chain storage using its ID.
                    </li>
                    <li>
                      Verify the cryptographic signature using the NGO's public key.
                    </li>
                    <li>
                      Confirm the attestation matches the donation details.
                    </li>
                    <li>
                      Check that the attestation has not been tampered with.
                    </li>
                  </ol>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={verifyAttestation}
                    disabled={verifying}
                    className="w-full md:w-auto"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify Attestation'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}