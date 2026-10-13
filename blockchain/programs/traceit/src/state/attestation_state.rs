use anchor_lang::prelude::*;

/// Attestation account stored on-chain
/// PDA seeds: [b"attestation", donation_id_without_hyphens, ngo_id_without_hyphens, attestation_type_bytes]
#[account]
#[derive(InitSpace)]
pub struct AttestationAccount {
    /// The off-chain donation UUID (same as in DonationRecord)
    #[max_len(36)]
    pub donation_id: String,

    /// NGO profile ID
    #[max_len(36)]
    pub ngo_id: String,

    /// Type of attestation: 0=Receipt, 1=Delivery
    pub attestation_type: u8,

    /// Optional SHA-512 beneficiary ID hash (for delivery attestations)
    #[max_len(128)]
    pub beneficiary_id_hash: String,

    /// The signed attestation message (e.g., "I, NGO-name, confirm receipt...")
    #[max_len(500)]
    pub attestation_message: String,

    /// Hash of the attestation message for integrity verification
    #[max_len(128)]
    pub attestation_message_hash: String,

    /// NGO's public key (base58 string) that signed the attestation
    #[max_len(44)]
    pub ngo_public_key: String,

    /// Timestamp when attestation was signed
    pub signed_at: i64,

    /// Bump seed for PDA derivation
    pub bump: u8,
}