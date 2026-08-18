use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CohortRecord {
    #[max_len(36)]
    pub cohort_id: String,

    #[max_len(36)]
    pub ngo_id: String,

    /// SHA-512 hash of the cohort proof document bundle
    #[max_len(128)]
    pub sha512_doc_hash: String,

    /// Beneficiary count
    pub beneficiary_count: u32,

    /// Unix timestamp
    pub created_at: i64,

    /// Bump seed for PDA
    pub bump: u8,
}
