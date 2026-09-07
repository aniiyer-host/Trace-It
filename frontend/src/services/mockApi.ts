// Mock API – simulates backend calls for campaigns, donations, proof uploads & approvals
// TODO: Replace each function body with real fetch() calls to your backend or Helius RPC

import { delay, mockTxHash, explorerUrl } from '@/lib/utils'
import type { Campaign, Donation, Milestone, PaymentMethod, ProofUpload, DonationStatus } from '@/types'

// ─── Seed Data ────────────────────────────────────────────────────────────────

export const CAMPAIGNS: Campaign[] = [
    {
        id: 'camp-001',
        title: 'Flood Relief – Assam 2025',
        ngo: 'AidIndia Foundation',
        description: 'Providing food, shelter and medical aid to 12,000 families displaced by the Brahmaputra floods.',
        targetAmount: 80000,
        raisedAmount: 52400,
        category: 'disaster',
        milestones: [
            { id: 'ms-001-a', campaignId: 'camp-001', title: 'Emergency Kits Delivered', description: 'Deploy 5,000 emergency kits to flood zones', targetAmount: 20000, status: 'delivered', txHash: mockTxHash('ms001a'), proofCid: 'QmX9kPr...Abc', disbursedAt: '2025-07-10T08:20:00Z', approvedAt: '2025-07-09T14:00:00Z' },
            { id: 'ms-001-b', campaignId: 'camp-001', title: 'Temporary Shelters', description: 'Erect 300 weatherproof shelters', targetAmount: 30000, status: 'disbursed', txHash: mockTxHash('ms001b'), disbursedAt: '2025-07-18T11:00:00Z' },
            { id: 'ms-001-c', campaignId: 'camp-001', title: 'Medical Camps Setup', description: '10 mobile medical camps staffed for 30 days', targetAmount: 30000, status: 'allocated' },
        ],
    },
    {
        id: 'camp-002',
        title: "Girls' Education – Rural Rajasthan",
        ngo: 'ShikshaPath Trust',
        description: 'Scholarships and digital literacy for 2,000 girls in 40 villages across Barmer district.',
        targetAmount: 50000,
        raisedAmount: 18900,
        category: 'education',
        milestones: [
            { id: 'ms-002-a', campaignId: 'camp-002', title: 'Tablet Distribution', description: 'Distribute 500 Android tablets', targetAmount: 25000, status: 'allocated' },
            { id: 'ms-002-b', campaignId: 'camp-002', title: 'Teacher Training', description: '80 teachers trained in digital pedagogy', targetAmount: 25000, status: 'pending' },
        ],
    },
    {
        id: 'camp-003',
        title: 'Clean Water – Jharkhand',
        ngo: 'JalJeevan Collective',
        description: 'Installing solar-powered water purification units in 20 tribal villages lacking potable water.',
        targetAmount: 60000,
        raisedAmount: 60000,
        category: 'health',
        milestones: [
            { id: 'ms-003-a', campaignId: 'camp-003', title: 'Equipment Procurement', description: 'Purchase & ship 20 purification units', targetAmount: 30000, status: 'delivered', txHash: mockTxHash('ms003a'), proofCid: 'QmZ7pLm...Xyz' },
            { id: 'ms-003-b', campaignId: 'camp-003', title: 'Installation Complete', description: 'All 20 units installed and operational', targetAmount: 30000, status: 'delivered', txHash: mockTxHash('ms003b'), proofCid: 'QmA3qRt...Def' },
        ],
    },
    {
        id: 'camp-004',
        title: 'Renewable Energy – Sundarbans',
        ngo: 'GreenEnergy Trust',
        description: 'Installing solar microgrids in 50 remote villages to replace diesel generators.',
        targetAmount: 75000,
        raisedAmount: 42300,
        category: 'environment',
        milestones: [
            { id: 'ms-004-a', campaignId: 'camp-004', title: 'Solar Panel Installation', description: 'Install 500 solar panels across 50 villages', targetAmount: 30000, status: 'delivered', txHash: mockTxHash('ms004a'), proofCid: 'QmY8rSt...Def', disbursedAt: '2025-08-15T09:30:00Z', approvedAt: '2025-08-14T16:45:00Z' },
            { id: 'ms-004-b', campaignId: 'camp-004', title: 'Battery Storage Setup', description: 'Install 100 battery units for energy storage', targetAmount: 25000, status: 'disbursed', txHash: mockTxHash('ms004b'), disbursedAt: '2025-08-22T14:15:00Z' },
            { id: 'ms-004-c', campaignId: 'camp-004', title: 'Training & Maintenance', description: 'Train local technicians for system maintenance', targetAmount: 20000, status: 'allocated' },
        ],
    },
    {
        id: 'camp-005',
        title: 'Digital Literacy – Urban Slums',
        ngo: 'TechForAll Foundation',
        description: 'Setting up computer labs in 100 slum communities for youth skill development.',
        targetAmount: 40000,
        raisedAmount: 35600,
        category: 'education',
        milestones: [
            { id: 'ms-005-a', campaignId: 'camp-005', title: 'Computer Lab Setup', description: 'Establish 100 computer labs with 10 PCs each', targetAmount: 20000, status: 'delivered', txHash: mockTxHash('ms005a'), proofCid: 'QmZ1aBc...Xyz', disbursedAt: '2025-09-01T11:20:00Z', approvedAt: '2025-08-31T17:00:00Z' },
            { id: 'ms-005-b', campaignId: 'camp-005', title: 'Curriculum Development', description: 'Create localized digital literacy curriculum', targetAmount: 15000, status: 'delivered', txHash: mockTxHash('ms005b'), proofCid: 'QmA2dEf...Ghi', disbursedAt: '2025-09-05T14:45:00Z', approvedAt: '2025-09-04T10:30:00Z' },
            { id: 'ms-005-c', campaignId: 'camp-005', title: 'Instructor Training', description: 'Train 200 local instructors on curriculum delivery', targetAmount: 5000, status: 'pending' },
        ],
    },
]

