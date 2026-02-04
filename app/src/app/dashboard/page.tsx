"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useLegasi } from "@/hooks/useLegasi";

export default function Dashboard() {
  const { connected } = useWallet();
  const legasi = useLegasi();
  
  const [depositAmount, setDepositAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [lpAmount, setLpAmount] = useState("");

  if (!connected) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold mb-8">🤖 LEGASI</h1>
        <p className="text-gray-400 mb-8">Agentic Credit Infrastructure</p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold">🤖 LEGASI Dashboard</h1>
            <p className="text-gray-400">Built by agents, for agents & humans</p>
          </div>
          <WalletMultiButton />
        </div>

        {/* Error Display */}
        {legasi.error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg mb-8">
            {legasi.error}
          </div>
        )}

        {/* Position Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-gray-400 text-sm mb-2">Collateral Value</h3>
            <p className="text-3xl font-bold">
              ${legasi.position?.collaterals.reduce((sum, c) => 
                sum + (c.amount.toNumber() / 1e9 * 100), 0
              ).toFixed(2) || "0.00"}
            </p>
          </div>
          
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-gray-400 text-sm mb-2">Borrowed</h3>
            <p className="text-3xl font-bold">
              ${legasi.position?.borrows.reduce((sum, b) => 
                sum + (b.amount.toNumber() / 1e6), 0
              ).toFixed(2) || "0.00"}
            </p>
          </div>
          
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-gray-400 text-sm mb-2">Current LTV</h3>
            <p className={`text-3xl font-bold ${legasi.ltv > 70 ? "text-red-500" : legasi.ltv > 50 ? "text-yellow-500" : "text-green-500"}`}>
              {legasi.ltv.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Initialize Position (if needed) */}
        {!legasi.hasPosition && (
          <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 mb-8 text-center">
            <h2 className="text-xl font-bold mb-4">Get Started</h2>
            <p className="text-gray-400 mb-6">Initialize your position to start borrowing</p>
            <button
              onClick={() => legasi.initializePosition()}
              disabled={legasi.loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-8 py-3 rounded-lg font-medium"
            >
              {legasi.loading ? "Initializing..." : "Initialize Position"}
            </button>
          </div>
        )}

        {/* Main Actions */}
        {legasi.hasPosition && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Deposit SOL */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4">Deposit SOL</h2>
              <div className="flex gap-4">
                <input
                  type="number"
                  placeholder="Amount in SOL"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    legasi.depositSol(parseFloat(depositAmount));
                    setDepositAmount("");
                  }}
                  disabled={legasi.loading || !depositAmount}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-6 py-3 rounded-lg font-medium"
                >
                  Deposit
                </button>
              </div>
            </div>

            {/* Borrow USDC */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4">Borrow USDC</h2>
              <div className="flex gap-4">
                <input
                  type="number"
                  placeholder="Amount in USDC"
                  value={borrowAmount}
                  onChange={(e) => setBorrowAmount(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    legasi.borrow(parseFloat(borrowAmount));
                    setBorrowAmount("");
                  }}
                  disabled={legasi.loading || !borrowAmount}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-3 rounded-lg font-medium"
                >
                  Borrow
                </button>
              </div>
              <p className="text-gray-500 text-sm mt-2">Max LTV: 75%</p>
            </div>

            {/* Agent Configuration */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 md:col-span-2">
              <h2 className="text-xl font-bold mb-4">🤖 Agent Mode</h2>
              <p className="text-gray-400 mb-4">Configure autonomous operations for your position</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => legasi.configureAgent(1000, true, true)}
                  disabled={legasi.loading}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-6 py-4 rounded-lg font-medium text-left"
                >
                  <div className="font-bold">Enable Agent</div>
                  <div className="text-sm text-purple-200">$1000/day limit, auto-repay, x402</div>
                </button>
                <button
                  onClick={() => legasi.configureAgent(5000, true, true)}
                  disabled={legasi.loading}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-6 py-4 rounded-lg font-medium text-left"
                >
                  <div className="font-bold">Pro Agent</div>
                  <div className="text-sm text-purple-200">$5000/day limit, auto-repay, x402</div>
                </button>
                <button
                  onClick={() => legasi.configureAgent(0, false, false)}
                  disabled={legasi.loading}
                  className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 px-6 py-4 rounded-lg font-medium text-left"
                >
                  <div className="font-bold">Disable Agent</div>
                  <div className="text-sm text-gray-400">Manual control only</div>
                </button>
              </div>
            </div>

            {/* LP Section */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 md:col-span-2">
              <h2 className="text-xl font-bold mb-4">💰 Provide Liquidity</h2>
              <p className="text-gray-400 mb-4">Deposit USDC to earn yield from borrowers</p>
              <div className="flex gap-4">
                <input
                  type="number"
                  placeholder="Amount in USDC"
                  value={lpAmount}
                  onChange={(e) => setLpAmount(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    legasi.lpDeposit(parseFloat(lpAmount));
                    setLpAmount("");
                  }}
                  disabled={legasi.loading || !lpAmount}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 px-6 py-3 rounded-lg font-medium"
                >
                  Deposit to Pool
                </button>
              </div>
              <p className="text-gray-500 text-sm mt-2">Receive bUSDC LP tokens • Current APY: ~8%</p>
            </div>
          </div>
        )}

        {/* Reputation */}
        {legasi.position && (
          <div className="mt-8 bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h2 className="text-xl font-bold mb-4">📊 Reputation Score</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-gray-400 text-sm">Successful Repayments</p>
                <p className="text-2xl font-bold">{legasi.position.reputation.successfulRepayments}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Total Repaid</p>
                <p className="text-2xl font-bold">${(legasi.position.reputation.totalRepaidUsd.toNumber() / 1e6).toFixed(0)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">GAD Events</p>
                <p className="text-2xl font-bold">{legasi.position.reputation.gadEvents}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Account Age</p>
                <p className="text-2xl font-bold">{legasi.position.reputation.accountAgeDays} days</p>
              </div>
            </div>
          </div>
        )}

        {/* GAD Info */}
        <div className="mt-8 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl p-6 border border-blue-800">
          <h2 className="text-xl font-bold mb-2">⚡ GAD Protection Active</h2>
          <p className="text-gray-300">
            Your position is protected by Gradual Auto-Deleveraging. If your LTV exceeds 75%, 
            we'll gradually sell collateral instead of liquidating everything at once.
          </p>
        </div>
      </div>
    </div>
  );
}
