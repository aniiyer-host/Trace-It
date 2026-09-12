// StatusBadge – Enhanced colour-coded tag with more variants and animations
import type { DonationStatus, ExtendedStatus } from '@/types'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  Clock,
  Banknote,
  Truck,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'

interface Props {
  status: DonationStatus | ExtendedStatus | string
  className?: string
  size?: 'default' | 'sm' | 'lg'
}

export function StatusBadge({ status, className, size = 'default' }: Props) {
  const normStatus = (status || '').toString().toUpperCase()

  // Handle specific variations
  if (normStatus === 'PROCESSING' || normStatus === 'INITIATED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border',
          size === 'sm'
            ? 'text-xs font-medium px-2 py-0.5'
            : size === 'lg'
              ? 'text-sm font-medium px-3 py-1'
              : 'text-xs font-medium px-2.5 py-0.5',
          'bg-primary/10 text-primary border-primary/20 animate-pulse',
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {normStatus === 'INITIATED' ? 'Initiated' : 'Processing'}
      </span>
    )
  }

  if (normStatus === 'FAILED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border',
          size === 'sm'
            ? 'text-xs font-medium px-2 py-0.5'
            : size === 'lg'
              ? 'text-sm font-medium px-3 py-1'
              : 'text-xs font-medium px-2.5 py-0.5',
          'bg-destructive/10 text-destructive border-destructive/20',
          className,
        )}
      >
        <AlertTriangle className="h-3 w-3" />
        Failed
      </span>
    )
  }

  if (normStatus === 'REFUNDED' || normStatus === 'CANCELLED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border',
          size === 'sm'
            ? 'text-xs font-medium px-2 py-0.5'
            : size === 'lg'
              ? 'text-sm font-medium px-3 py-1'
              : 'text-xs font-medium px-2.5 py-0.5',
          'bg-foreground/5 text-foreground/70 border-foreground/10',
          className,
        )}
      >
        <RotateCcw className="h-3 w-3" />
        {normStatus === 'REFUNDED' ? 'Refunded' : 'Cancelled'}
      </span>
    )
  }

  if (normStatus === 'SUCCESS' || normStatus === 'VERIFIED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border',
          size === 'sm'
            ? 'text-xs font-medium px-2 py-0.5'
            : size === 'lg'
              ? 'text-sm font-medium px-3 py-1'
              : 'text-xs font-medium px-2.5 py-0.5',
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          className,
        )}
      >
        <CheckCircle className="h-3 w-3" />
        {normStatus === 'SUCCESS' ? 'Success ✓' : 'Verified'}
      </span>
    )
  }

  if (normStatus === 'ALLOCATED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border',
          size === 'sm'
            ? 'text-xs font-medium px-2 py-0.5'
            : size === 'lg'
              ? 'text-sm font-medium px-3 py-1'
              : 'text-xs font-medium px-2.5 py-0.5',
          'bg-primary/10 text-primary border-primary/20',
          className,
        )}
      >
        <Banknote className="h-3 w-3" />
        Allocated
      </span>
    )
  }

  if (normStatus === 'DISBURSED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border',
          size === 'sm'
            ? 'text-xs font-medium px-2 py-0.5'
            : size === 'lg'
              ? 'text-sm font-medium px-3 py-1'
              : 'text-xs font-medium px-2.5 py-0.5',
          'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
          className,
        )}
      >
        <Truck className="h-3 w-3" />
        Disbursed
      </span>
    )
  }

  if (normStatus === 'DELIVERED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border',
          size === 'sm'
            ? 'text-xs font-medium px-2 py-0.5'
            : size === 'lg'
              ? 'text-sm font-medium px-3 py-1'
              : 'text-xs font-medium px-2.5 py-0.5',
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          className,
        )}
      >
        <CheckCircle2 className="h-3 w-3" />
        Delivered ✓
      </span>
    )
  }

  // Fallback for pending / unknown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border',
        size === 'sm'
          ? 'text-xs font-medium px-2 py-0.5'
          : size === 'lg'
            ? 'text-sm font-medium px-3 py-1'
            : 'text-xs font-medium px-2.5 py-0.5',
        'bg-foreground/5 text-foreground/70 border-foreground/10',
        className,
      )}
    >
      <Clock className="h-3 w-3" />
      {normStatus === 'PENDING' ? 'Pending' : normStatus.charAt(0) + normStatus.slice(1).toLowerCase()}
    </span>
  )
}