use anchor_lang::prelude::*;
use crate::state::{CohortRecord, NgoRecord};
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(cohort_id: String, ngo_id: String)]
pub struct RegisterCohort<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + CohortRecord::INIT_SPACE,
        seeds = [b"cohort", cohort_id.replace("-", "").as_bytes()],
        bump,
    )]
    pub cohort_record: Account<'info, CohortRecord>,

    /// CHECK: Verified via constraint
    #[account(
        seeds = [b"ngo", ngo_id.replace("-", "").as_bytes()],
        bump = ngo_record.bump,
        constraint = ngo_record.status == 1 @ TraceItError::NgoNotActive
    )]
    pub ngo_record: Account<'info, NgoRecord>,

    #[account(mut)]
    pub authority: Signer<'info>, // Backend service wallet

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterCohort>,
    cohort_id: String,
    ngo_id: String,
    metadata_hash: String,
) -> Result<()> {
    // Validate inputs
    require!(cohort_id.len() <= 36, TraceItError::InvalidInput);
    require!(ngo_id.len() <= 36, TraceItError::InvalidInput);
    require!(metadata_hash.len() <= 128, TraceItError::InvalidInput);

    let record = &mut ctx.accounts.cohort_record;
    record.cohort_id = cohort_id;
    record.ngo_id = ngo_id;
    record.sha512_doc_hash = metadata_hash;
    record.created_at = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.cohort_record;

    msg!("TraceIt: Cohort registered on-chain: {}", record.cohort_id);

    Ok(())
}