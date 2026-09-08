import { Clock, CheckCircle2, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AttestationVerificationBadgeProps {
  attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed' | 'loading';
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export default function AttestationVerificationBadge({
  attestationStatus,
  onClick,
  size = 'md',
}: AttestationVerificationBadgeProps) {
  const sizeConfig: Record<string, { width: number; height: number }> = {
    sm: { width: 16, height: 16 },
    md: { width: 20, height: 20 },
    lg: { width: 24, height: 24 },
  }

  const { width, height } = sizeConfig[size]

  const getIconAndColor = () => {
    switch (attestationStatus) {
      case 'pending':
        return {
          icon: <Clock className="h-4 w-4" />,
          bg: 'bg-yellow-50',
          color: 'text-yellow-500',
          text: 'Pending NGO Confirmation'
        }
      case 'receipt_confirmed':
        return {
          icon: (
            <>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              <Shield className="h-4 w-4" />
            </>
          ),
          bg: 'bg-emerald-50',
          color: 'text-emerald-500',
          text: 'NGO Confirmed Receipt'
        }
      case 'delivery_confirmed':
        return {
          icon: (
            <>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              <Shield className="h-4 w-4" />
            </>
          ),
          bg: 'bg-emerald-50',
          color: 'text-emerald-500',
          text: 'Delivery Confirmed'
        }
      case 'loading':
        return {
          icon: <Clock className="h-4 w-4 animate-spin" />,
          bg: 'bg-muted/50',
          color: 'text-muted-foreground',
          text: 'Verifying...'
        }
    }
  }

  const { icon, bg, color, text } = getIconAndColor()

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium',
        bg,
        color,
        'cursor-pointer hover:bg-muted/50',
        onClick && 'hover:underline'
      )}
      title={text}
      role="button"
      tabIndex={onClick ? 0 : -1}
    >
      <div className={`flex h-${height} w-${width} items-center justify-center`}>
        {icon}
      </div>
      <span>{text}</span>
    </div>
  )
}