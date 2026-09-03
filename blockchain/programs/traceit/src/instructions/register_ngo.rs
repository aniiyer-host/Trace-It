use anchor_lang::prelude::*;
use crate::state::NgoRecord;
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(ngo_id: String)]
pub struct RegisterNgo<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + NgoRecord::INIT_SPACE,
        seeds = [b"ngo", ngo_id.replace("-", "").as_bytes()],
        bump,
    )]
    pub ngo_record: Account<'info, NgoRecord>,

    #[account(mut)]
    pub authority: Signer<'info>, // Backend service wallet

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterNgo>,
    ngo_id: String,
    metadata_hash: String,
) -> Result<()> {
    // Validate inputs
    require!(ngo_id.len() <= 36, TraceItError::InvalidInput);
    require!(metadata_hash.len() <= 128, TraceItError::InvalidInput);

    let record = &mut ctx.accounts.ngo_record;
    record.ngo_id = ngo_id;
    record.status = 1; // Active by default upon registration
    record.metadata_hash = metadata_hash;
    record.registered_at = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.ngo_record;

    msg!("TraceIt: NGO registered on-chain: {}", record.ngo_id);

    Ok(())
}