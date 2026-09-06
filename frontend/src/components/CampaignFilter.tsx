// CampaignFilter – Filter campaigns by category, status, etc.
import { useState } from 'react'
import { Search } from 'lucide-react'
import type { Campaign } from '@/types'

interface Props {
  campaigns: Campaign[]
  onFilterChange: (filters: { search: string; category: string | null; status: string | null; sortBy: string }) => void
}

export function CampaignFilter({ campaigns, onFilterChange }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null) // 'funded', 'progress', etc.
  const [sortBy, setSortBy] = useState<string>('newest')

  const filteredCampaigns = campaigns.filter(campaign => {
    // Search filter
    if (search && !campaign.title.toLowerCase().includes(search.toLowerCase()) && !campaign.ngo.toLowerCase().includes(search.toLowerCase())) {
      return false
    }

    // Category filter
    if (category && campaign.category !== category) {
      return false
    }

    // Status filter
    if (statusFilter === 'funded' && (campaign.raisedAmount / campaign.targetAmount) < 1) {
      return false
    }
    if (statusFilter === 'progress' && (campaign.raisedAmount / campaign.targetAmount) >= 1) {
      return false
    }

    return true
  }).sort((a, b) => {
    if (sortBy === 'newest') return b.id.localeCompare(a.id)
    if (sortBy === 'alphabetical') return a.title.localeCompare(b.title)
    if (sortBy === 'progress') {
      const progressA = a.raisedAmount / a.targetAmount
      const progressB = b.raisedAmount / b.targetAmount
      return progressB - progressA
    }
    return 0
  })

  const handleFilterChange = () => {
    onFilterChange({ search, category, status: statusFilter ?? null, sortBy })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium mb-2 block">Search Campaigns</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by campaign name or NGO..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                handleFilterChange()
              }}
              className="w-full pl-10 pr-4 py-2 rounded-md border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 md:max-w-xs space-x-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <select
                value={category ?? ''}
                onChange={(e) => {
                  setCategory(e.target.value || null)
                  handleFilterChange()
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-primary focus:border-primary"
              >
                <option value="">All Categories</option>
                <option value="education">Education</option>
                <option value="health">Health</option>
                <option value="disaster">Disaster Relief</option>
                <option value="environment">Environment</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <select
                value={statusFilter ?? ''}
                onChange={(e) => {
                  setStatusFilter(e.target.value || null)
                  handleFilterChange()
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-primary focus:border-primary"
              >
                <option value="">All Statuses</option>
                <option value="funded">Fully Funded</option>
                <option value="progress">In Progress</option>
              </select>
            </div>
          </div>

          <div className="space-y-4 mt-4">
            <label className="text-sm font-medium mb-2 block">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                handleFilterChange()
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-primary focus:border-primary"
            >
              <option value="newest">Newest First</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="progress">Progress (High to Low)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results info */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredCampaigns.length} of {campaigns.length} campaigns
      </div>
    </div>
  )
}