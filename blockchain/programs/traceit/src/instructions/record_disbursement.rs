use anchor_lang::prelude::*;
use crate::state::{DisbursementRecord, NgoRecord};
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(disbursement_id: String, ngo_id: String, cohort_id: String)]
pub struct RecordDisbursement<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DisbursementRecord::INIT_SPACE,
        seeds = [b"disbursement", disbursement_id.replace("-", "").as_bytes()],
        bump,
    )]
    pub disbursement_record: Account<'info, DisbursementRecord>,

    /// CHECK: Verified via constraint
    #[account(
        seeds = [b"ngo", ngo_id.replace("-", "").as_bytes()],
        bump = ngo_record.bump,
        constraint = ngo_record.status == 1 @ TraceItError::NgoNotActive
    )]
    pub ngo_record: Account<'info, NgoRecord>,

    #[account(mut)]
    pub authority: Signer<'info>, // Platform fee-payer wallet

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordDisbursement>,
    disbursement_id: String,
    ngo_id: String,
    cohort_id: String,
    amount_paisa: u64,
    currency: String,
    timestamp: i64,
    transaction_hash: String,
) -> Result<()> {
    // Validate inputs
    require!(disbursement_id.len() <= 36, TraceItError::InvalidInput);
    require!(ngo_id.len() <= 36, TraceItError::InvalidInput);
    require!(cohort_id.len() <= 36, TraceItError::InvalidInput);
    require!(amount_paisa > 0, TraceItError::InvalidAmount);
    require!(currency.len() <= 3, TraceItError::InvalidInput);
    require!(transaction_hash.len() <= 128, TraceItError::InvalidInput);

    let record = &mut ctx.accounts.disbursement_record;
    record.disbursement_id = disbursement_id;
    record.ngo_id = ngo_id;
    record.cohort_id = cohort_id;
    record.amount_paisa = amount_paisa;
    record.currency = currency;
    record.timestamp = timestamp;
    record.transaction_hash = transaction_hash;
    record.status = 2; // Sent by default
    record.bump = ctx.bumps.disbursement_record;

    msg!(
        "TraceIt: Disbursement recorded on-chain: {} to NGO {}",
        record.disbursement_id,
        record.ngo_id
    );

    Ok(())
}