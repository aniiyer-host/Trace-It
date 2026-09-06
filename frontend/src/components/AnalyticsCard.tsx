// AnalyticsCard – Display key metrics and statistics
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  description?: string
  variant?: 'primary' | 'secondary' | 'success' | 'warning'
  trend?: {
    value: number | string
    label: string
    isPositive: boolean
  }
}

export function AnalyticsCard({
  title,
  value,
  icon: Icon,
  description,
  variant = 'primary',
  trend
}: Props) {
  const variantColors: Record<string, string> = {
    primary: 'text-primary border-primary/20',
    secondary: 'text-muted-foreground border-muted/20',
    success: 'text-emerald-400 border-emerald-500/20',
    warning: 'text-amber-400 border-amber-500/20'
  }

  return (
    <Card className={cn('glass p-6 hover:border-primary/40 transition-colors border', variantColors[variant])}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon className={cn('h-5 w-5', variantColors[variant].split(' ')[0])} />
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">{title}</h3>
            {description && <p className={description.length > 0 ? 'text-xs text-muted-foreground' : 'hidden'}>
              {description}
            </p>}
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-2 text-xs">
            <span className={trend.isPositive ? 'text-emerald-500' : 'text-destructive-500'}>
              {trend.isPositive ? '↑' : '↓'}
            </span>
            <span>{trend.value}</span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </div>

      <div className="text-3xl font-bold">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {trend && (
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Updated just now</span>
        </div>
      )}
    </Card>
  )
}