use anchor_lang::prelude::*;
use crate::state::DonationRecord;
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(donation_id: String)]
pub struct UpdateDonationStatus<'info> {
    #[account(
        mut,
        seeds = [b"donation", donation_id.replace("-", "").as_bytes()],
        bump = donation_record.bump,
    )]
    pub donation_record: Account<'info, DonationRecord>,

    #[account(mut)]
    pub authority: Signer<'info>, // Backend service wallet
}

pub fn handler(
    ctx: Context<UpdateDonationStatus>,
    _donation_id: String,
    new_status: u8,
) -> Result<()> {
    let record = &mut ctx.accounts.donation_record;

    // Enforce valid status transitions
    let valid_transition = match (record.status, new_status) {
        (1, 2) => true, // SUCCESS -> ALLOCATED
        (2, 3) => true, // ALLOCATED -> DISBURSED
        (3, 4) => true, // DISBURSED -> DELIVERED
        _ => false,
    };

    require!(valid_transition, TraceItError::InvalidStatusTransition);

    record.status = new_status;

    msg!("TraceIt: Donation {} status updated to {}", record.donation_id, new_status);

    Ok(())
}
