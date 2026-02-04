/// Interest rate model parameters
/// Uses a two-slope model like Aave/Compound

/// Base interest rate (annual, in basis points)
pub const BASE_RATE_BPS: u64 = 300; // 3%

/// Slope 1: Rate increase per utilization below optimal (in bps)
pub const SLOPE1_BPS: u64 = 800; // 8%

/// Slope 2: Rate increase per utilization above optimal (in bps)  
pub const SLOPE2_BPS: u64 = 7500; // 75% (steep increase above optimal)

/// Optimal utilization rate (in bps)
pub const OPTIMAL_UTILIZATION_BPS: u64 = 8000; // 80%

/// Protocol fee on interest (in bps)
pub const PROTOCOL_FEE_BPS: u64 = 2000; // 20% of interest goes to protocol

/// Calculate borrow APR based on utilization
/// Returns rate in basis points (e.g., 1000 = 10%)
pub fn calculate_borrow_rate(total_deposits: u64, total_borrowed: u64) -> u64 {
    if total_deposits == 0 {
        return BASE_RATE_BPS;
    }
    
    // Utilization in bps (0-10000)
    let utilization_bps = (total_borrowed as u128)
        .saturating_mul(10000)
        .checked_div(total_deposits as u128)
        .unwrap_or(0) as u64;
    
    if utilization_bps <= OPTIMAL_UTILIZATION_BPS {
        // Below optimal: gentle slope
        // rate = base + (utilization / optimal) * slope1
        let rate_increase = (utilization_bps as u128)
            .saturating_mul(SLOPE1_BPS as u128)
            .checked_div(OPTIMAL_UTILIZATION_BPS as u128)
            .unwrap_or(0) as u64;
        
        BASE_RATE_BPS.saturating_add(rate_increase)
    } else {
        // Above optimal: steep slope
        // rate = base + slope1 + ((utilization - optimal) / (1 - optimal)) * slope2
        let excess_utilization = utilization_bps.saturating_sub(OPTIMAL_UTILIZATION_BPS);
        let remaining_utilization = 10000_u64.saturating_sub(OPTIMAL_UTILIZATION_BPS);
        
        let steep_increase = (excess_utilization as u128)
            .saturating_mul(SLOPE2_BPS as u128)
            .checked_div(remaining_utilization as u128)
            .unwrap_or(0) as u64;
        
        BASE_RATE_BPS
            .saturating_add(SLOPE1_BPS)
            .saturating_add(steep_increase)
    }
}

/// Calculate supply APY for LPs
/// Supply APY = Borrow APR * Utilization * (1 - protocol_fee)
pub fn calculate_supply_rate(total_deposits: u64, total_borrowed: u64) -> u64 {
    if total_deposits == 0 {
        return 0;
    }
    
    let borrow_rate = calculate_borrow_rate(total_deposits, total_borrowed);
    
    let utilization_bps = (total_borrowed as u128)
        .saturating_mul(10000)
        .checked_div(total_deposits as u128)
        .unwrap_or(0) as u64;
    
    // Supply rate = borrow_rate * utilization * (1 - protocol_fee)
    let gross_supply_rate = (borrow_rate as u128)
        .saturating_mul(utilization_bps as u128)
        .checked_div(10000)
        .unwrap_or(0) as u64;
    
    // Deduct protocol fee
    let net_supply_rate = gross_supply_rate
        .saturating_mul(10000_u64.saturating_sub(PROTOCOL_FEE_BPS))
        .checked_div(10000)
        .unwrap_or(0);
    
    net_supply_rate
}

/// Calculate protocol revenue from interest
pub fn calculate_protocol_fee(interest_amount: u64) -> u64 {
    interest_amount
        .saturating_mul(PROTOCOL_FEE_BPS)
        .checked_div(10000)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_rates_at_different_utilizations() {
        // 0% utilization
        assert_eq!(calculate_borrow_rate(1000, 0), 300); // 3% base
        
        // 50% utilization
        let rate_50 = calculate_borrow_rate(1000, 500);
        assert!(rate_50 > 300 && rate_50 < 1100); // Between 3% and 11%
        
        // 80% utilization (optimal)
        let rate_80 = calculate_borrow_rate(1000, 800);
        assert_eq!(rate_80, 300 + 800); // 3% + 8% = 11%
        
        // 95% utilization (above optimal - steep)
        let rate_95 = calculate_borrow_rate(1000, 950);
        assert!(rate_95 > 1100); // Much higher than 11%
    }
    
    #[test]
    fn test_supply_rate_less_than_borrow() {
        let borrow = calculate_borrow_rate(1000, 500);
        let supply = calculate_supply_rate(1000, 500);
        assert!(supply < borrow);
    }
}