// Mock attestations data
const _attestations: Record<string, {
  id: string;
  donationId: string;
  type: 'receipt' | 'delivery';
  status: 'pending' | 'confirmed';
  attestedBy: string;  // NGO name
  attestedAt: string;  // ISO timestamp
  statement: string;
} > = {}

// ─── Seed Data for Donations ─────────────────────────────────────────────────

const _donations: Donation[] = [
  {
    id: 'don-001',
    campaignId: 'camp-001',
    campaignTitle: 'Flood Relief – Assam 2025',
    amount: 5000,
    paymentMethod: 'upi',
    orderId: 'order_001',
    txHash: mockTxHash('don001'),
    status: 'delivered',
    milestoneId: 'ms-001-a',
    createdAt: '2025-07-08T10:30:00Z',
    walletAddress: 'demo_wallet_001',
    explorerUrl: explorerUrl(mockTxHash('don001')),
  },
  {
    id: 'don-002',
    campaignId: 'camp-002',
    campaignTitle: "Girls' Education – Rural Rajasthan",
    amount: 10000,
    paymentMethod: 'upi',
    orderId: 'order_002',
    txHash: mockTxHash('don002'),
    status: 'disbursed',
    milestoneId: 'ms-002-a',
    createdAt: '2025-08-15T14:20:00Z',
    walletAddress: 'demo_wallet_001',
    explorerUrl: explorerUrl(mockTxHash('don002')),
  },
  {
    id: 'don-003',
    campaignId: 'camp-003',
    campaignTitle: 'Clean Water – Jharkhand',
    amount: 2500,
    paymentMethod: 'sol',
    orderId: 'order_003',
    txHash: mockTxHash('don003'),
    status: 'pending',
    createdAt: '2025-09-01T09:15:00Z',
    walletAddress: 'demo_wallet_002',
    explorerUrl: explorerUrl(mockTxHash('don003')),
  }
]

