use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct NgoRecord {
    #[max_len(36)]
    pub ngo_id: String,

    /// 0=Pending, 1=Active, 2=Rejected, 3=Suspended
    pub status: u8,

    /// SHA-512 hash of NGO verification documents
    #[max_len(128)]
    pub metadata_hash: String,

    /// Unix timestamp of registration
    pub registered_at: i64,

    /// Bump seed for PDA
    pub bump: u8,
}
