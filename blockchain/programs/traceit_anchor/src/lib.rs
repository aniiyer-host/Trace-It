use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;

declare_id!("4qLwniS2NeDrqftgb83GbYVHWVbBBbUcjDR1Ncm5GCHX");

pub const CONFIG_SEED: &[u8] = b"anchor_config";
pub const ANCHOR_SEED: &[u8] = b"anchor";
pub const SUPPORTED_SCHEMA_VERSION: u16 = 1;
pub const BOOTSTRAP_AUTHORITY: Pubkey = pubkey!("Emi2GHuHM4UnY6TqcXio3Cbfe5H1E2uukL3QgBziQSrG");

#[program]
pub mod traceit_anchor {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.pending_authority = None;
        config.version = SUPPORTED_SCHEMA_VERSION;
        config.paused = false;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_paused(ctx: Context<ManageConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    pub fn propose_authority(ctx: Context<ManageConfig>, new_authority: Pubkey) -> Result<()> {
        require!(
            new_authority != Pubkey::default(),
            AnchorError::InvalidAuthority
        );
        require!(
            new_authority != ctx.accounts.config.authority,
            AnchorError::AuthorityUnchanged
        );
        ctx.accounts.config.pending_authority = Some(new_authority);
        Ok(())
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.pending_authority.key();
        config.pending_authority = None;
        Ok(())
    }

    pub fn record_anchor(
        ctx: Context<RecordAnchor>,
        batch_key: [u8; 32],
        audit_root: [u8; 64],
        start_sequence: u64,
        end_sequence: u64,
        event_count: u32,
        schema_version: u16,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, AnchorError::ProgramPaused);
        require!(
            schema_version == SUPPORTED_SCHEMA_VERSION,
            AnchorError::UnsupportedSchemaVersion
        );
        require!(
            audit_root.iter().any(|byte| *byte != 0),
            AnchorError::ZeroRoot
        );
        require!(event_count > 0, AnchorError::EmptyBatch);
        require!(end_sequence >= start_sequence, AnchorError::InvalidRange);

        let expected_count = end_sequence
            .checked_sub(start_sequence)
            .and_then(|span| span.checked_add(1))
            .ok_or(AnchorError::ArithmeticOverflow)?;
        require!(
            expected_count == u64::from(event_count),
            AnchorError::CountMismatch
        );

        let record = &mut ctx.accounts.anchor_record;
        record.batch_key = batch_key;
        record.audit_root = audit_root;
        record.start_sequence = start_sequence;
        record.end_sequence = end_sequence;
        record.event_count = event_count;
        record.schema_version = schema_version;
        record.authority = ctx.accounts.authority.key();
        record.anchored_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.anchor_record;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = AnchorConfig::SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, AnchorConfig>,
    #[account(
        mut,
        constraint = authority.key() == BOOTSTRAP_AUTHORITY @ AnchorError::Unauthorized
    )]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageConfig<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ AnchorError::Unauthorized,
    )]
    pub config: Account<'info, AnchorConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.pending_authority == Some(pending_authority.key()) @ AnchorError::Unauthorized,
    )]
    pub config: Account<'info, AnchorConfig>,
    pub pending_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(batch_key: [u8; 32])]
pub struct RecordAnchor<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ AnchorError::Unauthorized,
    )]
    pub config: Account<'info, AnchorConfig>,
    #[account(
        init,
        payer = authority,
        space = AnchorRecord::SPACE,
        seeds = [ANCHOR_SEED, batch_key.as_ref()],
        bump,
    )]
    pub anchor_record: Account<'info, AnchorRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct AnchorConfig {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub version: u16,
    pub paused: bool,
    pub bump: u8,
}

impl AnchorConfig {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct AnchorRecord {
    pub batch_key: [u8; 32],
    pub audit_root: [u8; 64],
    pub start_sequence: u64,
    pub end_sequence: u64,
    pub event_count: u32,
    pub schema_version: u16,
    pub authority: Pubkey,
    pub anchored_at: i64,
    pub bump: u8,
}

impl AnchorRecord {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[error_code]
pub enum AnchorError {
    #[msg("The signer is not authorized for this operation")]
    Unauthorized,
    #[msg("Anchor creation is paused")]
    ProgramPaused,
    #[msg("The audit root cannot be all zeroes")]
    ZeroRoot,
    #[msg("The anchor batch cannot be empty")]
    EmptyBatch,
    #[msg("The sequence range is invalid")]
    InvalidRange,
    #[msg("The event count does not match the sequence range")]
    CountMismatch,
    #[msg("Sequence arithmetic overflowed")]
    ArithmeticOverflow,
    #[msg("The schema version is not supported")]
    UnsupportedSchemaVersion,
    #[msg("The proposed authority is invalid")]
    InvalidAuthority,
    #[msg("The proposed authority is already active")]
    AuthorityUnchanged,
    #[msg("An existing anchor conflicts with the submitted immutable fields")]
    IntegrityConflict,
}
