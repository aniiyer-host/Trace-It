use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DonationRecord {
    /// The off-chain donation UUID (stored as 36 bytes)
    #[max_len(36)]
    pub donation_id: String,

    /// SHA-512 hash of (userId + secret) — never store raw userId
    #[max_len(128)]
    pub donor_id_hash: String,

    /// NGO profile ID
    #[max_len(36)]
    pub ngo_id: String,

    /// Campaign/project ID
    #[max_len(36)]
    pub campaign_id: String,

    /// Donation amount in paisa (INR * 100)
    pub amount_paisa: u64,

    /// Currency code (always "INR")
    #[max_len(3)]
    pub currency: String,

    /// Unix timestamp of the donation
    pub timestamp: i64,

    /// Current status: 0=Initiated, 1=Success, 2=Allocated, 3=Disbursed, 4=Delivered
    pub status: u8,

    /// SHA-512 hash of the full donation record for tamper detection
    #[max_len(128)]
    pub record_hash: String,

    /// Bump seed for PDA derivation
    pub bump: u8,
}
