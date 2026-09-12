import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
// import { Loader2, CheckCircle2, Shield } from 'lucide-react'
import { Loader2, Shield } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import type { Donation } from '@/types'
import { cn } from '@/lib/utils'

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
      const result = await apiService.ngos.signAttestation(donation.id, attestationType)

      toast({
        title: `${attestationType === 'receipt' ? 'Receipt' : 'Delivery'} attestation signed!`,
        // description: `Attestation stored on-chain with ID: ${result?.id || 'pending-tx'}`,
        description: `Attestation stored on-chain with ID: ${(result as any)?.id || 'pending-tx'}`,
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
      <DialogContent className="max-w-xl bg-background border-foreground/10 p-0 overflow-hidden">
        <div className="p-8 pb-6 border-b border-foreground/5 bg-foreground/[0.02]">
            <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tighter">Cryptographic Attestation</DialogTitle>
            <DialogDescription className="text-foreground/60">
                You are about to sign a permanent, publicly verifiable record on the Solana blockchain.
            </DialogDescription>
            </DialogHeader>
        </div>

        <div className="p-8 space-y-8">
            {/* Type Selection Tabs */}
            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={() => setAttestationType('receipt')}
                    className={cn(
                        "flex flex-col items-start p-4 rounded-xl border text-left transition-all",
                        attestationType === 'receipt' 
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-foreground/10 text-foreground/50 hover:border-foreground/30 hover:bg-foreground/[0.02]"
                    )}
                >
                    <span className="font-semibold mb-1">Proof of Receipt</span>
                    <span className="text-xs opacity-80 leading-tight">Confirm platform funds reached your NGO bank account.</span>
                </button>
                
                <button
                    onClick={() => setAttestationType('delivery')}
                    className={cn(
                        "flex flex-col items-start p-4 rounded-xl border text-left transition-all",
                        attestationType === 'delivery' 
                            ? "border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-500"
                            : "border-foreground/10 text-foreground/50 hover:border-foreground/30 hover:bg-foreground/[0.02]"
                    )}
                >
                    <span className="font-semibold mb-1">Proof of Delivery</span>
                    <span className="text-xs opacity-80 leading-tight">Confirm funds were successfully delivered to beneficiary.</span>
                </button>
            </div>

            {/* Payload preview */}
            <div className="space-y-3">
                <p className="text-sm font-semibold tracking-widest uppercase text-foreground/50">Transaction Payload</p>
                <div className="bg-foreground/5 p-4 rounded-xl border border-foreground/10 font-mono text-sm space-y-2 overflow-x-auto">
                    <div className="flex"><span className="text-foreground/40 w-24">target:</span><span className="text-foreground font-semibold">{donation.id}</span></div>
                    <div className="flex"><span className="text-foreground/40 w-24">campaign:</span><span className="text-foreground">{donation.campaignTitle}</span></div>
                    <div className="flex"><span className="text-foreground/40 w-24">amount:</span><span className="text-foreground">₹{donation.amount.toLocaleString()}</span></div>
                    <div className="flex"><span className="text-foreground/40 w-24">claim_type:</span><span className={cn("font-bold", attestationType === 'receipt' ? 'text-primary' : 'text-emerald-500')}>{attestationType.toUpperCase()}_CONFIRMATION</span></div>
                    <div className="flex"><span className="text-foreground/40 w-24">signer:</span><span className="text-foreground">{ngoName} (Keypair active)</span></div>
                </div>
            </div>

            <div className="flex items-start gap-3 bg-foreground/5 p-4 rounded-xl text-sm text-foreground/80">
                <Shield className="w-5 h-5 text-foreground/60 shrink-0 mt-0.5" />
                <p>
                    By signing this payload, your organization creates an undeniable cryptographic proof of {attestationType === 'receipt' ? 'receipt' : 'delivery'}. 
                    This cannot be altered or erased.
                </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <Button
                    variant="outline"
                    className="border-foreground/20 sm:w-auto w-full"
                    onClick={() => onOpenChange(false)}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSignAttestation}
                    disabled={loading}
                    size="lg"
                    className="sm:w-auto w-full bg-foreground text-background hover:bg-foreground/90 font-semibold"
                >
                {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Broadcasting...</>
                ) : (
                    <><Shield className="mr-2 h-4 w-4" /> Sign & Broadcast Attestation</>
                )}
                </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}