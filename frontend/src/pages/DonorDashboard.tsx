// DonorDashboard – Attestation-focused donor dashboard emphasizing NGO confirmation
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import DonationHistoryTable from '@/components/DonationHistoryTable'
import AttestationDetailsModal from '@/components/AttestationDetailsModal'
import { DonateDialog } from '@/components/DonateDialog'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { useDonationStore } from '@/store/donationStore'
import { useAuthStore } from '@/store/authStore'
import { fetchDonationsByUser } from '@/services/mockApi'
import type { Campaign, Donation } from '@/types'
import { DonationCard } from '@/components/DonationCard'

export default function DonorDashboard() {
  const [params] = useSearchParams()
  const { campaigns, loadCampaigns, setDonations, campaignsLoading } = useDonationStore()
  const { user, setUser } = useAuthStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [donations, setDonationsLocal] = useState<Donation[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [attestationModalData, setAttestationModalData] = useState<{
    donationId: string
    attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed'
  } | null>(null)

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
    if (!user?.id) return
    try {
      const data = await fetchDonationsByUser(user.id)
      setDonationsLocal(data)
      setDonations(data) // Also update the store
    } catch (error) {
      console.error('Failed to load donations:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id, setDonations])

  useEffect(() => {
    if (user?.id) {
      setLoading(true)
      loadDonations()
    }
  }, [user?.id, loadDonations])

  // Calculate summary statistics focused on attestation
  const summary = useMemo(() => {
    const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0)
    const totalDonations = donations.length
    const confirmedDonations = donations.filter(d =>
      d.status === 'delivered' || d.status === 'disbursed'
    ).length
    const successRate = totalDonations > 0 ? (confirmedDonations / totalDonations) * 100 : 0

    return {
      totalDonated,
      totalDonations,
      confirmedDonations,
      successRate: Math.round(successRate)
    }
  }, [donations])

  const handleDonate = (campaign: Campaign) => {
    setSelectedCampaign(campaign)
    setDialogOpen(true)
  }

  const handleViewAttestation = (donationId: string) => {
    const donation = donations.find(d => d.id === donationId)
    if (!donation) return

    // Determine attestation status based on donation status
    let attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed' = 'pending'
    if (donation.status === 'delivered' || donation.status === 'disbursed') {
      attestationStatus = 'receipt_confirmed'
    }

    setAttestationModalData({
      donationId,
      attestationStatus
    })
  }

  const handleVerifyIntegrity = (donationId: string) => {
    alert(`Verifying integrity for donation ${donationId}\n\nIn a real implementation, this would:\n1. Compute hash from donation data\n2. Compare with on-chain hash\n3. Show match/mismatch result`)
  }

  const handleCloseAttestationModal = () => {
    setAttestationModalData(null)
  }

  return (
    <div className="space-y-8 pb-16 animate-fade-in">
      {/* User Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* User Info */}
        <div className="flex-1 md:max-w-xl">
          {user ? (
            <Card className="glass p-5">
              <CardHeader className="flex flex-col space-y-2">
                <CardTitle className="flex items-center gap-3">
                  <span className="h-5 w-5 text-primary">
                    {/* User Avatar Placeholder */}
                    <span className="flex h-5 w-5 items-center justify-center bg-primary/20 text-primary rounded-full">
                      {user.email.charAt(0).toUpperCase()}
                    </span>
                  </span>
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
                    alert('Profile page coming soon')
                  }}
                >
                  Profile
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setUser(null)
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
                  alert('Please use the sign in button in the header')
                }}
              >
                Sign In
              </Button>
            </Card>
          )}
        </div>

        {/* Impact Summary */}
        <div className="flex-1 md:max-w-xl">
          <Card className="glass p-5">
            <CardHeader className="flex flex-col space-y-2">
              <CardTitle className="flex items-center gap-3">
                <span className="h-5 w-5 text-primary">
                  <span className="flex h-5 w-5 items-center justify-center bg-primary/20 text-primary rounded-full">
                    📊
                  </span>
                </span>
                <span className="text-xl font-semibold">Impact Summary</span>
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Your donations verified through NGO attestation
              </CardDescription>
            </CardHeader>
            <div className="grid gap-4 mt-4 md:grid-cols-2">
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">Total Donated</p>
                <p className="text-2xl font-bold">₹{summary.totalDonated.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">Donation Count</p>
                <p className="text-2xl font-bold">{summary.totalDonations}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">NGO Confirmed</p>
                <p className="text-2xl font-bold">{summary.confirmedDonations}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">Verification Rate</p>
                <p className="text-2xl font-bold">{summary.successRate}%</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Campaign Selector + Milestone Tracker */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Campaign Cards */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Active Campaigns</h2>
          {campaignsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <LoadingSkeleton
                  key={i}
                  className="glass rounded-xl h-48"
                  width={100}
                  height={100}
                />
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
                  <span className="h-4 w-4 text-primary">
                    <span className="flex h-4 w-4 items-center justify-center bg-primary/20 text-primary rounded-full">
                      📍
                    </span>
                  </span>
                  <span>{selectedCampaign.title}</span>
                </CardTitle>
                <CardDescription className="text-muted-foreground text-sm">
                  {selectedCampaign.ngo} • {selectedCampaign.category}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* MilestoneTimeline would go here - keeping existing component */}
                <div className="mt-4 p-4 bg-muted/5 rounded">
                  <h3 className="font-semibold mb-3">Milestone Progress</h3>
                  <p className="text-muted-foreground">
                    Milestone tracking component would be implemented here.
                    For now, showing placeholder.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass p-8 text-center">
              <span className="h-6 w-6 text-muted-foreground mx-auto mb-4">
                <span className="flex h-6 w-6 items-center justify-center bg-muted/20 text-muted-foreground rounded-full">
                  📍
                </span>
              </span>
              <h3 className="font-semibold mb-3">Select a Campaign</h3>
              <p className="text-muted-foreground">
                Choose a campaign from the list to view its milestone progress and impact tracking.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Donation History Table */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <h2 className="text-2xl font-bold">My Donation History</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true)
                loadDonations().finally(() => setLoading(false))
              }}
              className={loading ? 'opacity-50' : ''}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="h-3 w-3 mr-2 animate-spin" aria-label="Loading"></span>
                  Refreshing...
                </>
              ) : (
                'Refresh'
              )}
            </Button>
          </div>
        </div>

        <DonationHistoryTable
          donations={donations}
          loading={loading}
          onRefresh={() => {
            setLoading(true)
            loadDonations().finally(() => setLoading(false))
          }}
          onViewAttestation={handleViewAttestation}
          onVerifyIntegrity={handleVerifyIntegrity}
        />
      </div>

      {/* Donation Dialog */}
      <DonateDialog
        campaign={selectedCampaign}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      {/* Attestation Details Modal */}
      {attestationModalData && (
        <AttestationDetailsModal
          donationId={attestationModalData.donationId}
          attestationStatus={attestationModalData.attestationStatus}
          onClose={handleCloseAttestationModal}
        />
      )}
    </div>
  )
}