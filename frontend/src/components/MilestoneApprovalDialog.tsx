import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiService } from '@/utils/apiClient'
import type { Milestone } from '@/types'

interface MilestoneApprovalDialogProps {
  milestone: Milestone
  open: boolean
  onOpenChange: (open: boolean) => void
  onMilestoneApproved: () => void
}

export default function MilestoneApprovalDialog({
  milestone,
  open,
  onOpenChange,
  onMilestoneApproved,
}: MilestoneApprovalDialogProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleApproveMilestone = async () => {
    setLoading(true)
    try {
      await approveMilestone(milestone.id)
      toast({
        title: 'Milestone approved successfully!',
        description: `Funds for "${milestone.title}" have been approved for disbursement.`,
      })
      onMilestoneApproved()
    } catch (error) {
      console.error('Failed to approve milestone:', error)
      toast({
        title: 'Failed to approve milestone',
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
          <DialogTitle className="text-xl">Approve Milestone</DialogTitle>
          <DialogDescription>
            Approve the disbursement of funds for this milestone to proceed with execution.
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
          </div>

          <div className="space-y-3">
            <p className="font-medium">What happens after approval?</p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                Funds will be released from the escrow account to the NGO's wallet.
              </li>
              <li>
                The NGO can begin execution of the milestone activities.
              </li>
              <li>
                Upon completion, the NGO will submit proof for verification.
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
              onClick={handleApproveMilestone}
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve Milestone
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}