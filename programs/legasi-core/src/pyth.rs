use anchor_lang::prelude::*;

/// Pyth Oracle Integration
/// 
/// Pyth provides real-time price feeds for crypto assets on Solana.
/// We use Pyth for SOL/USD and BTC/USD prices.

/// Pyth Price Feed IDs (Mainnet)
/// See: https://pyth.network/developers/price-feed-ids
pub mod price_feed_ids {
    use anchor_lang::prelude::Pubkey;
    use std::str::FromStr;
    
    /// SOL/USD price feed
    pub fn sol_usd() -> Pubkey {
        // Mainnet: H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG
        Pubkey::from_str("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG").unwrap()
    }
    
    /// BTC/USD price feed (for cbBTC)
    pub fn btc_usd() -> Pubkey {
        // Mainnet: GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU
        Pubkey::from_str("GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU").unwrap()
    }
    
    /// USDC/USD price feed
    pub fn usdc_usd() -> Pubkey {
        // Mainnet: Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD
        Pubkey::from_str("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD").unwrap()
    }
    
    /// EUR/USD price feed (for EURC)
    pub fn eur_usd() -> Pubkey {
        // Mainnet: 6Y54dMhjMwCgse3jAfBfwdHK7Vk9GXLZ7q8YqKPyAoLk
        Pubkey::from_str("6Y54dMhjMwCgse3jAfBfwdHK7Vk9GXLZ7q8YqKPyAoLk").unwrap()
    }
}

/// Pyth price data structure (simplified)
/// In production, use the official pyth-solana-receiver-sdk
#[derive(Clone, Copy, Debug)]
pub struct PythPrice {
    /// Price in USD (scaled by 10^expo)
    pub price: i64,
    /// Confidence interval
    pub conf: u64,
    /// Exponent (usually negative, e.g., -8)
    pub expo: i32,
    /// Publish time
    pub publish_time: i64,
}

impl PythPrice {
    /// Convert Pyth price to our standard 6-decimal USD format
    pub fn to_usd_6dec(&self) -> u64 {
        if self.price <= 0 {
            return 0;
        }
        
        let price = self.price as u128;
        
        // Convert to 6 decimals
        // If expo is -8, we need to divide by 10^2 to get 6 decimals
        // If expo is -6, price is already in 6 decimals
        let target_decimals: i32 = 6;
        let adjustment = target_decimals - (-self.expo);
        
        let result = if adjustment > 0 {
            price.checked_mul(10u128.pow(adjustment as u32)).unwrap_or(0)
        } else if adjustment < 0 {
            price.checked_div(10u128.pow((-adjustment) as u32)).unwrap_or(0)
        } else {
            price
        };
        
        result as u64
    }
    
    /// Check if price is stale (older than max_age seconds)
    pub fn is_stale(&self, current_time: i64, max_age_seconds: i64) -> bool {
        current_time - self.publish_time > max_age_seconds
    }
    
    /// Get confidence as percentage of price (in basis points)
    pub fn confidence_bps(&self) -> u64 {
        if self.price <= 0 {
            return 10000; // 100% confidence interval = bad
        }
        
        ((self.conf as u128) * 10000 / (self.price as u128)) as u64
    }
}

/// Parse Pyth price account data
/// This is a simplified version - in production use pyth-solana-receiver-sdk
pub fn parse_pyth_price(data: &[u8]) -> Option<PythPrice> {
    // Pyth price account layout (simplified):
    // Skip magic number and version (8 bytes)
    // Price at offset 208, conf at 216, expo at 224, publish_time at 232
    
    if data.len() < 240 {
        return None;
    }
    
    let price = i64::from_le_bytes(data[208..216].try_into().ok()?);
    let conf = u64::from_le_bytes(data[216..224].try_into().ok()?);
    let expo = i32::from_le_bytes(data[224..228].try_into().ok()?);
    let publish_time = i64::from_le_bytes(data[232..240].try_into().ok()?);
    
    Some(PythPrice {
        price,
        conf,
        expo,
        publish_time,
    })
}

/// Maximum price age before considered stale (seconds)
pub const MAX_PRICE_AGE: i64 = 60; // 1 minute

/// Maximum acceptable confidence interval (basis points)
pub const MAX_CONFIDENCE_BPS: u64 = 500; // 5%

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_price_conversion() {
        // SOL at $150.00 with expo -8
        let price = PythPrice {
            price: 15_000_000_000, // $150 * 10^8
            conf: 50_000_000,      // $0.50 confidence
            expo: -8,
            publish_time: 0,
        };
        
        // Should convert to 150_000_000 (150 * 10^6)
        assert_eq!(price.to_usd_6dec(), 150_000_000);
    }
    
    #[test]
    fn test_confidence_bps() {
        let price = PythPrice {
            price: 100_000_000,
            conf: 1_000_000, // 1% of price
            expo: -8,
            publish_time: 0,
        };
        
        assert_eq!(price.confidence_bps(), 100); // 1% = 100 bps
    }
}
