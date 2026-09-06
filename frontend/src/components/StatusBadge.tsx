// StatusBadge – Enhanced colour-coded tag with more variants and animations
import type { DonationStatus, ExtendedStatus } from '@/types'
import { cn } from '@/lib/utils'
import { CheckCircle2, Clock, Banknote, Truck, Loader2, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react'

interface Props {
    status: DonationStatus | ExtendedStatus
    className?: string
    size?: 'default' | 'sm' | 'lg'
}

export function StatusBadge({ status, className, size = 'default' }: Props) {
    // Handle extended status types
    if (status === 'processing') {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border',
                    size === 'sm' ? 'text-xs font-medium px-2 py-0.5' : size === 'lg' ? 'text-sm font-medium px-3 py-1' : 'text-xs font-medium px-2.5 py-0.5',
                    'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 animate-pulse',
                    className,
                )}
            >
                <Loader2 className="h-3 w-3 animate-spin" />
                Processing
            </span>
        )
    }

    if (status === 'failed') {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border',
                    size === 'sm' ? 'text-xs font-medium px-2 py-0.5' : size === 'lg' ? 'text-sm font-medium px-3 py-1' : 'text-xs font-medium px-2.5 py-0.5',
                    'bg-red-500/15 text-red-400 border-red-500/30',
                    className,
                )}
            >
                <AlertTriangle className="h-3 w-3" />
                Failed
            </span>
        )
    }

    if (status === 'verified') {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border',
                    size === 'sm' ? 'text-xs font-medium px-2 py-0.5' : size === 'lg' ? 'text-sm font-medium px-3 py-1' : 'text-xs font-medium px-2.5 py-0.5',
                    'bg-teal-500/15 text-teal-400 border-teal-500/30',
                    className,
                )}
            >
                <CheckCircle className="h-3 w-3" />
                Verified
            </span>
        )
    }

    if (status === 'cancelled') {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border',
                    size === 'sm' ? 'text-xs font-medium px-2 py-0.5' : size === 'lg' ? 'text-sm font-medium px-3 py-1' : 'text-xs font-medium px-2.5 py-0.5',
                    'bg-gray-500/15 text-gray-400 border-gray-500/30',
                    className,
                )}
            >
                <HelpCircle className="h-3 w-3" />
                Cancelled
            </span>
        )
    }

    // Validate status to prevent potential injection risks
    const validStatuses: DonationStatus[] = ['pending', 'allocated', 'disbursed', 'delivered']
    if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`)
    }

    // Using Maps to avoid security/detect-object-injection warnings
    const ICONS_MAP = new Map<DonationStatus, React.ReactNode>([
        ['pending', <Clock className="h-3 w-3" />],
        ['allocated', <Banknote className="h-3 w-3" />],
        ['disbursed', <Truck className="h-3 w-3" />],
        ['delivered', <CheckCircle2 className="h-3 w-3" />],
    ])

    const LABELS_MAP = new Map<DonationStatus, string>([
        ['pending', 'Pending'],
        ['allocated', 'Allocated'],
        ['disbursed', 'Disbursed'],
        ['delivered', 'Delivered ✓'],
    ])

    const STATUS_COLORS_MAP = new Map<DonationStatus, string>([
        ['pending', 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'],
        ['allocated', 'bg-blue-500/15 text-blue-400 border-blue-500/30'],
        ['disbursed', 'bg-purple-500/15 text-purple-400 border-purple-500/30'],
        ['delivered', 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'],
    ])

    const icon = ICONS_MAP.get(status) ?? <Clock className="h-3 w-3" />
    const label = LABELS_MAP.get(status) ?? 'Pending'
    const color = STATUS_COLORS_MAP.get(status) ?? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'

    // Since we validated status, these should not be undefined
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border',
                size === 'sm' ? 'text-xs font-medium px-2 py-0.5' : size === 'lg' ? 'text-sm font-medium px-3 py-1' : 'text-xs font-medium px-2.5 py-0.5',
                color,
                className,
            )}
        >
            {icon}
            {label}
        </span>
    )
}