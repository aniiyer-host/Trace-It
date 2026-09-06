// DonorDashboard – Enhanced donor dashboard with wallet overview, donation history, and impact tracking
import { useState, useEffect, useCallback, useMemo } from 'react'
import { ExternalLink, Loader2, DollarSign, Users, TrendingUp, MapPin, Wallet, Wallet2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table'
import { StatusBadge } from '@/components/StatusBadge'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { DonationCard } from '@/components/DonationCard'
import { DonateDialog } from '@/components/DonateDialog'
import { useDonationStore } from '@/store/donationStore'
import { useUIStore } from '@/store/uiStore'
import { fetchDonationsByWallet } from '@/services/mockApi'
import { formatUSD, shortenHash } from '@/lib/utils'
import type { Campaign, Donation } from '@/types'

export default function DonorDashboard() {
  const [params] = useSearchParams()
  const { campaigns, loadCampaigns, setDonations, campaignsLoading } = useDonationStore()
  const { wallet, user, connectWallet, disconnectWallet, addNotification } = useUIStore()
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [donations, setDonationsLocal] = useState<Donation[]>([])

  // Update selectedCampaign when URL param changes
  useEffect(() => {
    const id = params.get('campaign')
    let campaign: Campaign | null = null
    if (id && campaigns.length) {
      campaign = campaigns.find((x) => x.id === id) ?? null
    }
    setSelectedCampaign(campaign)
  }, [params, campaigns])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const loadDonations = useCallback(async () => {
    if (!wallet.publicKey) return
    setLoading(true)
    try {
      const data = await fetchDonationsByWallet(wallet.publicKey)
      setDonationsLocal(data)
      setDonations(data) // Also update the store
    } catch (error) {
      console.error('Failed to load donations:', error)
      addNotification({
        title: 'Failed to load donations',
        description: 'Please try again later',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [wallet.publicKey, setDonations, addNotification])

  useEffect(() => {
    if (wallet.publicKey) {
      loadDonations()
    }
  }, [wallet.publicKey, loadDonations])

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0)
    const totalDonations = donations.length
    const successfulDonations = donations.filter(d => d.status === 'delivered').length
    const successRate = totalDonations > 0 ? (successfulDonations / totalDonations) * 100 : 0

    return {
      totalDonated,
      totalDonations,
      successfulDonations,
      successRate: Math.round(successRate)
    }
  }, [donations])

  const handleWalletConnect = async () => {
    try {
      await connectWallet()
      // Connection success toast is handled in the store
    } catch (error) {
      addNotification({
        title: 'Wallet connection failed',
        description: 'Please try again or use a different wallet',
        variant: 'destructive'
      })
    }
  }

  const handleWalletDisconnect = async () => {
    try {
      await disconnectWallet()
      // Clear donations when wallet is disconnected
      setDonationsLocal([])
      setDonations([])
      addNotification({
        title: 'Wallet disconnected',
        description: 'Your donation history has been cleared',
        variant: 'default'
      })
    } catch (error) {
      addNotification({
        title: 'Disconnection failed',
        description: 'Please try again',
        variant: 'destructive'
      })
    }
  }

  const handleDonate = (campaign: Campaign) => {
    setSelectedCampaign(campaign)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-8 pb-16 animate-fade-in">
      {/* Wallet and User Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* User Info */}
        <div className="flex-1 md:max-w-xl">
          {user ? (
            <Card className="glass p-5">
              <CardHeader className="flex flex-col space-y-2">
                <CardTitle className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-xl font-semibold">{user.email.split('@')[0]}</span>
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {user.email}
                </CardDescription>
              </CardHeader>
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // In a real app, this would navigate to profile page
                    addNotification({
                      title: 'Profile',
                      description: 'Profile page coming soon',
                      variant: 'default'
                    })
                  }}
                >
                  Profile
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    // Clear UI store on logout
                    const uiStore = useUIStore.getState()
                    uiStore.logout()
                    uiStore.resetUIState()
                  }}
                >
                  Sign Out
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="glass p-5 text-center">
              <h3 className="font-semibold mb-3">Welcome, Donor</h3>
              <p className="text-muted-foreground mb-4">
                Sign in to track your donations, view your impact, and manage your giving journey.
              </p>
              <Button
                onClick={() => {
                  // In a real app, this would open auth dialog
                  addNotification({
                    title: 'Sign In',
                    description: 'Please use the sign in button in the header',
                    variant: 'default'
                  })
                }}
              >
                Sign In
              </Button>
            </Card>
          )}
        </div>

        {/* Wallet Overview */}
        <div className="flex-1 md:max-w-xl">
          <Card className="glass p-5">
            <CardHeader className="flex flex-col space-y-2">
              <CardTitle className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-primary" />
                <span className="text-xl font-semibold">Wallet Overview</span>
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Track your SOL balance and transaction history
              </CardDescription>
            </CardHeader>

            {!wallet.connected ? (
              <div className="mt-6 flex flex-col items-center gap-4">
                <p className="text-muted-foreground text-sm">
                  Connect your Phantom wallet to view your balance and transaction history.
                </p>
                <Button
                  onClick={handleWalletConnect}
                  className="w-full md:w-auto"
                >
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 text-2xl">
                  <DollarSign className="h-6 w-6 text-primary" />
                  <div className="space-y-1">
                    <p className="font-semibold">{wallet.balance?.toFixed(3) ?? '0.000'} SOL</p>
                    <p className="text-xs text-muted-foreground">
                      {(wallet.balance ?? 0) * 150} ≈ ₹{((wallet.balance ?? 0) * 150).toLocaleString()}
                      (approx. at ₹150/SOL)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/5 rounded-md">
                    <p className="text-xs text-muted-foreground">Received</p>
                    <p className="font-semibold text-xs">0.5 SOL</p>
                  </div>
                  <div className="p-3 bg-muted/5 rounded-md">
                    <p className="text-xs text-muted-foreground">Sent</p>
                    <p className="font-semibold text-xs">0.2 SOL</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWalletDisconnect}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Impact Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass p-6">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-xl">Total Donated</h3>
          </div>
          <p className="text-3xl font-bold">₹{summary.totalDonated.toLocaleString()}</p>
          <p className="text-muted-foreground mt-2">
            Across {summary.totalDonations} donations
          </p>
        </Card>

        <Card className="glass p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-xl">Donation Count</h3>
          </div>
          <p className="text-3xl font-bold">{summary.totalDonations}</p>
          <p className="text-muted-foreground mt-2">
            {summary.successfulDonations} successful
          </p>
        </Card>

        <Card className="glass p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-xl">Success Rate</h3>
          </div>
          <p className="text-3xl font-bold">{summary.successRate}%</p>
          <p className="text-muted-foreground mt-2">
            {summary.successfulDonations}/{summary.totalDonations} delivered
          </p>
        </Card>

        <Card className="glass p-6">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-xl">Active Campaigns</h3>
          </div>
          <p className="text-3xl font-bold">{campaigns.length}</p>
          <p className="text-muted-foreground mt-2">
            Currently fundraising
          </p>
        </Card>
      </div>

      {/* Tabs for Donation Views */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <h2 className="text-2xl font-bold">My Donation History</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadDonations}
              className={loading ? 'opacity-50' : ''}
              disabled={loading || !wallet.connected}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Refreshing...
                </>
              ) : (
                'Refresh'
              )}
            </Button>
          </div>
        </div>

        {!wallet.connected ? (
          <Card className="glass p-8 text-center">
            <Wallet2 className="h-8 w-8 text-primary mx-auto mb-4" />
            <h3 className="font-semibold mb-3">Connect Wallet to View Donations</h3>
            <p className="text-muted-foreground">
              Your donation history and on-chain activity will appear here once you connect your wallet.
            </p>
            <Button
              onClick={handleWalletConnect}
              className="mt-6"
            >
              Connect Wallet
            </Button>
          </Card>
        ) : donations.length === 0 ? (
          <Card className="glass p-8 text-center">
            <TrendingUp className="h-8 w-8 text-primary mx-auto mb-4" />
            <h3 className="font-semibold mb-3">No Donations Yet</h3>
            <p className="text-muted-foreground">
              Start your giving journey by donating to one of our active campaigns.
            </p>
            <Button
              onClick={() => {
                // Navigate to home to browse campaigns
                // In a real app, we'd use navigate('/')
                addNotification({
                  title: 'Browse Campaigns',
                  description: 'Please go to the Home page to see active campaigns',
                  variant: 'default'
                })
              }}
              className="mt-6"
            >
              Browse Campaigns
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <Table className="w-full">
              <TableCaption className="text-left text-sm font-medium text-muted-foreground mb-2">
                Showing {donations.length} donation{donations.length === 1 ? '' : 's'}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Campaign</TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">Method</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Date</TableHead>
                  <TableHead className="text-center">Tx Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donations.map((donation) => (
                  <TableRow key={donation.id}>
                    <TableCell className="font-medium text-left max-w-xs truncate">
                      {donation.campaignTitle}
                    </TableCell>
                    <TableCell className="text-center text-font-medium">
                      ₹{formatUSD(donation.amount)}
                    </TableCell>
                    <TableCell className="text-center text-xs uppercase">
                      {donation.paymentMethod.toUpperCase()}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={donation.status} />
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {new Date(donation.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      <a
                        href={donation.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs"
                      >
                        {shortenHash(donation.txHash)}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Campaign Selector + Milestone Tracker */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Campaign Cards */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Active Campaigns</h2>
          {campaignsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass rounded-xl h-48 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <DonationCard
                  key={campaign.id}
                  campaign={campaign}
                  compact
                  onDonate={(camp) => handleDonate(camp)}
                  onView={(camp) => {
                    setSelectedCampaign(camp)
                  }}
                  isSelected={selectedCampaign?.id === campaign.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Milestone Timeline */}
        <div className="lg:col-span-2">
          {selectedCampaign ? (
            <Card className="glass">
              <CardHeader className="flex flex-col items-start gap-2">
                <CardTitle className="text-xl font-semibold flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>{selectedCampaign.title}</span>
                </CardTitle>
                <CardDescription className="text-muted-foreground text-sm">
                  {selectedCampaign.ngo} • {selectedCampaign.category}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MilestoneTimeline
                  milestones={selectedCampaign.milestones}
                  className="mt-4"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="glass p-8 text-center">
              <MapPin className="h-6 w-6 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-3">Select a Campaign</h3>
              <p className="text-muted-foreground">
                Choose a campaign from the list to view its milestone progress and impact tracking.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Donation Dialog */}
      <DonateDialog
        campaign={selectedCampaign}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}