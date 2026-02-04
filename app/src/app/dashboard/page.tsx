"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useLegasi } from "@/hooks/useLegasi";
import Link from "next/link";

export default function Dashboard() {
  const { connected } = useWallet();
  const legasi = useLegasi();
  
  const [depositAmount, setDepositAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"borrow" | "lp" | "agent">("borrow");

  // Calculate values
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
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
        {/* Nav */}
        <nav className="border-b border-white/5 px-6 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black">
                L
              </div>
              <span className="text-xl font-semibold">Legasi</span>
            </Link>
            <WalletMultiButton className="!bg-white/5 !border !border-white/10 !rounded-xl hover:!bg-white/10" />
          </div>
        </nav>

        {/* Connect Prompt */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-4xl mb-8">
            🤖
          </div>
          <h1 className="text-3xl font-bold mb-4">Agent Dashboard</h1>
          <p className="text-white/50 mb-8 text-center max-w-md">
            Connect your wallet to access the Legasi protocol. 
            Borrow, provide liquidity, and configure your AI agents.
          </p>
          <WalletMultiButton className="!bg-gradient-to-r !from-emerald-500 !to-cyan-500 !rounded-xl !px-8 !py-4 !text-lg !font-semibold" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black">
              L
            </div>
            <span className="text-xl font-semibold">Legasi</span>
          </Link>
          
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            {(["borrow", "lp", "agent"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {tab === "borrow" ? "Borrow" : tab === "lp" ? "Earn" : "Agent"}
              </button>
            ))}
          </div>

          <WalletMultiButton className="!bg-white/5 !border !border-white/10 !rounded-xl hover:!bg-white/10" />
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Display */}
        {legasi.error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
            {legasi.error}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Collateral"
            value={`$${collateralValue.toFixed(2)}`}
            subtext="SOL deposited"
          />
          <StatCard
            label="Borrowed"
            value={`$${borrowedValue.toFixed(2)}`}
            subtext="USDC"
          />
          <StatCard
            label="LTV"
            value={`${legasi.ltv.toFixed(1)}%`}
            subtext={`Max ${75 + ltvBonus}%`}
            highlight={legasi.ltv > 70 ? "danger" : legasi.ltv > 50 ? "warning" : "success"}
          />
          <StatCard
            label="Reputation"
            value={reputationScore.toString()}
            subtext={ltvBonus > 0 ? `+${ltvBonus}% LTV bonus` : "Build credit"}
            highlight="accent"
          />
        </div>

        {/* Initialize Position */}
        {!legasi.hasPosition && (
          <div className="mb-8 p-8 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-3xl mx-auto mb-6">
              ✨
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to Legasi</h2>
            <p className="text-white/50 mb-6 max-w-md mx-auto">
              Initialize your position to start borrowing against your collateral 
              and build your on-chain credit reputation.
            </p>
            <button
              onClick={() => legasi.initializePosition()}
              disabled={legasi.loading}
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl font-semibold text-lg hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50"
            >
              {legasi.loading ? "Initializing..." : "Initialize Position"}
            </button>
          </div>
        )}

        {/* Main Content */}
        {legasi.hasPosition && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column - Actions */}
            <div className="lg:col-span-2 space-y-6">
              {activeTab === "borrow" && (
                <>
                  {/* Deposit */}
                  <ActionCard title="Deposit Collateral" icon="📥">
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-emerald-500/50 transition"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">SOL</span>
                      </div>
                      <button
                        onClick={() => {
                          legasi.depositSol(parseFloat(depositAmount));
                          setDepositAmount("");
                        }}
                        disabled={legasi.loading || !depositAmount}
                        className="px-6 py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-white/10 disabled:text-white/30 rounded-xl font-semibold transition"
                      >
                        Deposit
                      </button>
                    </div>
                  </ActionCard>

                  {/* Borrow */}
                  <ActionCard title="Borrow" icon="💳">
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={borrowAmount}
                          onChange={(e) => setBorrowAmount(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-emerald-500/50 transition"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">USDC</span>
                      </div>
                      <button
                        onClick={() => {
                          legasi.borrow(parseFloat(borrowAmount));
                          setBorrowAmount("");
                        }}
                        disabled={legasi.loading || !borrowAmount}
                        className="px-6 py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/30 rounded-xl font-semibold transition"
                      >
                        Borrow
                      </button>
                    </div>
                    <p className="text-white/40 text-sm mt-3">
                      Available: ${(collateralValue * (0.75 + ltvBonus/100) - borrowedValue).toFixed(2)} USDC
                    </p>
                  </ActionCard>

                  {/* Repay - Coming Soon */}
                  <ActionCard title="Repay" icon="✅">
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={repayAmount}
                          onChange={(e) => setRepayAmount(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-emerald-500/50 transition"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">USDC</span>
                      </div>
                      <button
                        disabled={true}
                        className="px-6 py-4 bg-purple-500 hover:bg-purple-600 disabled:bg-white/10 disabled:text-white/30 rounded-xl font-semibold transition"
                      >
                        Soon
                      </button>
                    </div>
                    <p className="text-white/40 text-sm mt-3">Repay function coming in next deploy</p>
                  </ActionCard>
                </>
              )}

              {activeTab === "lp" && (
                <ActionCard title="Provide Liquidity" icon="💰">
                  <p className="text-white/50 mb-4">
                    Deposit USDC to earn yield from borrowers. Receive bUSDC LP tokens.
                  </p>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-emerald-500/50 transition"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">USDC</span>
                    </div>
                    <button
                      disabled={legasi.loading}
                      className="px-6 py-4 bg-yellow-500 hover:bg-yellow-600 disabled:bg-white/10 disabled:text-white/30 rounded-xl font-semibold transition"
                    >
                      Deposit
                    </button>
                  </div>
                  <div className="mt-4 p-4 bg-white/5 rounded-xl">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Current APY</span>
                      <span className="text-emerald-400 font-medium">~8.2%</span>
                    </div>
                  </div>
                </ActionCard>
              )}

              {activeTab === "agent" && (
                <ActionCard title="Agent Configuration" icon="🤖">
                  <p className="text-white/50 mb-6">
                    Configure autonomous borrowing for your AI agents. 
                    Set limits and enable x402 payments.
                  </p>
                  <div className="grid gap-4">
                    <AgentOption
                      title="Standard Agent"
                      description="$1,000/day limit • Auto-repay • x402"
                      onClick={() => legasi.configureAgent(1000, true, true)}
                      loading={legasi.loading}
                    />
                    <AgentOption
                      title="Pro Agent"
                      description="$5,000/day limit • Auto-repay • x402"
                      onClick={() => legasi.configureAgent(5000, true, true)}
                      loading={legasi.loading}
                      highlighted
                    />
                    <AgentOption
                      title="Disable Agent"
                      description="Manual control only"
                      onClick={() => legasi.configureAgent(0, false, false)}
                      loading={legasi.loading}
                      muted
                    />
                  </div>
                </ActionCard>
              )}
            </div>

            {/* Right Column - Info */}
            <div className="space-y-6">
              {/* Reputation Details */}
              <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                <h3 className="text-lg font-semibold mb-4">Reputation Score</h3>
                <div className="space-y-4">
                  <ReputationRow 
                    label="Successful Repayments" 
                    value={legasi.position?.reputation.successfulRepayments || 0} 
                  />
                  <ReputationRow 
                    label="Total Repaid" 
                    value={`$${((legasi.position?.reputation.totalRepaidUsd.toNumber() || 0) / 1e6).toFixed(0)}`} 
                  />
                  <ReputationRow 
                    label="GAD Events" 
                    value={legasi.position?.reputation.gadEvents || 0}
                    negative 
                  />
                  <ReputationRow 
                    label="Account Age" 
                    value={`${legasi.position?.reputation.accountAgeDays || 0} days`} 
                  />
                </div>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center">
                    <span className="text-white/50">LTV Bonus</span>
                    <span className="text-emerald-400 font-bold">+{ltvBonus}%</span>
                  </div>
                </div>
              </div>

              {/* GAD Protection */}
              <div className="p-6 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🛡️</span>
                  <h3 className="text-lg font-semibold">GAD Protection</h3>
                </div>
                <p className="text-white/50 text-sm">
                  Your position is protected by Gradual Auto-Deleveraging. 
                  No sudden liquidations — positions are unwound safely over time.
                </p>
              </div>

              {/* Links */}
              <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                <h3 className="text-lg font-semibold mb-4">Resources</h3>
                <div className="space-y-2">
                  <a href="https://github.com/legasicrypto/colosseum-agent-hackathon" target="_blank" className="flex items-center gap-2 text-white/50 hover:text-white transition">
                    <span>📚</span> Documentation
                  </a>
                  <a href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol" target="_blank" className="flex items-center gap-2 text-white/50 hover:text-white transition">
                    <span>🗳️</span> Vote on Colosseum
                  </a>
                  <a href="https://x.com/legasi_xyz" target="_blank" className="flex items-center gap-2 text-white/50 hover:text-white transition">
                    <span>🐦</span> Follow on X
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  subtext,
  highlight 
}: { 
  label: string; 
  value: string; 
  subtext: string;
  highlight?: "success" | "warning" | "danger" | "accent";
}) {
  const highlightColors = {
    success: "text-emerald-400",
    warning: "text-yellow-400",
    danger: "text-red-400",
    accent: "text-cyan-400",
  };

  return (
    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
      <p className="text-white/40 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? highlightColors[highlight] : "text-white"}`}>
        {value}
      </p>
      <p className="text-white/30 text-xs mt-1">{subtext}</p>
    </div>
  );
}

function ActionCard({ 
  title, 
  icon, 
  children 
}: { 
  title: string; 
  icon: string; 
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function AgentOption({ 
  title, 
  description, 
  onClick, 
  loading,
  highlighted,
  muted 
}: { 
  title: string; 
  description: string; 
  onClick: () => void;
  loading: boolean;
  highlighted?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full p-4 rounded-xl text-left transition ${
        highlighted 
          ? "bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 hover:border-emerald-500/50"
          : muted
          ? "bg-white/5 border border-white/5 hover:bg-white/10"
          : "bg-white/5 border border-white/10 hover:bg-white/10"
      } disabled:opacity-50`}
    >
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-white/50">{description}</div>
    </button>
  );
}

function ReputationRow({ 
  label, 
  value,
  negative 
}: { 
  label: string; 
  value: string | number;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/50 text-sm">{label}</span>
      <span className={`font-medium ${negative && value !== 0 ? "text-red-400" : ""}`}>
        {value}
      </span>
    </div>
  );
}
