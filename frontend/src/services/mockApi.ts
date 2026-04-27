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
        title: 'Girls\' Education – Rural Rajasthan',
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
]

// ─── Campaign APIs ─────────────────────────────────────────────────────────────

export async function fetchCampaigns(): Promise<Campaign[]> {
    await delay(600)
    return structuredClone(CAMPAIGNS) // TODO: GET /api/campaigns
}

export async function fetchCampaignById(id: string): Promise<Campaign | undefined> {
    await delay(400)
    return structuredClone(CAMPAIGNS.find((c) => c.id === id))
}

// ─── Donation APIs ─────────────────────────────────────────────────────────────

const _donations: Donation[] = []

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

// ─── Milestone & Proof APIs ────────────────────────────────────────────────────

/** NGO: Upload proof of milestone completion (IPFS CID mock) */
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

/** Admin: Approve a milestone → sets status to 'delivered' + writes tx hash */
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

/** Demo helper: Cycle a milestone through all statuses for live demo */
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
