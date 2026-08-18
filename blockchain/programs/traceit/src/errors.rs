use anchor_lang::prelude::*;

#[error_code]
pub enum TraceItError {
    #[msg("Invalid input: field exceeds maximum length")]
    InvalidInput,

    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,

    #[msg("Invalid status transition")]
    InvalidStatusTransition,

    #[msg("Unauthorized: only the program authority can perform this action")]
    Unauthorized,
}
