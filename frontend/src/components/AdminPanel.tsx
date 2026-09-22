// AdminPanel – Simulated admin view for platform oversight
import { Users, DollarSign, Shield, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

export function AdminPanel({ className }: Props) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDonations: 0,
    totalAmount: 0,
    activeCampaigns: 0
  })

  // In a real app, this would fetch data from an admin API
  // For demo, we'll simulate loading stats
  // useEffect(() => {
  //   // Simulate API call
  //   setTimeout(() => {
  //     setStats({
  //       totalUsers: 1240,
  //       totalDonations: 892,
  //       totalAmount: 284750,
  //       activeCampaigns: 5
  //     })
  //   }, 1000)
  // }, [])

  return (
    <Card className={cn('glass p-6', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Platform Overview</h3>
          <Button variant="outline" size="sm" onClick={() => {
            // Refresh stats
            setStats({
              totalUsers: Math.floor(Math.random() * 200) + 1200,
              totalDonations: Math.floor(Math.random() * 100) + 800,
              totalAmount: Math.floor(Math.random() * 50000) + 250000,
              activeCampaigns: Math.floor(Math.random() * 5) + 3
            })
          }}>
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <Users className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Total Users</span>
            </div>
            <p className="text-3xl font-bold">{stats.totalUsers.toLocaleString()}</p>
          </Card>

          <Card className="p-5 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Total Donations</span>
            </div>
            <p className="text-3xl font-bold">{stats.totalDonations.toLocaleString()}</p>
          </Card>

          <Card className="p-5 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Total Amount (INR)</span>
            </div>
            <p className="text-3xl font-bold">₹{stats.totalAmount.toLocaleString()}</p>
          </Card>

          <Card className="p-5 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Active Campaigns</span>
            </div>
            <p className="text-3xl font-bold">{stats.activeCampaigns}</p>
          </Card>
        </div>

        <div className="border-t border-border/30 pt-6">
          <h4 className="font-semibold mb-4">System Status</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Blockchain Connection</span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">API Availability</span>
              <span className="px-3 py-1 rounded-full text-xs font-muted-foreground bg-muted/20">
                99.9% Uptime
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Last Backup</span>
              <span className="text-sm text-muted-foreground">
                2 hours ago
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}