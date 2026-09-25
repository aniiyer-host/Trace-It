import { useState } from 'react'
import { Keypair } from '@solana/web3.js'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Copy, Check } from 'lucide-react'

interface BeneficiaryWalletDialogProps {
  onWalletCreated: (walletId: string) => void
  onClose: () => void
}

export function BeneficiaryWalletDialog({
  onWalletCreated,
  onClose,
}: BeneficiaryWalletDialogProps) {
  const [screen, setScreen] = useState<'form' | 'result'>('form')
  const [walletId, setWalletId] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)

  const handleGenerate = () => {
    if (!reference.trim()) return

    // Phase 4: Real Solana wallet generation via Keypair.generate() from @solana/web3.js
    // Public key (base58) becomes walletId
    const keypair = Keypair.generate()
    const generated = keypair.publicKey.toBase58()
    setWalletId(generated)
    setScreen('result')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(walletId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Use a controlled dialog to ensure onClose is properly managed
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-background border-border/40 p-6">
        {screen === 'form' && (
          <>
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Create Beneficiary Wallet
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1.5">
                Generate a secure wallet ID for your campaign beneficiary.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Internal Reference <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g. Village name, project code, or beneficiary group"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="bg-transparent"
                />
                <p className="text-xs text-muted-foreground">
                  For your records only. Not stored publicly.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Notes (optional)
                </label>
                <Textarea
                  placeholder="Any additional details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="bg-transparent resize-none"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!reference.trim()}
                className="bg-foreground text-background hover:bg-foreground/90 font-medium"
              >
                Generate Wallet ID
              </Button>
            </div>
          </>
        )}

        {screen === 'result' && (
          <>
            <DialogHeader className="mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-2 rounded-full">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
                </div>
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  Wallet ID Generated
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-5">
              <div className="bg-foreground/[0.04] p-4 rounded-xl border border-foreground/5 flex items-center justify-between gap-3">
                <div className="font-mono text-sm break-all font-medium text-foreground overflow-hidden">
                  {walletId}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0 bg-background"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5 text-emerald-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1.5 text-muted-foreground" />
                      Copy
                    </>
                  )}
                </Button>
              </div>


              <p className="text-xs text-muted-foreground/80 text-center px-4 leading-relaxed">
                Wallet creation is currently in simulation mode. In production, this
                will generate a real Solana wallet.
              </p>
            </div>

            <div className="mt-8">
              <Button
                onClick={() => onWalletCreated(walletId)}
                className="w-full bg-foreground text-background hover:bg-foreground/90 font-medium py-6"
              >
                Continue to Campaign Creation
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