// Add attestations for some donations
_attestations['att-001'] = {
  id: 'att-001',
  donationId: 'don-001',
  type: 'receipt',
  status: 'confirmed',
  attestedBy: 'AidIndia Foundation',
  attestedAt: '2025-07-09T14:00:00Z',
  statement: 'AidIndia Foundation confirms receipt of ₹5,000 donated for Flood Relief – Assam 2025 on 2025-07-08'
}

_attestations['att-002'] = {
  id: 'att-002',
  donationId: 'don-001',
  type: 'delivery',
  status: 'confirmed',
  attestedBy: 'AidIndia Foundation',
  attestedAt: '2025-07-10T08:20:00Z',
  statement: 'AidIndia Foundation confirms delivery of aid worth ₹5,000 to beneficiaries in Assam flood zones'
}

// ─── Campaign APIs ────────────────────────────────────────────────────────────

export async function fetchCampaigns(): Promise<Campaign[]> {
    await delay(600)
    return structuredClone(CAMPAIGNS) // TODO: GET /api/campaigns
}

export async function fetchCampaignById(id: string): Promise<Campaign | undefined> {
    await delay(400)
    return structuredClone(CAMPAIGNS.find((c) => c.id === id))
}

// ─── Donation APIs ────────────────────────────────────────────────────────────

export async function createDonation(
    campaign: Campaign,
    amount: number,
    paymentMethod: PaymentMethod,
    orderId: string,
    txHash: string,
    walletAddress: string,
): Promise<Donation> {
    await delay(500)
    const donation: Donation = {
        id: `don-${Date.now()}`,
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        amount,
        paymentMethod,
        orderId,
        txHash,
        status: 'pending',
        createdAt: new Date().toISOString(),
        walletAddress,
        explorerUrl: explorerUrl(txHash),
    }
    _donations.push(donation)
    return structuredClone(donation) // TODO: POST /api/donations
}

export async function fetchDonationsByWallet(walletAddress: string): Promise<Donation[]> {
    await delay(500)
    return structuredClone(_donations.filter((d) => d.walletAddress === walletAddress))
    // TODO: GET /api/donations?wallet=<address>
}

export async function fetchDonationsByUser(userId: string): Promise<Donation[]> {
    await delay(500)
    // In a real app, we'd map userId to wallet address(es)
    // For demo, we'll return donations for demo wallets if userId matches
    if (userId === 'user-001') {
      return structuredClone(_donations.filter((d) => d.walletAddress === 'demo_wallet_001'))
    }
    if (userId === 'user-002') {
      return structuredClone(_donations.filter((d) => d.walletAddress === 'demo_wallet_002'))
    }
    // Return empty array for unknown users
    return structuredClone([])
    // TODO: GET /api/donations?user=<id>
}

// ─── Attestation APIs ────────────────────────────────────────────────────────

export async function createAttestation(
  donationId: string,
  type: 'receipt' | 'delivery',
  ngoName: string
): Promise<{ id: string; attestedAt: string }> {
  await delay(800)

  const attestationId = `att-${Date.now()}`
  const attestedAt = new Date().toISOString()

  // Find donation to create statement
  const donation = _donations.find(d => d.id === donationId)
  if (!donation) {
    throw new Error('Donation not found')
  }

  let statement = ''
  if (type === 'receipt') {
    statement = `${ngoName} confirms receipt of ₹${donation.amount} donated for ${donation.campaignTitle} on ${new Date(donation.createdAt).toLocaleDateString()}`
  } else {
    statement = `${ngoName} confirms delivery of aid worth ₹${donation.amount} to beneficiaries for ${donation.campaignTitle}`
  }

  _attestations[attestationId] = {
    id: attestationId,
    donationId,
    type,
    status: 'confirmed',
    attestedBy: ngoName,
    attestedAt,
    statement
  }

  // Update donation status if this is a receipt attestation
  if (type === 'receipt') {
    const donationIndex = _donations.findIndex(d => d.id === donationId)
    if (donationIndex !== -1) {
      _donations[donationIndex] = {
        ..._donations[donationIndex],
        status: 'disbursed' // Move to disbursed after receipt confirmation
      }
    }
  }

  return structuredClone({ id: attestationId, attestedAt })
}

