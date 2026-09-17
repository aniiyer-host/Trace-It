import type { DonationStatus, ExtendedStatus } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  status: DonationStatus | ExtendedStatus | string
  className?: string
  size?: 'default' | 'sm' | 'lg' // Kept for prop compatibility but unused internally
}

export function StatusBadge({ status, className }: Props) {
  const normStatus = (status || '').toString().toUpperCase()

  let dotColor = 'bg-gray-400'
  let label = normStatus.charAt(0) + normStatus.slice(1).toLowerCase()

  if (normStatus === 'SUCCESS' || normStatus === 'DELIVERED' || normStatus === 'ACTIVE') {
    dotColor = 'bg-green-500'
  } else if (normStatus === 'PENDING' || normStatus === 'INITIATED' || normStatus === 'PENDING_APPROVAL') {
    dotColor = 'bg-yellow-500'
  } else if (normStatus === 'FAILED' || normStatus === 'REJECTED') {
    dotColor = 'bg-red-500'
  }

  // Handle specific label overwrites if needed based on previous design
  if (normStatus === 'INITIATED') label = 'Initiated'
  if (normStatus === 'PENDING') label = 'Pending'
  if (normStatus === 'PENDING_APPROVAL') label = 'Awaiting Approval'
  if (normStatus === 'ACTIVE') label = 'Active'
  if (normStatus === 'SUCCESS') label = 'Success'
  if (normStatus === 'FAILED') label = 'Failed'
  if (normStatus === 'DELIVERED') label = 'Delivered'
  if (normStatus === 'REJECTED') label = 'Rejected'
  if (normStatus === 'PROCESSING') label = 'Processing'
  if (normStatus === 'REFUNDED') label = 'Refunded'
  if (normStatus === 'CANCELLED') label = 'Cancelled'
  if (normStatus === 'VERIFIED') label = 'Verified'
  if (normStatus === 'ALLOCATED') label = 'Allocated'
  if (normStatus === 'DISBURSED') label = 'Disbursed'

  return (
    <span className={cn('flex items-center gap-2 text-xs font-medium', className)}>
      <span className={cn('w-2 h-2 rounded-full inline-block', dotColor)} />
      {label}
    </span>
  )
}
