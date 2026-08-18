use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DisbursementRecord {
    #[max_len(36)]
    pub disbursement_id: String,

    #[max_len(36)]
    pub ngo_id: String,

    #[max_len(36)]
    pub cohort_id: String,

    /// Amount in paisa
    pub amount_paisa: u64,

    /// Unix timestamp
    pub timestamp: i64,

    /// 0=Pending, 1=Approved, 2=Sent, 3=Settled, 4=Failed
    pub status: u8,

    /// Bump seed for PDA
    pub bump: u8,
}
