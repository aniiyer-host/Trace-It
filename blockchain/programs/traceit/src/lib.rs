use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3");

#[program]
pub mod traceit {
    use super::*;

    pub fn record_donation(
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
        instructions::record_donation::handler(
            ctx,
            donation_id,
            donor_id_hash,
            ngo_id,
            campaign_id,
            amount_paisa,
            currency,
            timestamp,
            record_hash,
        )
    }

    pub fn update_donation_status(
        ctx: Context<UpdateDonationStatus>,
        donation_id: String,
        new_status: u8,
    ) -> Result<()> {
        instructions::update_status::handler(ctx, donation_id, new_status)
    }
}
