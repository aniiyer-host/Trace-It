// StatusBadge – Enhanced colour-coded tag with more variants and animations
import type { DonationStatus } from '@/types'
import { cn, STATUS_COLORS } from '@/lib/utils'
import { CheckCircle2, Clock, Banknote, Truck, Loader2, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react'

// Validate status to prevent potential injection risks
function getStatusConfig(status: DonationStatus) {
    // Validate that status is one of the expected values
    const validStatuses: DonationStatus[] = ['pending', 'allocated', 'disbursed', 'delivered']
    if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`)
    }

    const ICONS: Record<DonationStatus, React.ReactNode> = {
        pending: <Clock className="h-3 w-3" />,
        allocated: <Banknote className="h-3 w-3" />,
        disbursed: <Truck className="h-3 w-3" />,
        delivered: <CheckCircle2 className="h-3 w-3" />,
    }

    const LABELS: Record<DonationStatus, string> = {
        pending: 'Pending',
        allocated: 'Allocated',
        disbursed: 'Disbursed',
        delivered: 'Delivered ✓',
    }

    return {
        status,
        // eslint-disable-next-line security/detect-object-injection
        icon: ICONS[status],
        // eslint-disable-next-line security/detect-object-injection
        label: LABELS[status],
        // eslint-disable-next-line security/detect-object-injection
        color: STATUS_COLORS[status],
    }
}

// Extended status types for demo purposes
export type ExtendedStatus = DonationStatus | 'processing' | 'failed' | 'verified' | 'cancelled'

interface ExtendedStatusConfig {
    status: ExtendedStatus
    icon: React.ReactNode
    label: string
    color: string
}

// Extended status colors
export const EXTENDED_STATUS_COLORS: Record<ExtendedStatus, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    allocated: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    disbursed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    processing: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 animate-pulse',
    failed: 'bg-red-500/15 text-red-400 border-red-500/30',
    verified: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/30'
}

interface Props {
    status: DonationStatus | ExtendedStatus
    className?: string
    size?: 'default' | 'sm' | 'lg'
}

export function StatusBadge({ status, className, size = 'default' }: Props) {
    // Handle extended status types
    const config: ExtendedStatusConfig =
        status === 'processing'
            ? {
                status: 'processing',
                icon: <Loader2 className="h-3 w-3 animate-spin" />,
                label: 'Processing',
                color: EXTENDED_STATUS_COLORS.processing
              }
            : status === 'failed'
                ? {
                    status: 'failed',
                    icon: <AlertTriangle className="h-3 w-3" />,
                    label: 'Failed',
                    color: EXTENDED_STATUS_COLORS.failed
                  }
                : status === 'verified'
                    ? {
                        status: 'verified',
                        icon: <CheckCircle className="h-3 w-3" />,
                        label: 'Verified',
                        color: EXTENDED_STATUS_COLORS.verified
                      }
                    : status === 'cancelled'
                        ? {
                            status: 'cancelled',
                            icon: <HelpCircle className="h-3 w-3" />,
                            label: 'Cancelled',
                            color: EXTENDED_STATUS_COLORS.cancelled
                          }
                        : getStatusConfig(status as DonationStatus)

    const sizeClasses: Record<string, string> = {
        sm: 'text-xs px-2 py-0.5',
        default: 'text-xs font-medium px-2.5 py-0.5',
        lg: 'text-sm px-3 py-1'
    }

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border',
                sizeClasses[size],
                config.color,
                className,
            )}
        >
            {config.icon}
            {config.label}
        </span>
    )
}