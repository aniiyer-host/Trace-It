import { useState } from 'react'
import { Loader2, Plus, Target, FileText, Wallet, CheckCircle2 } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import type { Campaign } from '@/types'
import { BeneficiaryWalletDialog } from './BeneficiaryWalletDialog'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (campaign: Campaign) => void
}

const CATEGORIES = [
  { id: 'education', label: 'Education' },
  { id: 'health', label: 'Health' },
  { id: 'disaster', label: 'Disaster Relief' },
  { id: 'environment', label: 'Environment' },
]

export function CreateCampaignDialog({ open, onClose, onSuccess }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [category, setCategory] = useState('education')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'wallet-check' | 'form'>('wallet-check')
  const [beneficiaryWalletId, setBeneficiaryWalletId] = useState('')
  const [showWalletDialog, setShowWalletDialog] = useState(false)
  const { toast } = useToast()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast({ title: 'Campaign title is required', variant: 'destructive' })
      return
    }
    if (!description.trim()) {
      toast({ title: 'Description is required', variant: 'destructive' })
      return
    }
    const amountNum = parseFloat(targetAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Enter a valid target amount (INR)', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      // Step 1: Create campaign in DRAFT status
      const draftPayload = {
        title: title.trim(),
        description: description.trim(),
        targetAmount: amountNum,
        category,
        currencyCode: 'INR',
        beneficiaryId: beneficiaryWalletId,
      }
      const draftCampaign = (await apiService.campaigns.create(draftPayload)) as any

      // Step 2: Submit campaign for admin approval (transitions DRAFT -> PENDING_APPROVAL)
      let submittedCampaign = draftCampaign
      if (draftCampaign?.id) {
        try {
          submittedCampaign = await apiService.campaigns.submit(draftCampaign.id)
        } catch (submitErr: any) {
          console.warn('Auto-submit after draft failed; remaining in draft:', submitErr)
          throw submitErr;
        }
      }

      toast({
        title: 'Campaign created and submitted! 🎉',
        description: 'Your campaign has been sent to the Admin queue for verification & approval.',
      })

      onSuccess(submittedCampaign || draftCampaign)
      handleClose()
    } catch (err: any) {
      console.error('Create campaign error:', err)
      toast({
        title: 'Failed to create campaign',
        description: err.response?.data?.error || err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setTitle('')
    setDescription('')
    setTargetAmount('')
    setCategory('education')
    setStep('wallet-check')
    setBeneficiaryWalletId('')
    setShowWalletDialog(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border border-border/20 max-w-lg bg-background">
        {step === 'wallet-check' ? (
          <>
            <DialogHeader>
              <DialogTitle className="gradient-text text-xl flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" /> Campaign Beneficiary
              </DialogTitle>
              <DialogDescription>
                Before creating your campaign, confirm your beneficiary's wallet status.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <div 
                onClick={() => setStep('form')}
                className="border border-foreground/10 bg-foreground/[0.03] hover:bg-foreground/[0.06] cursor-pointer rounded-lg p-6 flex flex-col items-start transition-colors"
              >
                <CheckCircle2 className="h-8 w-8 mb-3 text-primary" />
                <h3 className="font-semibold text-lg mb-1">I have a Wallet ID</h3>
                <p className="text-sm text-muted-foreground leading-snug">
                  I already have the beneficiary's wallet ID ready
                </p>
              </div>

              <div 
                onClick={() => setShowWalletDialog(true)}
                className="border border-foreground/10 bg-foreground/[0.03] hover:bg-foreground/[0.06] cursor-pointer rounded-lg p-6 flex flex-col items-start transition-colors"
              >
                <Plus className="h-8 w-8 mb-3 text-primary" />
                <h3 className="font-semibold text-lg mb-1">Create a Wallet</h3>
                <p className="text-sm text-muted-foreground leading-snug">
                  Generate a new wallet ID for this campaign's beneficiary
                </p>
              </div>
            </div>

            {showWalletDialog && (
              <BeneficiaryWalletDialog
                onWalletCreated={(id) => {
                  setBeneficiaryWalletId(id)
                  setShowWalletDialog(false)
                  setStep('form')
                }}
                onClose={() => setShowWalletDialog(false)}
              />
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="gradient-text text-xl flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Create New Campaign
              </DialogTitle>
              <DialogDescription>
                Draft your campaign and submit it for admin verification.
              </DialogDescription>
            </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Campaign Title
            </label>
            <Input
              placeholder="e.g., Clean Drinking Water Project - Phase 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Target Amount (INR ₹)
            </label>
            <Input
              type="number"
              placeholder="e.g., 500000"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              disabled={loading}
              min="1"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat.id}
                  type="button"
                  size="sm"
                  variant={category === cat.id ? 'default' : 'outline'}
                  onClick={() => setCategory(cat.id)}
                  className="text-xs justify-start"
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Description & Objectives
            </label>
            <Textarea
              placeholder="Detail the beneficiaries, scope of work, and expected impact metrics..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Beneficiary Wallet ID
            </label>
            <Input
              placeholder="SOL... paste or enter wallet ID"
              value={beneficiaryWalletId}
              onChange={(e) => setBeneficiaryWalletId(e.target.value)}
              disabled={loading}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Securely hashed and stored. Used to verify fund delivery.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating & Submitting…
                </>
              ) : (
                'Create & Submit Campaign'
              )}
            </Button>
          </div>
        </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
