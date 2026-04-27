// StatusBadge – colour-coded tag for DonationStatus values
import type { DonationStatus } from '@/types'
import { cn, STATUS_COLORS } from '@/lib/utils'
import { CheckCircle2, Clock, Banknote, Truck } from 'lucide-react'

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

interface Props {
    status: DonationStatus
    className?: string
}

export function StatusBadge({ status, className }: Props) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                STATUS_COLORS[status],
                className,
            )}
        >
            {ICONS[status]}
            {LABELS[status]}
        </span>
    )
}
