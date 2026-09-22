import re

with open('frontend/src/pages/DonorDashboard.tsx', 'r') as f:
    content = f.read()

# 1. Restore attestationStatus definition
content = content.replace(
    "attestationStatus: 'pending' | 'receipt_confirmed'",
    "attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed'"
)

# 2. Restore loadCampaigns useEffect
bad_load_donations = """  const loadDonations = useCallback(async () => {
    if (user?.id) {
      try {
        const allData = await apiService.donations.getByUser(user.id)
        setDonations(allData)
        setDonationsLocal(allData)
      } catch (error) {
        console.error('Failed to load donations:', error)
      } finally {
        setLoading(false)
      }
    }
  }, [user?.id, setDonations])

  useEffect(() => {
    if (campaigns.length === 0) {
      loadCampaigns()
    }
  }, [campaigns.length, loadCampaigns])"""

good_load_donations = """  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const loadDonations = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await apiService.donations.getByUser(user.id)
      setDonationsLocal(data)
      setDonations(data)
    } catch (error) {
      console.error('Failed to load donations:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id, setDonations])"""

content = content.replace(bad_load_donations, good_load_donations)

# 3. Restore summary block
bad_summary = """  const summary = useMemo(() => {
    const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0)
    const uniqueNGOs = new Set(donations.map(d => {
      const camp = campaigns.find(c => c.id === d.campaignId)
      return camp?.ngo
    }).filter(Boolean)).size
    const deliveredCount = donations.filter(d => d.status === 'delivered').length
    const successRate = donations.length ? Math.round((deliveredCount / donations.length) * 100) : 0

    return {
      totalDonated,
      uniqueNGOs,
      successRate,
      activeProjects: fundedCampaigns.length
    }
  }, [donations, campaigns, fundedCampaigns.length])

  const handleDonateComplete = () => {
    setDialogOpen(false)
    loadDonations()
  }

  const handleViewAttestation = (donationId: string) => {
    const donation = donations.find(d => d.id === donationId)
    if (donation) {
      setAttestationModalData({
        donationId,
        attestationStatus: donation.status === 'delivered' || donation.status === 'disbursed' ? 'receipt_confirmed' : 'pending'
      })
    }
  }"""

good_summary = """  const summary = useMemo(() => {
    const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0)
    const uniqueNGOs = new Set(donations.map(d => {
       const camp = campaigns.find(c => c.id === d.campaignId)
       return camp?.ngo || ''
    })).size
    const confirmedDonations = donations.filter(d =>
      d.status === 'delivered' || d.status === 'disbursed'
    ).length
    const successRate = donations.length > 0 ? (confirmedDonations / donations.length) * 100 : 0

    return {
      totalDonated,
      uniqueNGOs,
      successRate: Math.round(successRate)
    }
  }, [donations, campaigns])

  const handleViewAttestation = (donationId: string) => {
    const donation = donations.find(d => d.id === donationId)
    if (!donation) return
    let attestationStatus: 'pending' | 'receipt_confirmed' | 'delivery_confirmed' = 'pending'
    if (donation.status === 'delivered' || donation.status === 'disbursed') {
      attestationStatus = 'receipt_confirmed'
    }
    setAttestationModalData({ donationId, attestationStatus })
  }"""

content = content.replace(bad_summary, good_summary)

with open('frontend/src/pages/DonorDashboard.tsx', 'w') as f:
    f.write(content)

