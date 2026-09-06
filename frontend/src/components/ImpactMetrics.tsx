// ImpactMetrics – Show platform-wide impact statistics
import { Card } from '@/components/ui/card'
import { DollarSign, Users, MapPin, TrendingUp } from 'lucide-react'

interface Props {
  className?: string
}

export function ImpactMetrics({ className }: Props) {
  // In a real app, these would come from an API
  const metrics = [
    {
      icon: DollarSign,
      title: "Total Raised",
      value: "₹2,84,750",
      subtitle: "Donated to date",
      trend: { value: "+12.5%", label: "this month", isPositive: true }
    },
    {
      icon: Users,
      title: "Active Donors",
      value: "1,240",
      subtitle: "Unique contributors",
      trend: { value: "+8.2%", label: "this month", isPositive: true }
    },
    {
      icon: MapPin,
      title: "Campaigns Funded",
      value: "47",
      subtitle: "Successfully completed",
      trend: { value: "+5", label: "this quarter", isPositive: true }
    },
    {
      icon: TrendingUp,
      title: "Milestones Tracked",
      value: "156",
      subtitle: "On-chain verifications",
      trend: { value: "+23%", label: "this month", isPositive: true }
    }
  ]

  return (
    <div className={className}>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <Card key={index} className="glass p-6 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <metric.icon className={`h-5 w-5 text-primary`} />
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg">{metric.title}</h3>
                  <p className="text-sm text-muted-foreground">{metric.subtitle}</p>
                </div>
              </div>
              {metric.trend && (
                <div className="flex items-center gap-2 text-xs">
                  <span className={metric.trend.isPositive ? 'text-emerald-500' : 'text-destructive-500'}>
                    {metric.trend.isPositive ? '↑' : '↓'}
                  </span>
                  <span>{metric.trend.value}</span>
                  <span className="text-muted-foreground">{metric.trend.label}</span>
                </div>
              )}
            </div>

            <div className="text-2xl font-bold">
              {metric.value}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}