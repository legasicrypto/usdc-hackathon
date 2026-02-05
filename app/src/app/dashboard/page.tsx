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

function Dashboard() {
  const { connected } = useWallet();
  const searchParams = useSearchParams();
  const isDemoMode = searchParams.get("demo") === "true";
  
  const realLegasi = useLegasi();
  const demoLegasi = useLegasiDemo();
  const legasi = isDemoMode ? demoLegasi : realLegasi;
  
  const [depositAmount, setDepositAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"supply" | "borrow" | "agent">("supply");

  const collateralValue = legasi.position?.collaterals.reduce((sum, c) => 
    sum + (c.amount.toNumber() / 1e9 * 100), 0
  ) || 0;
  
  const borrowedValue = legasi.position?.borrows.reduce((sum, b) => 
    sum + (b.amount.toNumber() / 1e6), 0
  ) || 0;

  const reputationScore = legasi.position?.reputation 
    ? Math.min(
        (legasi.position.reputation.successfulRepayments * 50) + 
        Math.min(legasi.position.reputation.accountAgeDays / 30 * 10, 100) -
        (legasi.position.reputation.gadEvents * 100),
        500
      )
    : 0;

  const ltvBonus = reputationScore >= 400 ? 5 : reputationScore >= 200 ? 3 : reputationScore >= 100 ? 1 : 0;

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
        <div className="bg-gradient-to-r from-[#FF4E00]/20 to-[#FF8C00]/20 border-b border-[#FF4E00]/30">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-center gap-2">
            <span className="animate-pulse">🎮</span>
            <span className="text-[#FF4E00] font-medium text-sm">DEMO MODE</span>
            <span className="text-[#8a9aa8] text-sm">— Transactions are simulated</span>
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

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Supplied" value={`$${collateralValue.toFixed(2)}`} />
          <MetricCard label="Borrowed" value={`$${borrowedValue.toFixed(2)}`} />
          <MetricCard 
            label="LTV" 
            value={`${legasi.ltv.toFixed(1)}%`}
            color={legasi.ltv > 70 ? "#ff6b6b" : legasi.ltv > 50 ? "#ffd93d" : "#FF4E00"}
          />
          <MetricCard 
            label="Reputation" 
            value={reputationScore.toString()}
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
              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-[#051525] border border-[#0a2535] rounded-xl mb-6 w-fit">
                {(["supply", "borrow", "agent"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      activeTab === tab
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
                {activeTab === "supply" && (
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Supply Collateral</h3>
                    <p className="text-sm text-[#6a7a88] mb-6">
                      Deposit SOL as collateral to borrow against
                    </p>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            className="w-full h-14 bg-[#001520] border border-[#0a2535] rounded-xl px-4 pr-16 text-white placeholder-[#3a4a58] focus:outline-none focus:border-[#FF4E00] focus:shadow-lg focus:shadow-[#FF4E00]/10 transition-all"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a7a88] text-sm font-medium">
                            SOL
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          legasi.depositSol(parseFloat(depositAmount));
                          setDepositAmount("");
                        }}
                        disabled={legasi.loading || !depositAmount}
                        className="h-14 px-8 bg-[#FF4E00] hover:bg-[#E64500] text-white font-semibold rounded-xl transition-all hover:scale-105 disabled:bg-[#0a2535] disabled:text-[#3a4a58] disabled:hover:scale-100"
                      >
                        Supply
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "borrow" && (
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Borrow</h3>
                    <p className="text-sm text-[#6a7a88] mb-6">
                      Borrow USDC against your collateral
                    </p>
                    <div className="flex gap-3 mb-6">
                      <div className="flex-1">
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={borrowAmount}
                            onChange={(e) => setBorrowAmount(e.target.value)}
                            className="w-full h-14 bg-[#001520] border border-[#0a2535] rounded-xl px-4 pr-16 text-white placeholder-[#3a4a58] focus:outline-none focus:border-[#FF4E00] focus:shadow-lg focus:shadow-[#FF4E00]/10 transition-all"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a7a88] text-sm font-medium">
                            USDC
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          legasi.borrow(parseFloat(borrowAmount));
                          setBorrowAmount("");
                        }}
                        disabled={legasi.loading || !borrowAmount}
                        className="h-14 px-8 bg-[#FF4E00] hover:bg-[#E64500] text-white font-semibold rounded-xl transition-all hover:scale-105 disabled:bg-[#0a2535] disabled:text-[#3a4a58] disabled:hover:scale-100"
                      >
                        Borrow
                      </button>
                    </div>
                    <div className="flex justify-between text-sm p-4 bg-[#001520]/50 rounded-xl">
                      <span className="text-[#6a7a88]">Available to borrow</span>
                      <span className="text-[#FF4E00] font-semibold">
                        ${Math.max(0, collateralValue * (0.75 + ltvBonus/100) - borrowedValue).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === "agent" && (
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Agent Configuration</h3>
                    <p className="text-sm text-[#6a7a88] mb-6">
                      Configure autonomous borrowing for AI agents
                    </p>
                    <div className="space-y-3">
                      <AgentButton
                        title="Standard"
                        description="$1,000/day • Auto-repay • x402"
                        onClick={() => legasi.configureAgent(1000, true, true)}
                        loading={legasi.loading}
                      />
                      <AgentButton
                        title="Pro"
                        description="$5,000/day • Auto-repay • x402"
                        onClick={() => legasi.configureAgent(5000, true, true)}
                        loading={legasi.loading}
                        highlighted
                      />
                      <AgentButton
                        title="Disable"
                        description="Manual control only"
                        onClick={() => legasi.configureAgent(0, false, false)}
                        loading={legasi.loading}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Reputation */}
              <div className="p-5 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm card-hover">
                <h3 className="text-sm font-medium text-[#8a9aa8] mb-4">Reputation Score</h3>
                <div className="space-y-3">
                  <InfoRow label="Repayments" value={legasi.position?.reputation.successfulRepayments || 0} />
                  <InfoRow 
                    label="Total Repaid" 
                    value={`$${((legasi.position?.reputation.totalRepaidUsd.toNumber() || 0) / 1e6).toFixed(0)}`} 
                  />
                  <InfoRow 
                    label="GAD Events" 
                    value={legasi.position?.reputation.gadEvents || 0}
                    negative
                  />
                  <InfoRow 
                    label="Account Age" 
                    value={`${legasi.position?.reputation.accountAgeDays || 0}d`} 
                  />
                  <div className="pt-3 border-t border-[#0a2535]">
                    <InfoRow 
                      label="LTV Bonus" 
                      value={`+${ltvBonus}%`}
                      highlight
                    />
                  </div>
                </div>
              </div>

              {/* Protection */}
              <div className="p-5 bg-gradient-to-br from-[#0a2535] to-[#051525] border border-[#FF4E00]/20 rounded-2xl card-hover">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FF4E00]/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#FF4E00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold">GAD Protection</h3>
                </div>
                <p className="text-xs text-[#6a7a88] leading-relaxed">
                  No sudden liquidations. Positions unwound gradually, protecting you from MEV.
                </p>
              </div>

              {/* Links */}
              <div className="p-5 bg-[#051525]/80 border border-[#0a2535] rounded-2xl backdrop-blur-sm card-hover">
                <h3 className="text-sm font-medium text-[#8a9aa8] mb-4">Resources</h3>
                <div className="space-y-2">
                  <LinkRow href="https://github.com/legasicrypto/colosseum-agent-hackathon" label="Documentation" />
                  <LinkRow href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol" label="Vote on Colosseum" />
                  <LinkRow href="https://x.com/legasi_xyz" label="Twitter" />
                </div>
              </div>
            </div>
          </div>
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
      <div className="text-2xl font-bold group-hover:scale-105 transition-transform origin-left" style={{ color: color || "white" }}>{value}</div>
      {subtitle && <div className="text-xs text-[#FF4E00] mt-2 font-medium">{subtitle}</div>}
    </div>
  );
}

function AgentButton({ 
  title, 
  description, 
  onClick, 
  loading,
  highlighted 
}: { 
  title: string; 
  description: string; 
  onClick: () => void;
  loading: boolean;
  highlighted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full p-5 rounded-xl text-left transition-all hover:scale-[1.02] ${
        highlighted 
          ? "bg-gradient-to-br from-[#FF4E00]/10 to-[#FF4E00]/5 border border-[#FF4E00]/30 hover:border-[#FF4E00]"
          : "bg-[#001520] border border-[#0a2535] hover:border-[#1a3545]"
      } disabled:opacity-50 disabled:hover:scale-100`}
    >
      <div className="font-semibold">{title}</div>
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
      <span className={
        highlight ? "text-[#FF4E00] font-semibold" : 
        negative && value !== 0 ? "text-red-400" : 
        "text-white font-medium"
      }>
        {value}
      </span>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      className="flex items-center justify-between text-sm text-[#6a7a88] hover:text-[#FF4E00] transition-colors py-1"
    >
      <span>{label}</span>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  );
}