export async function getAttestationByDonationId(
  donationId: string,
  type?: 'receipt' | 'delivery'
): Promise<{
  id: string;
  donationId: string;
  type: 'receipt' | 'delivery';
  status: 'pending' | 'confirmed';
  attestedBy: string;
  attestedAt: string;
  statement: string;
} | null> {
  await delay(300)

  // Find attestation for this donation and type
  const attestation = Object.values(_attestations).find(
    att => att.donationId === donationId &&
           (!type || att.type === type) &&
           att.status === 'confirmed'
  )

  if (!attestation) {
    return null
  }

  return structuredClone(attestation)
}

export async function requestAttestation(
  donationId: string,
  type: 'receipt' | 'delivery'
): Promise<{ id: string; status: 'pending' | 'confirmed' }> {
  await delay(500)

  // Check if donation exists
  const donation = _donations.find(d => d.id === donationId)
  if (!donation) {
    throw new Error('Donation not found')
  }

  // Check if attestation already exists
  const existingAttestation = Object.values(_attestations).find(
    att => att.donationId === donationId && att.type === type
  )

  if (existingAttestation) {
    return structuredClone({
      id: existingAttestation.id,
      status: existingAttestation.status
    })
  }

  // Create pending attestation
  const attestationId = `att-${Date.now()}-pending`
  _attestations[attestationId] = {
    id: attestationId,
    donationId,
    type,
    status: 'pending',
    attestedBy: '', // Will be filled when NGO confirms
    attestedAt: '',
    statement: ''
  }

  return structuredClone({ id: attestationId, status: 'pending' })
}

// ─── Milestone & Proof APIs ────────────────────────────────────────────────────

export async function uploadMilestoneProof(proof: ProofUpload): Promise<Milestone> {
    await delay(900)
    const campaign = CAMPAIGNS.find((c) =>
        c.milestones.some((m) => m.id === proof.milestoneId),
    )
    if (!campaign) throw new Error('Milestone not found')
    const milestone = campaign.milestones.find((m) => m.id === proof.milestoneId)!
    milestone.proofCid = proof.cid
    milestone.status = 'disbursed'
    milestone.disbursedAt = new Date().toISOString()
    return structuredClone(milestone) // TODO: POST /api/milestones/:id/proof
}

export async function approveMilestone(milestoneId: string): Promise<Milestone> {
    await delay(800)
    const campaign = CAMPAIGNS.find((c) =>
        c.milestones.some((m) => m.id === milestoneId),
    )
    if (!campaign) throw new Error('Milestone not found')
    const milestone = campaign.milestones.find((m) => m.id === milestoneId)!
    milestone.status = 'delivered'
    milestone.txHash = mockTxHash(milestoneId)
    milestone.approvedAt = new Date().toISOString()
    return structuredClone(milestone) // TODO: POST /api/milestones/:id/approve
}

export async function cycleMilestoneStatus(milestoneId: string): Promise<DonationStatus> {
    await delay(300)
    const flow: DonationStatus[] = ['pending', 'allocated', 'disbursed', 'delivered']
    for (const campaign of CAMPAIGNS) {
        const ms = campaign.milestones.find((m) => m.id === milestoneId)
        if (ms) {
            const idx = flow.indexOf(ms.status)
            ms.status = flow[(idx + 1) % flow.length]
            if (ms.status === 'delivered' && !ms.txHash) ms.txHash = mockTxHash(milestoneId)
            return ms.status
        }
    }
    throw new Error('Milestone not found')
}