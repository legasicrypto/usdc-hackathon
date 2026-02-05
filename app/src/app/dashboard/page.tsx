"use client";

import { useState, Suspense } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useLegasi } from "@/hooks/useLegasi";
import { useLegasiDemo } from "@/hooks/useLegasiDemo";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Wrapper for Suspense boundary
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#001520] text-white flex items-center justify-center">
      <div className="animate-pulse text-[#FF4E00]">Loading...</div>
    </div>
  );
}

// Asset type helper (Anchor enums are objects like { sol: {} })
function isAssetType(assetType: unknown, name: string): boolean {
  if (typeof assetType === 'object' && assetType !== null) {
    return name.toLowerCase() in assetType || name in assetType;
  }
  return false;
}

// For numeric comparison (demo mode)
const ASSET_TYPES = {
  SOL: 0,
  cbBTC: 1,
  USDC: 2,
  EURC: 3,
};

// Asset prices (mock for demo)
const PRICES = {
  SOL: 100,
  cbBTC: 45000,
  USDC: 1,
  EURC: 1.08,
};

// Interest rates
const BORROW_APY = {
  USDC: 8.5,
  EURC: 7.2,
};

const SUPPLY_APY = {
  USDC: 5.2,
  EURC: 4.8,
};

function Dashboard() {
  const { connected } = useWallet();
  const searchParams = useSearchParams();
  const isDemoMode = searchParams.get("demo") === "true";
  
  const realLegasi = useLegasi();
  const demoLegasi = useLegasiDemo();
  const legasi = isDemoMode ? demoLegasi : realLegasi;
  
  // UI State
  const [mainTab, setMainTab] = useState<"borrow" | "lp">("borrow");
  const [actionTab, setActionTab] = useState<"supply" | "borrow" | "repay" | "withdraw">("supply");
  const [lpTab, setLpTab] = useState<"deposit" | "withdraw">("deposit");
  
  // Form state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositAsset, setDepositAsset] = useState<"SOL" | "cbBTC">("SOL");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [borrowAsset, setBorrowAsset] = useState<"USDC" | "EURC">("USDC");
  const [repayAmount, setRepayAmount] = useState("");
  const [repayAsset, setRepayAsset] = useState<"USDC" | "EURC">("USDC");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAsset, setWithdrawAsset] = useState<"SOL" | "cbBTC">("SOL");
  const [lpAmount, setLpAmount] = useState("");
  const [lpAsset, setLpAsset] = useState<"USDC" | "EURC">("USDC");
  
  // Agent config state (persisted in demo)
  const [agentConfig, setAgentConfig] = useState({
    enabled: false,
    dailyLimit: 0,
    autoRepay: false,
    x402Enabled: false,
  });

  // LP state
  const [lpPosition, setLpPosition] = useState({
    USDC: 0,
    EURC: 0,
  });

  // Calculate values
  const collateralValue = legasi.position?.collaterals.reduce((sum, c) => {
    // Handle both numeric (demo) and object (real) asset types
    const isSol = typeof c.assetType === 'number' 
      ? c.assetType === ASSET_TYPES.SOL 
      : isAssetType(c.assetType, 'sol');
    const price = isSol ? PRICES.SOL : PRICES.cbBTC;
    const decimals = isSol ? 1e9 : 1e8;
    return sum + (c.amount.toNumber() / decimals * price);
  }, 0) || 0;
  
  const borrowedValue = legasi.position?.borrows.reduce((sum, b) => {
    const isUSDC = typeof b.assetType === 'number'
      ? b.assetType === ASSET_TYPES.USDC
      : isAssetType(b.assetType, 'usdc');
    const price = isUSDC ? PRICES.USDC : PRICES.EURC;
    return sum + ((b.amount.toNumber() + b.accruedInterest.toNumber()) / 1e6 * price);
  }, 0) || 0;

  const reputationScore = legasi.position?.reputation 
    ? Math.min(
        (legasi.position.reputation.successfulRepayments * 50) + 
        Math.min(legasi.position.reputation.accountAgeDays / 30 * 10, 100) -
        (legasi.position.reputation.gadEvents * 100),
        500
      )
    : 0;

  const ltvBonus = reputationScore >= 400 ? 5 : reputationScore >= 200 ? 3 : reputationScore >= 100 ? 1 : 0;
  const maxLTV = 75 + ltvBonus;
  const currentLTV = collateralValue > 0 ? (borrowedValue / collateralValue) * 100 : 0;
  const healthFactor = collateralValue > 0 ? (collateralValue * maxLTV / 100) / Math.max(borrowedValue, 1) : 0;
  const maxBorrow = Math.max(0, collateralValue * maxLTV / 100 - borrowedValue);
  
  // Calculate max withdrawable (must keep LTV under maxLTV after withdraw)
  // Formula: (collateral - withdraw) * maxLTV/100 >= borrowed
  // withdraw <= collateral - (borrowed * 100 / maxLTV)
  const minCollateralRequired = borrowedValue > 0 ? (borrowedValue * 100 / maxLTV) : 0;
  const maxWithdrawValue = Math.max(0, collateralValue - minCollateralRequired);

  // Get borrowed asset types for repay filter
  const borrowedAssetTypes = legasi.position?.borrows.map(b => b.assetType) || [];
  const hasBorrowedUSDC = borrowedAssetTypes.includes(ASSET_TYPES.USDC);
  const hasBorrowedEURC = borrowedAssetTypes.includes(ASSET_TYPES.EURC);

  // Protocol stats (mock - coherent with 100% utilization)
  // LP Pool = $2M, All borrowed = $2M, Collateral = $1.5M
  const protocolStats = {
    lpPool: 2_000_000,
    totalCollateral: 1_500_000,
    totalBorrowed: 2_000_000,
    get tvl() { return this.lpPool + this.totalCollateral; },
    get utilization() { return (this.totalBorrowed / this.lpPool) * 100; },
  };

  // LP totals
  const lpTotalValue = lpPosition.USDC + lpPosition.EURC * PRICES.EURC;

  if (!connected) {
    return (
      <div className="min-h-screen bg-[#001520] text-white flex flex-col gradient-bg">
        <Nav />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="relative">
            <div className="absolute inset-0 bg-[#FF4E00]/20 rounded-full blur-3xl scale-150"></div>
            <img src="/legasi-logo.svg" alt="Legasi" className="h-16 w-auto mb-6 relative z-10" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Connect Wallet</h1>
          <p className="text-[#6a7a88] mb-8 text-center max-w-sm">
            Connect your wallet to access the Legasi protocol
          </p>
          <WalletMultiButton className="!bg-[#FF4E00] !hover:bg-[#E64500] !text-white !font-semibold !rounded-xl !h-14 !px-8 !transition-all" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#001520] text-white gradient-bg">
      <Nav />
      
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-gradient-to-r from-[#FF4E00]/10 to-[#FF8C00]/10 border-b border-[#FF4E00]/20">
          <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center justify-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#FF4E00] animate-pulse"></div>
            <span className="text-[#FF4E00] font-medium text-xs tracking-wider uppercase">Demo Mode</span>
            <span className="text-[#6a7a88] text-xs">Transactions are simulated</span>
          </div>
        </div>
      )}
      
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Error */}
        {legasi.error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-fade-in-up">
            {legasi.error}
          </div>
        )}

        {/* Protocol Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-[#051525]/50 border border-[#0a2535] rounded-xl">
          <div className="text-center">
            <div className="text-xs text-[#6a7a88] uppercase tracking-wider">Protocol TVL</div>
            <div className="text-lg font-bold text-white">${((protocolStats.lpPool + protocolStats.totalCollateral) / 1e6).toFixed(1)}M</div>
          </div>
          <div className="text-center border-x border-[#0a2535]">
            <div className="text-xs text-[#6a7a88] uppercase tracking-wider">LP Pool</div>
            <div className="text-lg font-bold text-white">${(protocolStats.lpPool / 1e6).toFixed(1)}M</div>
          </div>
          <div className="text-center border-r border-[#0a2535]">
            <div className="text-xs text-[#6a7a88] uppercase tracking-wider">Total Borrowed</div>
            <div className="text-lg font-bold text-white">${(protocolStats.totalBorrowed / 1e6).toFixed(1)}M</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[#6a7a88] uppercase tracking-wider">Utilization</div>
            <div className="text-lg font-bold text-[#FF4E00]">{((protocolStats.totalBorrowed / protocolStats.lpPool) * 100).toFixed(0)}%</div>
          </div>
        </div>

        {/* Main Tab Selector - Borrow vs LP */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setMainTab("borrow")}
            className={`flex-1 py-4 rounded-xl font-medium transition-all ${
              mainTab === "borrow"
                ? "bg-[#FF4E00] text-white"
                : "bg-[#051525]/80 text-[#8a9aa8] border border-[#0a2535] hover:border-[#1a3545] hover:text-white"
            }`}
          >
            Borrow
          </button>
          <button
            onClick={() => setMainTab("lp")}
            className={`flex-1 py-4 rounded-xl font-medium transition-all ${
              mainTab === "lp"
                ? "bg-[#FF4E00] text-white"
                : "bg-[#051525]/80 text-[#8a9aa8] border border-[#0a2535] hover:border-[#1a3545] hover:text-white"
            }`}
          >
            Provide Liquidity
          </button>
        </div>

        {/* BORROW VIEW */}
        {mainTab === "borrow" && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <MetricCard label="Supplied" value={`$${collateralValue.toFixed(2)}`} />
              <MetricCard label="Borrowed" value={`$${borrowedValue.toFixed(2)}`} />
              <MetricCard 
                label="LTV" 
                value={`${legasi.ltv.toFixed(1)}%`}
                subtitle={`Max: ${maxLTV}%`}
                color={legasi.ltv > 70 ? "#ff6b6b" : legasi.ltv > 50 ? "#ffd93d" : "#FF4E00"}
              />
              <MetricCard 
                label="Health"
                value={healthFactor > 100 ? "Safe" : healthFactor.toFixed(2)}
                color={healthFactor > 1.5 ? "#4ade80" : healthFactor > 1.1 ? "#ffd93d" : "#ff6b6b"}
              />
              <MetricCard 
                label="Reputation" 
                value={Math.floor(reputationScore).toString()}
                subtitle={ltvBonus > 0 ? `+${ltvBonus}% LTV` : undefined}
              />
            </div>

            {/* Initialize */}
            {!legasi.hasPosition && (
              <div className="mb-8 p-10 bg-[#051525]/80 border border-[#0a2535] rounded-2xl text-center backdrop-blur-sm card-shine">
                <h2 className="text-2xl font-bold mb-3">Get Started</h2>
                <p className="text-[#6a7a88] mb-8">Initialize your position to start using Legasi</p>
                <button
                  onClick={() => legasi.initializePosition()}
                  disabled={legasi.loading}
                  className="h-14 px-10 bg-[#FF4E00] hover:bg-[#E64500] text-white font-semibold rounded-xl transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#FF4E00]/30 disabled:opacity-50 glow-btn"
                >
                  {legasi.loading ? "Initializing..." : "Initialize Position"}
                </button>
              </div>
            )}

            {legasi.hasPosition && (
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Main Panel */}
                <div className="lg:col-span-2">
                  {/* Action Tabs */}
                  <div className="flex gap-1 p-1 bg-[#051525] border border-[#0a2535] rounded-xl mb-6">
                    {(["supply", "borrow", "repay", "withdraw"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActionTab(tab)}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
                          actionTab === tab
                            ? "bg-[#FF4E00] text-white shadow-lg shadow-[#FF4E00]/20"
                            : "text-[#6a7a88] hover:text-white hover:bg-[#0a2535]"
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Content */}
                  <div className="p-6 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm card-shine">
                    {/* SUPPLY */}
                    {actionTab === "supply" && (
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Supply Collateral</h3>
                        <p className="text-sm text-[#6a7a88] mb-6">
                          Deposit collateral to borrow against
                        </p>
                        
                        {/* Asset selector */}
                        <div className="flex gap-2 mb-4">
                          {(["SOL", "cbBTC"] as const).map((asset) => (
                            <button
                              key={asset}
                              onClick={() => setDepositAsset(asset)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                depositAsset === asset
                                  ? "bg-[#FF4E00]/20 text-[#FF4E00] border border-[#FF4E00]"
                                  : "bg-[#001520] text-[#6a7a88] border border-[#0a2535] hover:border-[#FF4E00]/30"
                              }`}
                            >
                              {asset}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-3">
                          <div className="flex-1 relative">
                            <input
                              type="number"
                              placeholder="0.00"
                              value={depositAmount}
                              onChange={(e) => setDepositAmount(e.target.value)}
                              className="w-full h-14 bg-[#001520] border border-[#0a2535] rounded-xl px-4 pr-20 text-white placeholder-[#3a4a58] focus:outline-none focus:border-[#FF4E00] transition-all"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a7a88] text-sm font-medium">
                              {depositAsset}
                            </span>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                if (isDemoMode) {
                                  await demoLegasi.depositCollateral(parseFloat(depositAmount), depositAsset);
                                } else {
                                  console.log("Depositing", parseFloat(depositAmount), depositAsset);
                                  await realLegasi.depositSol(parseFloat(depositAmount));
                                }
                                setDepositAmount("");
                              } catch (err) {
                                console.error("Deposit error:", err);
                                alert(`Deposit failed: ${err instanceof Error ? err.message : String(err)}`);
                              }
                            }}
                            disabled={legasi.loading || !depositAmount}
                            className="h-14 px-8 bg-[#FF4E00] hover:bg-[#E64500] text-white font-semibold rounded-xl transition-all hover:scale-105 disabled:bg-[#0a2535] disabled:text-[#3a4a58] disabled:hover:scale-100"
                          >
                            Supply
                          </button>
                        </div>
                        <div className="mt-3 text-xs text-[#6a7a88]">
                          ≈ ${(parseFloat(depositAmount || "0") * PRICES[depositAsset]).toFixed(2)} USD
                        </div>
                      </div>
                    )}

                    {/* BORROW */}
                    {actionTab === "borrow" && (
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Borrow</h3>
                        <p className="text-sm text-[#6a7a88] mb-6">
                          Borrow stablecoins against your collateral
                        </p>
                        
                        {/* Asset selector */}
                        <div className="flex gap-2 mb-4">
                          {(["USDC", "EURC"] as const).map((asset) => (
                            <button
                              key={asset}
                              onClick={() => setBorrowAsset(asset)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                borrowAsset === asset
                                  ? "bg-[#FF4E00]/20 text-[#FF4E00] border border-[#FF4E00]"
                                  : "bg-[#001520] text-[#6a7a88] border border-[#0a2535] hover:border-[#FF4E00]/30"
                              }`}
                            >
                              {asset}
                              <span className="text-xs opacity-60">{BORROW_APY[asset]}% APY</span>
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-3 mb-4">
                          <div className="flex-1 relative">
                            <input
                              type="number"
                              placeholder="0.00"
                              value={borrowAmount}
                              onChange={(e) => setBorrowAmount(e.target.value)}
                              className="w-full h-14 bg-[#001520] border border-[#0a2535] rounded-xl px-4 pr-20 text-white placeholder-[#3a4a58] focus:outline-none focus:border-[#FF4E00] transition-all"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a7a88] text-sm font-medium">
                              {borrowAsset}
                            </span>
                          </div>
                          <button
                            onClick={() => setBorrowAmount(maxBorrow.toFixed(2))}
                            className="h-14 px-4 bg-[#0a2535] hover:bg-[#1a3545] text-[#FF4E00] font-medium rounded-xl transition-all"
                          >
                            MAX
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                if (isDemoMode) {
                                  await demoLegasi.borrowAsset(parseFloat(borrowAmount), borrowAsset);
                                } else {
                                  console.log("Borrowing", parseFloat(borrowAmount), "USDC");
                                  await realLegasi.borrow(parseFloat(borrowAmount));
                                }
                                setBorrowAmount("");
                              } catch (err) {
                                console.error("Borrow error:", err);
                                alert(`Borrow failed: ${err instanceof Error ? err.message : String(err)}`);
                              }
                            }}
                            disabled={legasi.loading || !borrowAmount}
                            className="h-14 px-8 bg-[#FF4E00] hover:bg-[#E64500] text-white font-semibold rounded-xl transition-all hover:scale-105 disabled:bg-[#0a2535] disabled:text-[#3a4a58] disabled:hover:scale-100"
                          >
                            Borrow
                          </button>
                        </div>
                        
                        <div className="p-4 bg-[#001520]/50 rounded-xl space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-[#6a7a88]">Available to borrow</span>
                            <span className="text-[#FF4E00] font-semibold">${maxBorrow.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-[#6a7a88]">Borrow APY</span>
                            <span className="text-white">{BORROW_APY[borrowAsset]}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* REPAY */}
                    {actionTab === "repay" && (
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Repay</h3>
                        <p className="text-sm text-[#6a7a88] mb-6">
                          Repay your borrowed amount to unlock collateral
                        </p>
                        
                        {/* No debt message */}
                        {borrowedValue === 0 && (
                          <div className="p-6 bg-[#001520]/50 rounded-xl text-center">
                            <p className="text-[#6a7a88]">You have no outstanding debt to repay</p>
                          </div>
                        )}
                        
                        {borrowedValue > 0 && (
                          <>
                            {/* Asset selector - only show borrowed assets */}
                            <div className="flex gap-2 mb-4">
                              {(["USDC", "EURC"] as const).filter(asset => 
                                asset === "USDC" ? hasBorrowedUSDC : hasBorrowedEURC
                              ).map((asset) => (
                                <button
                                  key={asset}
                                  onClick={() => setRepayAsset(asset)}
                                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    repayAsset === asset
                                      ? "bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]"
                                      : "bg-[#001520] text-[#6a7a88] border border-[#0a2535] hover:border-[#4ade80]/30"
                                  }`}
                                >
                                  {asset}
                                </button>
                              ))}
                            </div>

                            <div className="flex gap-3 mb-4">
                              <div className="flex-1 relative">
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  value={repayAmount}
                                  onChange={(e) => setRepayAmount(e.target.value)}
                                  className="w-full h-14 bg-[#001520] border border-[#0a2535] rounded-xl px-4 pr-20 text-white placeholder-[#3a4a58] focus:outline-none focus:border-[#4ade80] transition-all"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a7a88] text-sm font-medium">
                                  {repayAsset}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  // Get the borrowed amount for the selected asset
                                  const targetAsset = repayAsset.toLowerCase();
                                  const assetBorrow = legasi.position?.borrows.find(b => 
                                    typeof b.assetType === 'number'
                                      ? b.assetType === (repayAsset === "USDC" ? ASSET_TYPES.USDC : ASSET_TYPES.EURC)
                                      : isAssetType(b.assetType, targetAsset)
                                  );
                                  if (assetBorrow) {
                                    const total = (assetBorrow.amount.toNumber() + assetBorrow.accruedInterest.toNumber()) / 1e6;
                                    setRepayAmount(total.toFixed(2));
                                  }
                                }}
                                className="h-14 px-4 bg-[#0a2535] hover:bg-[#1a3545] text-[#4ade80] font-medium rounded-xl transition-all"
                              >
                                MAX
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    if (isDemoMode) {
                                      await demoLegasi.repay(parseFloat(repayAmount), repayAsset);
                                    } else {
                                      console.log("Repaying", parseFloat(repayAmount), repayAsset);
                                      await realLegasi.repay(parseFloat(repayAmount), repayAsset);
                                    }
                                    setRepayAmount("");
                                  } catch (err) {
                                    console.error("Repay error:", err);
                                    alert(`Repay failed: ${err instanceof Error ? err.message : String(err)}`);
                                  }
                                }}
                                disabled={legasi.loading || !repayAmount}
                                className="h-14 px-8 bg-[#4ade80] hover:bg-[#22c55e] text-black font-semibold rounded-xl transition-all hover:scale-105 disabled:bg-[#0a2535] disabled:text-[#3a4a58] disabled:hover:scale-100"
                              >
                                Repay
                              </button>
                            </div>
                          </>
                        )}
                        
                        <div className="p-4 bg-[#001520]/50 rounded-xl space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-[#6a7a88]">Total borrowed</span>
                            <span className="text-white font-semibold">${borrowedValue.toFixed(2)}</span>
                          </div>
                          {borrowedValue > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-[#6a7a88]">Repay to unlock</span>
                              <span className="text-[#4ade80]">${collateralValue.toFixed(2)} collateral</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* WITHDRAW */}
                    {actionTab === "withdraw" && (() => {
                      // Get user's collateral for selected asset
                      const targetAsset = withdrawAsset.toLowerCase();
                      const assetCollateral = legasi.position?.collaterals.find(c => 
                        typeof c.assetType === 'number'
                          ? c.assetType === (withdrawAsset === "SOL" ? ASSET_TYPES.SOL : ASSET_TYPES.cbBTC)
                          : isAssetType(c.assetType, targetAsset)
                      );
                      const decimals = withdrawAsset === "SOL" ? 1e9 : 1e8;
                      const userBalanceInAsset = assetCollateral ? assetCollateral.amount.toNumber() / decimals : 0;
                      const userBalanceValue = userBalanceInAsset * PRICES[withdrawAsset];
                      
                      // Max withdrawable: min of (user balance, LTV-constrained max)
                      const maxWithdrawInAsset = Math.min(userBalanceInAsset, maxWithdrawValue / PRICES[withdrawAsset]);
                      const withdrawAmountNum = parseFloat(withdrawAmount) || 0;
                      const exceedsBalance = withdrawAmountNum > userBalanceInAsset;
                      const exceedsLTV = withdrawAmountNum * PRICES[withdrawAsset] > maxWithdrawValue && borrowedValue > 0;
                      
                      return (
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Withdraw Collateral</h3>
                        <p className="text-sm text-[#6a7a88] mb-6">
                          {borrowedValue > 0 
                            ? `You can withdraw up to $${maxWithdrawValue.toFixed(2)} while maintaining your LTV under ${maxLTV}%`
                            : "Withdraw your supplied collateral"
                          }
                        </p>
                        
                        {/* Warning if has debt and can't withdraw */}
                        {borrowedValue > 0 && maxWithdrawValue === 0 && (
                          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                            You must repay your debt before withdrawing collateral. Current LTV: {currentLTV.toFixed(1)}%
                          </div>
                        )}
                        
                        {/* Asset selector */}
                        <div className="flex gap-2 mb-4">
                          {(["SOL", "cbBTC"] as const).map((asset) => (
                            <button
                              key={asset}
                              onClick={() => setWithdrawAsset(asset)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                withdrawAsset === asset
                                  ? "bg-[#FF4E00]/20 text-[#FF4E00] border border-[#FF4E00]"
                                  : "bg-[#001520] text-[#6a7a88] border border-[#0a2535] hover:border-[#FF4E00]/30"
                              }`}
                            >
                              {asset}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-3 mb-4">
                          <div className="flex-1 relative">
                            <input
                              type="number"
                              placeholder="0.00"
                              value={withdrawAmount}
                              onChange={(e) => setWithdrawAmount(e.target.value)}
                              className={`w-full h-14 bg-[#001520] border rounded-xl px-4 pr-20 text-white placeholder-[#3a4a58] focus:outline-none transition-all ${
                                exceedsBalance || exceedsLTV 
                                  ? "border-red-500/50 focus:border-red-500" 
                                  : "border-[#0a2535] focus:border-[#FF4E00]"
                              }`}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a7a88] text-sm font-medium">
                              {withdrawAsset}
                            </span>
                          </div>
                          {maxWithdrawInAsset > 0 && (
                            <button
                              onClick={() => {
                                setWithdrawAmount(maxWithdrawInAsset.toFixed(4));
                              }}
                              className="h-14 px-4 bg-[#0a2535] hover:bg-[#1a3545] text-[#FF4E00] font-medium rounded-xl transition-all"
                            >
                              MAX
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              try {
                                const actualAmount = Math.min(withdrawAmountNum, maxWithdrawInAsset);
                                if (isDemoMode) {
                                  await demoLegasi.withdraw(actualAmount, withdrawAsset);
                                } else {
                                  console.log("Withdrawing", actualAmount, withdrawAsset);
                                  await realLegasi.withdrawSol(actualAmount);
                                }
                                setWithdrawAmount("");
                              } catch (err) {
                                console.error("Withdraw error:", err);
                                alert(`Withdraw failed: ${err instanceof Error ? err.message : String(err)}`);
                              }
                            }}
                            disabled={legasi.loading || !withdrawAmount || userBalanceInAsset === 0 || (borrowedValue > 0 && maxWithdrawValue === 0)}
                            className="h-14 px-8 bg-[#FF4E00] hover:bg-[#E64500] text-white font-semibold rounded-xl transition-all hover:scale-105 disabled:bg-[#0a2535] disabled:text-[#3a4a58] disabled:hover:scale-100"
                          >
                            Withdraw
                          </button>
                        </div>
                        
                        {/* Validation messages */}
                        {exceedsBalance && (
                          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                            Insufficient balance. You only have {userBalanceInAsset.toFixed(4)} {withdrawAsset}
                          </div>
                        )}
                        {!exceedsBalance && exceedsLTV && (
                          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                            Amount exceeds LTV limit. Max withdrawable: {maxWithdrawInAsset.toFixed(4)} {withdrawAsset}
                          </div>
                        )}
                        
                        <div className="p-4 bg-[#001520]/50 rounded-xl space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-[#6a7a88]">Your {withdrawAsset} balance</span>
                            <span className="text-white font-semibold">{userBalanceInAsset.toFixed(4)} {withdrawAsset}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-[#6a7a88]">Total collateral value</span>
                            <span className="text-white font-semibold">${collateralValue.toFixed(2)}</span>
                          </div>
                          {borrowedValue > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-[#6a7a88]">Max withdrawable</span>
                              <span className="text-[#FF4E00] font-semibold">{maxWithdrawInAsset.toFixed(4)} {withdrawAsset}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );})()}
                  </div>

                  {/* Agent Configuration */}
                  <div className="mt-6 p-6 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-base font-semibold text-white">Agent Configuration</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        agentConfig.enabled 
                          ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20" 
                          : "bg-[#3a4a58]/20 text-[#6a7a88] border border-[#3a4a58]/20"
                      }`}>
                        {agentConfig.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <AgentButton
                        title="Standard"
                        description="$1,000/day"
                        active={agentConfig.enabled && agentConfig.dailyLimit === 1000}
                        onClick={() => {
                          setAgentConfig({ enabled: true, dailyLimit: 1000, autoRepay: true, x402Enabled: true });
                          legasi.configureAgent(1000, true, true);
                        }}
                        loading={legasi.loading}
                      />
                      <AgentButton
                        title="Pro"
                        description="$5,000/day"
                        active={agentConfig.enabled && agentConfig.dailyLimit === 5000}
                        onClick={() => {
                          setAgentConfig({ enabled: true, dailyLimit: 5000, autoRepay: true, x402Enabled: true });
                          legasi.configureAgent(5000, true, true);
                        }}
                        loading={legasi.loading}
                        highlighted
                      />
                      <AgentButton
                        title="Disable"
                        description="Manual only"
                        active={!agentConfig.enabled}
                        onClick={() => {
                          setAgentConfig({ enabled: false, dailyLimit: 0, autoRepay: false, x402Enabled: false });
                          legasi.configureAgent(0, false, false);
                        }}
                        loading={legasi.loading}
                      />
                    </div>
                    
                    {agentConfig.enabled && (
                      <div className="mt-4 p-4 bg-[#001520]/50 rounded-xl text-xs text-[#8a9aa8] space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-[#4ade80]"></div>
                          Auto-repay enabled
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-[#4ade80]"></div>
                          x402 payments enabled
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-[#4ade80]"></div>
                          Daily limit: ${agentConfig.dailyLimit.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                  {/* Positions */}
                  <div className="p-5 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm">
                    <h3 className="text-sm font-medium text-[#8a9aa8] mb-4">Your Positions</h3>
                    
                    {/* Collaterals */}
                    <div className="mb-4">
                      <div className="text-xs text-[#6a7a88] mb-2">Collateral</div>
                      {legasi.position?.collaterals.map((c, i) => {
                        const isSol = typeof c.assetType === 'number'
                          ? c.assetType === ASSET_TYPES.SOL
                          : isAssetType(c.assetType, 'sol');
                        const asset = isSol ? "SOL" : "cbBTC";
                        const decimals = isSol ? 1e9 : 1e8;
                        const amount = c.amount.toNumber() / decimals;
                        return (
                          <div key={i} className="flex justify-between py-2 border-b border-[#0a2535] last:border-0">
                            <span className="text-white">{asset}</span>
                            <span className="text-[#6a7a88]">{amount.toFixed(4)}</span>
                          </div>
                        );
                      })}
                      {(!legasi.position?.collaterals || legasi.position.collaterals.length === 0) && (
                        <div className="text-xs text-[#3a4a58] py-2">No collateral supplied</div>
                      )}
                    </div>
                    
                    {/* Borrows */}
                    <div>
                      <div className="text-xs text-[#6a7a88] mb-2">Borrowed</div>
                      {legasi.position?.borrows.map((b, i) => {
                        const isUSDC = typeof b.assetType === 'number'
                          ? b.assetType === ASSET_TYPES.USDC
                          : isAssetType(b.assetType, 'usdc');
                        const asset = isUSDC ? "USDC" : "EURC";
                        const amount = b.amount.toNumber() / 1e6;
                        const interest = b.accruedInterest.toNumber() / 1e6;
                        return (
                          <div key={i} className="flex justify-between py-2 border-b border-[#0a2535] last:border-0">
                            <span className="text-white">{asset}</span>
                            <div className="text-right">
                              <div className="text-[#6a7a88]">{amount.toFixed(2)}</div>
                              {interest > 0 && (
                                <div className="text-xs text-[#FF4E00]">+{interest.toFixed(4)} interest</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {(!legasi.position?.borrows || legasi.position.borrows.length === 0) && (
                        <div className="text-xs text-[#3a4a58] py-2">No active borrows</div>
                      )}
                    </div>
                  </div>

                  {/* Reputation */}
                  <div className="p-5 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm">
                    <h3 className="text-sm font-medium text-[#8a9aa8] mb-4">Reputation</h3>
                    <div className="space-y-3">
                      <InfoRow label="Score" value={Math.floor(reputationScore)} />
                      <InfoRow label="Repayments" value={legasi.position?.reputation.successfulRepayments || 0} />
                      <InfoRow label="GAD Events" value={legasi.position?.reputation.gadEvents || 0} negative />
                      <InfoRow label="Account Age" value={`${legasi.position?.reputation.accountAgeDays || 0}d`} />
                      <div className="pt-3 border-t border-[#0a2535]">
                        <InfoRow label="LTV Bonus" value={`+${ltvBonus}%`} highlight />
                      </div>
                    </div>
                  </div>

                  {/* GAD Protection */}
                  <div className="p-5 bg-gradient-to-br from-[#0a2535]/80 to-[#051525]/80 border border-[#FF4E00]/10 rounded-2xl">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#FF4E00]/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-[#FF4E00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-medium text-white">GAD Protection</h3>
                    </div>
                    <p className="text-xs text-[#6a7a88] leading-relaxed">
                      No sudden liquidations. Your position is unwound gradually over time, protecting you from MEV attacks.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* LP VIEW */}
        {mainTab === "lp" && (
          <>
            {/* LP Overview */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <MetricCard label="Your LP Value" value={`$${lpTotalValue.toFixed(2)}`} />
              <MetricCard label="USDC APY" value={`${SUPPLY_APY.USDC}%`} color="#4ade80" />
              <MetricCard label="EURC APY" value={`${SUPPLY_APY.EURC}%`} color="#4ade80" />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main LP Panel */}
              <div className="lg:col-span-2">
                {/* LP Tabs */}
                <div className="flex gap-1 p-1 bg-[#051525] border border-[#0a2535] rounded-xl mb-6 w-fit">
                  {(["deposit", "withdraw"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setLpTab(tab)}
                      className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        lpTab === tab
                          ? "bg-[#FF4E00] text-white"
                          : "text-[#6a7a88] hover:text-white hover:bg-[#0a2535]"
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="p-6 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm">
                  <h3 className="text-xl font-semibold mb-2">
                    {lpTab === "deposit" ? "Provide Liquidity" : "Withdraw Liquidity"}
                  </h3>
                  <p className="text-sm text-[#6a7a88] mb-6">
                    {lpTab === "deposit" 
                      ? "Earn yield by providing liquidity to the protocol"
                      : "Withdraw your provided liquidity"
                    }
                  </p>
                  
                  {/* Asset selector */}
                  <div className="flex gap-2 mb-4">
                    {(["USDC", "EURC"] as const).map((asset) => (
                      <button
                        key={asset}
                        onClick={() => setLpAsset(asset)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                          lpAsset === asset
                            ? "bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]"
                            : "bg-[#001520] text-[#6a7a88] border border-[#0a2535] hover:border-[#4ade80]/30"
                        }`}
                      >
                        {asset}
                        <span className="text-xs opacity-60">{SUPPLY_APY[asset]}% APY</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        placeholder="0.00"
                        value={lpAmount}
                        onChange={(e) => setLpAmount(e.target.value)}
                        className="w-full h-14 bg-[#001520] border border-[#0a2535] rounded-xl px-4 pr-20 text-white placeholder-[#3a4a58] focus:outline-none focus:border-[#4ade80] transition-all"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a7a88] text-sm font-medium">
                        {lpAsset}
                      </span>
                    </div>
                    {lpTab === "withdraw" && (
                      <button
                        onClick={() => setLpAmount(lpPosition[lpAsset].toString())}
                        className="h-14 px-4 bg-[#0a2535] hover:bg-[#1a3545] text-[#4ade80] font-medium rounded-xl transition-all"
                      >
                        MAX
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          const amount = parseFloat(lpAmount);
                          if (lpTab === "deposit") {
                            if (isDemoMode) {
                              await demoLegasi.lpDeposit(amount, lpAsset);
                              setLpPosition(prev => ({ ...prev, [lpAsset]: prev[lpAsset] + amount }));
                            } else {
                              console.log("LP Deposit", amount, lpAsset);
                              await realLegasi.lpDeposit(amount, lpAsset);
                              setLpPosition(prev => ({ ...prev, [lpAsset]: prev[lpAsset] + amount }));
                            }
                          } else {
                            if (isDemoMode) {
                              await demoLegasi.lpWithdraw(amount, lpAsset);
                              setLpPosition(prev => ({ ...prev, [lpAsset]: Math.max(0, prev[lpAsset] - amount) }));
                            } else {
                              console.log("LP Withdraw", amount, lpAsset);
                              await realLegasi.lpWithdraw(amount, lpAsset);
                              setLpPosition(prev => ({ ...prev, [lpAsset]: Math.max(0, prev[lpAsset] - amount) }));
                            }
                          }
                          setLpAmount("");
                        } catch (err) {
                          console.error("LP error:", err);
                          alert(`LP action failed: ${err instanceof Error ? err.message : String(err)}`);
                        }
                      }}
                      disabled={legasi.loading || !lpAmount}
                      className={`h-14 px-8 font-semibold rounded-xl transition-all hover:scale-105 disabled:bg-[#0a2535] disabled:text-[#3a4a58] disabled:hover:scale-100 ${
                        lpTab === "deposit"
                          ? "bg-[#4ade80] hover:bg-[#22c55e] text-black"
                          : "bg-[#FF4E00] hover:bg-[#E64500] text-white"
                      }`}
                    >
                      {lpTab === "deposit" ? "Deposit" : "Withdraw"}
                    </button>
                  </div>

                  <div className="mt-6 p-4 bg-[#001520]/50 rounded-xl space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6a7a88]">Your {lpAsset} in pool</span>
                      <span className="text-white font-semibold">{lpPosition[lpAsset].toFixed(2)} {lpAsset}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6a7a88]">Estimated yearly earnings</span>
                      <span className="text-[#4ade80] font-semibold">
                        ${(lpPosition[lpAsset] * SUPPLY_APY[lpAsset] / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* LP Sidebar */}
              <div className="space-y-4">
                {/* LP Positions */}
                <div className="p-5 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm">
                  <h3 className="text-sm font-medium text-[#8a9aa8] mb-4">Your LP Positions</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-[#0a2535]">
                      <span className="text-white">USDC</span>
                      <div className="text-right">
                        <div className="text-white font-medium">{lpPosition.USDC.toFixed(2)}</div>
                        <div className="text-xs text-[#4ade80]">{SUPPLY_APY.USDC}% APY</div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-white">EURC</span>
                      <div className="text-right">
                        <div className="text-white font-medium">{lpPosition.EURC.toFixed(2)}</div>
                        <div className="text-xs text-[#4ade80]">{SUPPLY_APY.EURC}% APY</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pool Stats */}
                <div className="p-5 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm">
                  <h3 className="text-sm font-medium text-[#8a9aa8] mb-4">Pool Statistics</h3>
                  <div className="space-y-3">
                    <InfoRow label="Total USDC Pool" value="$1.2M" />
                    <InfoRow label="Total EURC Pool" value="€850K" />
                    <InfoRow label="Utilization Rate" value={`${protocolStats.utilization}%`} />
                  </div>
                </div>

                {/* AI Agent LP Info */}
                <div className="p-5 bg-gradient-to-br from-[#0a2535]/80 to-[#051525]/80 border border-[#4ade80]/10 rounded-2xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#4ade80]/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-white">Agent-Native Protocol</h3>
                  </div>
                  <p className="text-xs text-[#6a7a88] leading-relaxed mb-2">
                    AI agents are first-class citizens: they can borrow autonomously AND provide liquidity to earn yield.
                  </p>
                  <div className="text-xs text-[#4ade80]/80 space-y-1">
                    <div>• Agents as borrowers: autonomous credit</div>
                    <div>• Agents as LPs: yield optimization</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 bg-[#001520]/80 backdrop-blur-xl border-b border-[#0a2535]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center group">
          <img src="/legasi-logo.svg" alt="Legasi" className="h-8 w-auto group-hover:scale-110 transition-transform" />
        </Link>
        <WalletMultiButton className="!bg-[#0a2535] !border !border-[#1a3545] !rounded-xl !h-10 !text-sm !transition-all hover:!border-[#FF4E00]/50" />
      </div>
    </nav>
  );
}

function MetricCard({ 
  label, 
  value, 
  subtitle,
  color 
}: { 
  label: string; 
  value: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="p-5 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm card-hover group">
      <div className="text-xs text-[#6a7a88] mb-2 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold truncate" style={{ color: color || "white" }}>{value}</div>
      {subtitle && <div className="text-xs text-[#FF4E00] mt-2 font-medium">{subtitle}</div>}
    </div>
  );
}

function AgentButton({ 
  title, 
  description, 
  onClick, 
  loading,
  highlighted,
  active
}: { 
  title: string; 
  description: string; 
  onClick: () => void;
  loading: boolean;
  highlighted?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`p-4 rounded-xl text-center transition-all hover:scale-[1.02] ${
        active
          ? "bg-[#FF4E00]/20 border-2 border-[#FF4E00]"
          : highlighted 
            ? "bg-gradient-to-br from-[#FF4E00]/10 to-[#FF4E00]/5 border border-[#FF4E00]/30 hover:border-[#FF4E00]"
            : "bg-[#001520] border border-[#0a2535] hover:border-[#1a3545]"
      } disabled:opacity-50 disabled:hover:scale-100`}
    >
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-[#6a7a88] mt-1">{description}</div>
    </button>
  );
}

function InfoRow({ 
  label, 
  value,
  negative,
  highlight
}: { 
  label: string; 
  value: string | number;
  negative?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-[#6a7a88]">{label}</span>
      <span className={`truncate ml-2 ${
        highlight ? "text-[#FF4E00] font-semibold" : 
        negative && value !== 0 ? "text-red-400" : 
        "text-white font-medium"
      }`}>
        {value}
      </span>
    </div>
  );
}

// Force dynamic rendering
export const dynamic = 'force-dynamic';
