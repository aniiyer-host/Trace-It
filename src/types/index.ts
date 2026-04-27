// Core domain types for TraceIt blockchain charity tracker

export type DonationStatus = 'pending' | 'allocated' | 'disbursed' | 'delivered'

export type PaymentMethod = 'upi' | 'sol'

export interface Campaign {
    id: string
    title: string
    ngo: string
    description: string
    targetAmount: number   // in INR
    raisedAmount: number   // in INR
    milestones: Milestone[]
    imageUrl?: string
    category: 'education' | 'health' | 'disaster' | 'environment'
}

export interface Milestone {
    id: string
    campaignId: string
    title: string
    description: string
    targetAmount: number   // in INR
    status: DonationStatus
    proofCid?: string      // IPFS CID (mock) – placeholder for real upload
    txHash?: string        // Solana tx hash (mock)
    approvedAt?: string    // ISO timestamp
    disbursedAt?: string   // ISO timestamp
}

export interface Donation {
    id: string
    campaignId: string
    campaignTitle: string
    amount: number         // in INR
    paymentMethod: PaymentMethod
    orderId: string        // Razorpay order ID (mock) or SOL tx hash
    txHash: string         // Solana explorer tx hash (mock)
    status: DonationStatus
    milestoneId?: string
    createdAt: string      // ISO timestamp
    walletAddress: string  // donor wallet (mock pubkey)
    explorerUrl: string    // Solana devnet explorer URL
}

export interface WalletState {
    connected: boolean
    publicKey: string | null  // mock pubkey e.g. "Trc7...Demo"
    balance: number           // mock SOL balance
}

export interface UpiPaymentResult {
    orderId: string
    razorpayPaymentId: string  // mock
    status: 'success' | 'failed'
}

export interface SolPaymentResult {
    txHash: string
    explorerUrl: string
    status: 'success' | 'failed'
}

export type PaymentResult = UpiPaymentResult | SolPaymentResult

/** Admin approval payload sent to NGO proof endpoint */
export interface ProofUpload {
    milestoneId: string
    description: string
    cid: string   // mock IPFS CID
}
