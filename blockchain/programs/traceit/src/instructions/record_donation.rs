use anchor_lang::prelude::*;
use crate::state::DonationRecord;
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(
    donation_id: String,
    donor_id_hash: String,
    ngo_id: String,
    campaign_id: String,
    amount_paisa: u64,
    currency: String,
    timestamp: i64,
    record_hash: String,
)]
pub struct RecordDonation<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DonationRecord::INIT_SPACE,
        seeds = [b"donation", donation_id.replace("-", "").as_bytes()],
        bump,
    )]
    pub donation_record: Account<'info, DonationRecord>,

    #[account(mut)]
    pub authority: Signer<'info>, // Backend service wallet

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordDonation>,
    donation_id: String,
    donor_id_hash: String,
    ngo_id: String,
    campaign_id: String,
    amount_paisa: u64,
    currency: String,
    timestamp: i64,
    record_hash: String,
) -> Result<()> {
    // Validate inputs
    require!(donation_id.len() <= 36, TraceItError::InvalidInput);
    require!(donor_id_hash.len() <= 128, TraceItError::InvalidInput);
    require!(amount_paisa > 0, TraceItError::InvalidAmount);
    require!(currency.len() <= 3, TraceItError::InvalidInput);
    require!(record_hash.len() <= 128, TraceItError::InvalidInput);

    let record = &mut ctx.accounts.donation_record;
    record.donation_id = donation_id;
    record.donor_id_hash = donor_id_hash;
    record.ngo_id = ngo_id;
    record.campaign_id = campaign_id;
    record.amount_paisa = amount_paisa;
    record.currency = currency;
    record.timestamp = timestamp;
    record.status = 1; // SUCCESS — we only record confirmed donations
    record.record_hash = record_hash;
    record.bump = ctx.bumps.donation_record;

    msg!("TraceIt: Donation recorded on-chain: {}", record.donation_id);

    Ok(())
}
