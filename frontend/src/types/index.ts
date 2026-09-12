// Core domain types for TraceIt blockchain charity tracker

export type BackendDonationStatus =
  | 'INITIATED'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUNDED'
  | 'ALLOCATED'
  | 'DISBURSED'
  | 'DELIVERED'

export type LegacyDonationStatus = 'pending' | 'allocated' | 'disbursed' | 'delivered'

export type DonationStatus = BackendDonationStatus | LegacyDonationStatus
export type ExtendedStatus =
  | DonationStatus
  | 'processing'
  | 'failed'
  | 'verified'
  | 'cancelled'
  | 'PROCESSING'
  | 'VERIFIED'
  | 'CANCELLED'

export interface ActivityItem {
  id: string
  title: string
  description: string
  timeAgo: string
  status?: string
  statusColor?: string
}

export interface User {
  id: string
  email: string
  name?: string
  role?: string
}

export type PaymentMethod =
  | 'upi'
  | 'sol'
  | 'UPI'
  | 'CARD'
  | 'NETBANKING'
  | 'WALLET'
  | 'SOLANA_STUB'

export interface Campaign {
  id: string
  title: string
  ngoId: string
  ngo: string
  ngoName?: string
  description: string
  targetAmount: number // in INR
  raisedAmount: number // in INR
  milestones: Milestone[]
  imageUrl?: string
  category?: 'education' | 'health' | 'disaster' | 'environment' | string
  status?: string
  createdAt?: string
  updatedAt?: string
}

export interface Milestone {
  id: string
  campaignId: string
  title: string
  description: string
  targetAmount: number // in INR
  status: DonationStatus
  proofCid?: string // IPFS CID (mock) – placeholder for real upload
  txHash?: string // Solana tx hash (mock)
  approvedAt?: string // ISO timestamp
  disbursedAt?: string // ISO timestamp
  proofSubmittedAt?: string
  rejectionReason?: string
}

export interface Donation {
  id: string
  publicId?: string
  campaignId: string
  campaignTitle?: string
  amount: number // in INR
  paymentMethod: PaymentMethod
  orderId?: string // Razorpay order ID (mock) or SOL tx hash
  razorpayOrderId?: string
  razorpayPaymentId?: string
  txHash?: string // Solana explorer tx hash (mock)
  status: DonationStatus
  milestoneId?: string
  createdAt: string // ISO timestamp
  walletAddress?: string // donor wallet (mock pubkey)
  explorerUrl?: string // Solana devnet explorer URL
  ngoId?: string
  ngoName?: string
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