// ActivityFeed – Show recent platform activities
import { Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  activities: Array<{
    id: string
    title: string
    description: string
    timeAgo: string
    status?: string
    statusColor?: string
  }>
  className?: string
}

// Helper function to format time ago
function formatTimeAgo(date: string): string {
  const now = new Date()
  const posted = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - posted.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`

  return posted.toLocaleDateString()
}

export function ActivityFeed({ activities, className }: Props) {
  return (
    <Card className={cn('glass p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Recent Activity</h3>
        <Button variant="outline" size="sm" onClick={() => {
          // In a real app, this would navigate to a full activity log
        }}>
          View All
        </Button>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="h-6 w-6 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => {
            const timeAgo = formatTimeAgo(activity.timeAgo)
            return (
              <div key={activity.id} className="flex items-start gap-4 py-3 border-b border-border/50 last:border-b-0">
                <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="font-medium">{activity.title}</h4>
                  <p className="text-sm text-muted-foreground">{activity.description}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{timeAgo}</span>
                    {activity.status && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activity.statusColor}`}>
                        {activity.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          )}
        </div>
      )}
    </Card>
  )
}