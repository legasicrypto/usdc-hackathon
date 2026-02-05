use anchor_lang::prelude::*;

/// x402 Payment Protocol Integration
///
/// x402 is HTTP 402 "Payment Required" - a protocol for machine-to-machine payments.
/// When an agent receives a 402 response, it needs to pay to access the service.
///
/// Flow:
/// 1. Agent calls API → receives 402 with payment details
/// 2. Agent calls x402_pay with the payment request
/// 3. Legasi verifies, borrows if needed, and sends payment
/// 4. Agent retries API call with payment proof

/// x402 payment request (parsed from 402 response)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct X402PaymentRequest {
    /// Recipient of the payment
    pub recipient: Pubkey,
    /// Amount in smallest unit (e.g., USDC with 6 decimals)
    pub amount: u64,
    /// Asset type (USDC or EURC)
    pub asset: u8,
    /// Unique payment ID to prevent replay
    pub payment_id: [u8; 32],
    /// Expiry timestamp
    pub expires_at: i64,
    /// Optional: service endpoint for callback
    pub callback_url_hash: [u8; 32],
}

impl X402PaymentRequest {
    pub fn is_valid(&self, current_time: i64) -> bool {
        current_time < self.expires_at && self.amount > 0
    }
}

/// x402 payment receipt (proof of payment)
#[account]
#[derive(InitSpace)]
pub struct X402Receipt {
    /// The payment request this fulfills
    pub payment_id: [u8; 32],
    /// Who paid
    pub payer: Pubkey,
    /// Who received
    pub recipient: Pubkey,
    /// Amount paid
    pub amount: u64,
    /// When paid
    pub paid_at: i64,
    /// Transaction signature (for verification)
    pub tx_signature: [u8; 64],
    pub bump: u8,
}

/// x402 payment statistics for an agent
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct X402Stats {
    /// Total payments made
    pub total_payments: u64,
    /// Total amount paid
    pub total_amount_paid: u64,
    /// Total borrowed for x402
    pub total_borrowed_for_x402: u64,
    /// Last payment timestamp
    pub last_payment_at: i64,
}

/// Verify x402 payment request signature (simplified)
/// In production, this would verify a proper signature from the service
pub fn verify_x402_request(request: &X402PaymentRequest, _signature: &[u8]) -> bool {
    // For hackathon: just check basic validity
    // Production: verify cryptographic signature from service
    request.amount > 0 && request.amount < 1_000_000_000_000 // Max 1M USDC
}
