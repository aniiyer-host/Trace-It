use anchor_lang::prelude::*;
use crate::state::AttestationAccount;
use crate::errors::TraceItError;

#[derive(Accounts)]
#[instruction(
    donation_id: String,
    ngo_id: String,
    beneficiary_id_hash: String,
    attestation_message: String,
    attestation_message_hash: String,
    ngo_public_key: String,
    signed_at: i64,
)]
pub struct StoreDeliveryAttestation<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + AttestationAccount::INIT_SPACE,
        seeds = [b"attestation", donation_id.replace("-", "").as_bytes(), ngo_id.replace("-", "").as_bytes(), b"delivery"],
        bump,
    )]
    pub attestation_account: Account<'info, AttestationAccount>,

    #[account(mut)]
    pub authority: Signer<'info>, // Backend service wallet

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<StoreDeliveryAttestation>,
    donation_id: String,
    ngo_id: String,
    beneficiary_id_hash: String,
    attestation_message: String,
    attestation_message_hash: String,
    ngo_public_key: String,
    signed_at: i64,
) -> Result<()> {
    // Validate inputs
    require!(donation_id.len() <= 36, TraceItError::InvalidInput);
    require!(ngo_id.len() <= 36, TraceItError::InvalidInput);
    require!(beneficiary_id_hash.len() <= 128, TraceItError::InvalidInput);
    require!(attestation_message.len() <= 500, TraceItError::InvalidInput);
    require!(attestation_message_hash.len() <= 128, TraceItError::InvalidInput);
    require!(ngo_public_key.len() <= 44, TraceItError::InvalidInput);
    require!(signed_at > 0, TraceItError::InvalidInput);

    let attestation = &mut ctx.accounts.attestation_account;
    attestation.donation_id = donation_id;
    attestation.ngo_id = ngo_id;
    attestation.attestation_type = 1; // 1 = Delivery
    attestation.beneficiary_id_hash = beneficiary_id_hash;
    attestation.attestation_message = attestation_message;
    attestation.attestation_message_hash = attestation_message_hash;
    attestation.ngo_public_key = ngo_public_key;
    attestation.signed_at = signed_at;
    attestation.bump = ctx.bumps.attestation_account;

    msg!(
        "TraceIt: NGO delivery attestation stored for donation {}",
        attestation.donation_id
    );

    Ok(())
}