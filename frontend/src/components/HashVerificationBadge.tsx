import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HashVerificationBadgeProps {
  hashStatus: 'pending' | 'verified' | 'failed' | 'loading';
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export default function HashVerificationBadge({
  hashStatus,
  onClick,
  size = 'md',
}: HashVerificationBadgeProps) {
  const sizeConfig: Record<string, { width: number; height: number }> = {
    sm: { width: 16, height: 16 },
    md: { width: 20, height: 20 },
    lg: { width: 24, height: 24 },
  }

  const { width, height } = sizeConfig[size]

  const getIconAndColor = () => {
    switch (hashStatus) {
      case 'pending':
        return {
          icon: <RefreshCw className="h-4 w-4" />,
          bg: 'bg-blue-50',
          color: 'text-blue-500',
          text: 'Hash Verification Pending'
        }
      case 'verified':
        return {
          icon: <CheckCircle2 className="h-4 w-4" />,
          bg: 'bg-emerald-50',
          color: 'text-emerald-500',
          text: 'Hash Verified'
        }
      case 'failed':
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          bg: 'bg-destructive/50',
          color: 'text-destructive',
          text: 'Hash Verification Failed'
        }
      case 'loading':
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          bg: 'bg-muted/50',
          color: 'text-muted-foreground',
          text: 'Verifying Hash...'
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