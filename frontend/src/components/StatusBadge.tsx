// StatusBadge – colour-coded tag for DonationStatus values
import type { DonationStatus } from '@/types'
import { cn, STATUS_COLORS } from '@/lib/utils'
import { CheckCircle2, Clock, Banknote, Truck } from 'lucide-react'

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

interface Props {
    status: DonationStatus
    className?: string
}

export function StatusBadge({ status, className }: Props) {
    const { icon, label, color } = getStatusConfig(status)

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                color,
                className,
            )}
        >
            {icon}
            {label}
        </span>
    )
}
