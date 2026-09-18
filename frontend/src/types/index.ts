// Core domain types for TraceIt blockchain charity tracker

export type BackendDonationStatus =
  | "INITIATED"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  | "ALLOCATED"
  | "DISBURSED"
  | "DELIVERED";

export type LegacyDonationStatus =
  | "pending"
  | "allocated"
  | "disbursed"
  | "delivered"
  | "rejected"
  | "failed";

export type DonationStatus = BackendDonationStatus | LegacyDonationStatus;
export type ExtendedStatus =
  | DonationStatus
  | "processing"
  | "failed"
  | "verified"
  | "cancelled"
  | "PROCESSING"
  | "VERIFIED"
  | "CANCELLED";

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  timeAgo: string;
  status?: string;
  statusColor?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export type PaymentMethod =
  | "upi"
  | "sol"
  | "UPI"
  | "CARD"
  | "NETBANKING"
  | "WALLET"
  | "SOLANA_STUB";

export interface Campaign {
  id: string;
  title: string;
  ngoId: string;
  ngo: string;
  ngoName?: string;
  description: string;
  targetAmount: number; // in INR
  raisedAmount: number; // in INR
  milestones: Milestone[];
  imageUrl?: string;
  category?: "education" | "health" | "disaster" | "environment" | string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  //Added to correct LINT Error
  successDonationCount?: number;
}

export interface Milestone {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  targetAmount: number; // in INR
  status: DonationStatus;
  proofCid?: string; // IPFS CID (mock) – placeholder for real upload
  txHash?: string; // Solana tx hash (mock)
  approvedAt?: string; // ISO timestamp
  disbursedAt?: string; // ISO timestamp
  proofSubmittedAt?: string;
  rejectionReason?: string;
  disbursementStatus?: DisbursementStatus;
}

export interface Donation {
  id: string;
  publicId?: string;
  campaignId: string;
  campaignTitle?: string;
  amount: number; // in INR
  paymentMethod: PaymentMethod;
  orderId?: string; // Razorpay order ID (mock) or SOL tx hash
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  txHash?: string; // Solana explorer tx hash (mock)
  status: DonationStatus;
  milestoneId?: string;
  createdAt: string; // ISO timestamp
  walletAddress?: string; // donor wallet (mock pubkey)
  explorerUrl?: string; // Solana devnet explorer URL
  // attestations?: any[];
  attestations?: Attestation[];
  ngoId?: string;
  ngoName?: string;
}

export interface WalletState {
  connected: boolean;
  publicKey: string | null; // mock pubkey e.g. "Trc7...Demo"
  balance: number; // mock SOL balance
}

export interface UpiPaymentResult {
  orderId: string;
  razorpayPaymentId: string; // mock
  status: "success" | "failed";
}

export interface SolPaymentResult {
  txHash: string;
  explorerUrl: string;
  status: "success" | "failed";
}

export type PaymentResult = UpiPaymentResult | SolPaymentResult;

/** Admin approval payload sent to NGO proof endpoint */
export interface ProofUpload {
  milestoneId: string;
  description: string;
  cid: string; // mock IPFS CID
}

export interface Attestation {
  id: string;
  type: string;
  attestedBy: string;
  attestedAt: string;
  statement: string;
  status: string;
  createdAt: string;
}

//-----------------------------------------------
//NEW Types and interfaces for frontned lint fixes
//-----------------------------------------------
export interface DonorDashboardDonation {
  id: string;
  publicId?: string;
  amount: number;
  currencyCode: string;
  paymentMethod: string;
  status: DonationStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  taxReceiptUrl?: string | null;
  taxReceiptEmailed: boolean;
  createdAt: string;
  project: {
    id: string;
    title: string;
  };
  ngo: {
    id: string;
    organisationName: string;
  };
  attestations: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
  }[];
}

export interface DonationCreateResponse {
  id: string;
  publicId?: string;
  amount: number;
  status: DonationStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  campaignId: string;
  ngoId: string;
  razorpayOrderId: string;
}

export interface DonorDashboardResponse {
  donations: DonorDashboardDonation[];
}

export interface ActionItem {
  type: "milestone" | "attestation";
  id: string;
  entityId: string;
  title: string;
  amount: number;
  ngo: string;
  campaign: string;
  fieldReportUrl?: string | null;
}
export interface PendingCampaign {
  id: string;
  title: string;
  description: string;
  ngoId: string;
  ngoName?: string;
  ngo?:
    | string
    | {
        id: string;
        organisationName: string;
      };
  targetAmount: number;
}

export interface AuditLog {
  id: string;
  createdAt: string;
  action: string;
  actorType: string;
  entityType: string;
  entityId: string;
  actor?: {
    fullName?: string;
  };
  metadata?: Record<string, unknown>;
}

// export interface DisbursementResponse {
//   id: string;
//   campaignId: string;
//   amountInr: number | string;
//   status: string;
//   cohort?: {
//     name?: string;
//   };
//   fieldReportUrl?: string | null;
//   proofSubmittedAt?: string | null;
//   rejectionReason?: string | null;
//   solanaTxHash?: string | null;
// }

export interface DisbursementResponse {
  id: string;
  campaignId: string;
  ngoId?: string;
  amountInr: number | string;
  status: DisbursementStatus;
  cohortId?: string | null;

  cohort?: {
    name?: string;
  } | null;

  campaign?: {
    id: string;
    title: string;
  } | null;

  ngo?: {
    id: string;
    organisationName?: string | null;
  } | null;

  fieldReportUrl?: string | null;
  proofSubmittedAt?: string | null;
  rejectionReason?: string | null;
  solanaTxHash?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
}

export interface PendingNgoAttestation {
  id: string;
  donationId: string;
  type: string;
  attestedBy: string | null;
  attestedAt: string | null;
  statement: string;
  status: string;
  createdAt: string;
  donation: {
    id: string;
    publicId: string;
    amount: number;
    donorId: string;
  };
}
export interface AdminPendingCampaign extends Omit<Campaign, "ngo"> {
  ngo: {
    id: string;
    organisationName: string;
  };
}

export interface AdminPendingAttestation {
  id: string;
  donationId: string;
  type: string;
  attestedBy: string | null;
  attestedAt: string | null;
  statement: string;
  status: string;
  createdAt: string;
  donation: {
    id: string;
    publicId: string;
    amount: number;
    ngoId: string;
    donorId: string;
    campaignId: string;
    project: {
      title: string;
    };
    ngo: {
      organisationName: string;
    };
  };
  ngoName: string;
  campaignTitle: string;
}

// export interface AdminPendingDisbursement {
//   id: string;
//   campaignId: string;
//   amountInr: number | string;
//   status: string;
//   cohort?: {
//     name?: string;
//   };
//   fieldReportUrl?: string | null;
//   proofSubmittedAt?: string | null;
//   rejectionReason?: string | null;
//   solanaTxHash?: string | null;
// }
export interface AdminAuditLog {
  id: string;
  createdAt: string;
  action: string;
  actorType: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  actor?: {
    id: string;
    fullName: string | null;
  };
  govRequest?: {
    id: string;
    requestRef: string;
  } | null;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Disbursement interface

export type DisbursementStatus =
  | "PENDING"
  | "APPROVED"
  | "SENT"
  | "SETTLED"
  | "FAILED"
  | "REJECTED";

export interface AdminPendingDisbursement extends DisbursementResponse {
  campaign: {
    id: string;
    title: string;
  };

  ngo: {
    id: string;
    organisationName?: string | null;
  };
}
