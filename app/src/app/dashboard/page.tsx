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
      <div className="min-h-screen bg-[#0c0c0f] text-white flex flex-col">
        <Nav />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00D395] to-[#00A3FF] flex items-center justify-center text-3xl mb-6">
            🤖
          </div>
          <h1 className="text-2xl font-semibold mb-3">Connect Wallet</h1>
          <p className="text-[#6a6a6a] mb-8 text-center max-w-sm">
            Connect your wallet to access the Legasi protocol
          </p>
          <WalletMultiButton className="!bg-[#00D395] !text-black !font-medium !rounded-lg !h-12 !px-6" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0f] text-white">
      <Nav />
      
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Error */}
        {legasi.error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
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
            color={legasi.ltv > 70 ? "#ff6b6b" : legasi.ltv > 50 ? "#ffd93d" : "#00D395"}
          />
          <MetricCard 
            label="Reputation" 
            value={reputationScore.toString()}
            subtitle={ltvBonus > 0 ? `+${ltvBonus}% LTV` : undefined}
          />
        </div>

        {/* Initialize */}
        {!legasi.hasPosition && (
          <div className="mb-8 p-8 bg-[#111114] border border-[#1a1a1f] rounded-xl text-center">
            <h2 className="text-xl font-semibold mb-2">Get Started</h2>
            <p className="text-[#6a6a6a] mb-6">Initialize your position to start using Legasi</p>
            <button
              onClick={() => legasi.initializePosition()}
              disabled={legasi.loading}
              className="h-12 px-8 bg-[#00D395] hover:bg-[#00B380] text-black font-medium rounded-lg transition disabled:opacity-50"
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
              <div className="flex gap-1 p-1 bg-[#111114] rounded-lg mb-6 w-fit">
                {(["supply", "borrow", "agent"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                      activeTab === tab
                        ? "bg-[#1a1a1f] text-white"
                        : "text-[#6a6a6a] hover:text-white"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="p-6 bg-[#111114] border border-[#1a1a1f] rounded-xl">
                {activeTab === "supply" && (
                  <div>
                    <h3 className="text-lg font-medium mb-4">Supply Collateral</h3>
                    <p className="text-sm text-[#6a6a6a] mb-6">
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
                            className="w-full h-12 bg-[#0c0c0f] border border-[#2a2a2f] rounded-lg px-4 pr-16 text-white placeholder-[#4a4a4a] focus:outline-none focus:border-[#00D395] transition"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a6a6a] text-sm">
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
                        className="h-12 px-6 bg-[#00D395] hover:bg-[#00B380] text-black font-medium rounded-lg transition disabled:bg-[#2a2a2f] disabled:text-[#6a6a6a]"
                      >
                        Supply
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "borrow" && (
                  <div>
                    <h3 className="text-lg font-medium mb-4">Borrow</h3>
                    <p className="text-sm text-[#6a6a6a] mb-6">
                      Borrow USDC against your collateral
                    </p>
                    <div className="flex gap-3 mb-4">
                      <div className="flex-1">
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={borrowAmount}
                            onChange={(e) => setBorrowAmount(e.target.value)}
                            className="w-full h-12 bg-[#0c0c0f] border border-[#2a2a2f] rounded-lg px-4 pr-16 text-white placeholder-[#4a4a4a] focus:outline-none focus:border-[#00D395] transition"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a6a6a] text-sm">
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
                        className="h-12 px-6 bg-[#00D395] hover:bg-[#00B380] text-black font-medium rounded-lg transition disabled:bg-[#2a2a2f] disabled:text-[#6a6a6a]"
                      >
                        Borrow
                      </button>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6a6a6a]">Available</span>
                      <span className="text-white">
                        ${Math.max(0, collateralValue * (0.75 + ltvBonus/100) - borrowedValue).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === "agent" && (
                  <div>
                    <h3 className="text-lg font-medium mb-4">Agent Configuration</h3>
                    <p className="text-sm text-[#6a6a6a] mb-6">
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
              <div className="p-5 bg-[#111114] border border-[#1a1a1f] rounded-xl">
                <h3 className="text-sm font-medium text-[#8a8a8a] mb-4">Reputation</h3>
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
                  <div className="pt-3 border-t border-[#1a1a1f]">
                    <InfoRow 
                      label="LTV Bonus" 
                      value={`+${ltvBonus}%`}
                      highlight
                    />
                  </div>
                </div>
              </div>

              {/* Protection */}
              <div className="p-5 bg-[#0d1f1a] border border-[#1a2f25] rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🛡️</span>
                  <h3 className="text-sm font-medium">GAD Protection</h3>
                </div>
                <p className="text-xs text-[#6a6a6a] leading-relaxed">
                  No sudden liquidations. Positions unwound gradually.
                </p>
              </div>

              {/* Links */}
              <div className="p-5 bg-[#111114] border border-[#1a1a1f] rounded-xl">
                <h3 className="text-sm font-medium text-[#8a8a8a] mb-3">Links</h3>
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
    <nav className="sticky top-0 z-50 bg-[#0c0c0f]/90 backdrop-blur-md border-b border-[#1a1a1f]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D395] to-[#00A3FF] flex items-center justify-center font-bold text-sm text-black">
            L
          </div>
          <span className="text-lg font-semibold tracking-tight">Legasi</span>
        </Link>
        <WalletMultiButton className="!bg-[#1a1a1f] !border !border-[#2a2a2f] !rounded-lg !h-10 !text-sm" />
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
    <div className="p-4 bg-[#111114] border border-[#1a1a1f] rounded-xl">
      <div className="text-xs text-[#6a6a6a] mb-1">{label}</div>
      <div className="text-xl font-semibold" style={{ color: color || "white" }}>{value}</div>
      {subtitle && <div className="text-xs text-[#00D395] mt-1">{subtitle}</div>}
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
      className={`w-full p-4 rounded-lg text-left transition ${
        highlighted 
          ? "bg-[#0d1f1a] border border-[#1a2f25] hover:border-[#00D395]"
          : "bg-[#0c0c0f] border border-[#2a2a2f] hover:border-[#3a3a3f]"
      } disabled:opacity-50`}
    >
      <div className="font-medium text-sm">{title}</div>
      <div className="text-xs text-[#6a6a6a] mt-1">{description}</div>
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
      <span className="text-[#6a6a6a]">{label}</span>
      <span className={
        highlight ? "text-[#00D395] font-medium" : 
        negative && value !== 0 ? "text-red-400" : 
        "text-white"
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
      className="flex items-center justify-between text-sm text-[#6a6a6a] hover:text-white transition"
    >
      <span>{label}</span>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </a>
  );
}
