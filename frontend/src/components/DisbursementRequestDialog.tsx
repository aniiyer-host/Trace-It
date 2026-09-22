import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Banknote } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { Milestone } from '@/types'

interface DisbursementRequestDialogProps {
  milestone: Milestone
  open: boolean
  onOpenChange: (open: boolean) => void
  onDisbursementRequested: () => void
}

export default function DisbursementRequestDialog({
  milestone,
  open,
  onOpenChange,
  onDisbursementRequested,
}: DisbursementRequestDialogProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleRequestDisbursement = async () => {
    setLoading(true)
    try {
      // In a real app, this would call an API to request disbursement
      // For now, we'll simulate by updating the milestone status (though this is usually done by admin)
      // We'll just show a success message and call the callback
      toast({
        title: 'Disbursement requested successfully!',
        description: `A request has been sent to disburse funds for "${milestone.title}".`,
      })
      onDisbursementRequested()
    } catch (error) {
      console.error('Failed to request disbursement:', error)
      toast({
        title: 'Failed to request disbursement',
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
          <DialogTitle className="text-xl">Request Disbursement</DialogTitle>
          <DialogDescription>
            Request the disbursement of funds for this milestone to the NGO's wallet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Milestone ID: {milestone.id.substring(0, 8)}...
            </p>
            <p className="text-muted-foreground">
              Title: {milestone.title}
            </p>
            <p className="text-muted-foreground">
              Target Amount: ₹{milestone.targetAmount.toLocaleString()}
            </p>
            <p className="text-muted-foreground">
              Current Status: {milestone.status.split(/(?=[A-Z])/).join(' ').toLowerCase()}
            </p>
            {milestone.proofCid && (
              <p className="text-muted-foreground">
                Proof Submitted: Yes (CID: {milestone.proofCid.substring(0, 8)}...)
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="font-medium">What happens after disbursement?</p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                Funds will be transferred from the escrow account to the NGO's wallet.
              </li>
              <li>
                The NGO will receive a notification and can use the funds for the milestone activities.
              </li>
              <li>
                Upon completion, the NGO will submit proof and request milestone completion verification.
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
              onClick={handleRequestDisbursement}
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Banknote className="mr-2 h-4 w-4" />
                  Request Disbursement
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}