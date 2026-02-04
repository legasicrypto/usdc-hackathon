'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { useState } from 'react';
import OffRampModal from '@/components/offramp/OffRampModal';

// Mock data - will be replaced with real contract calls
const mockPosition = {
  collateral: {
    SOL: { amount: 0, valueUsd: 0 },
    JitoSOL: { amount: 0, valueUsd: 0 },
  },
  borrowed: {
    USDC: { amount: 0, accrued: 0 },
  },
  healthFactor: 0,
  ltv: 0,
  maxLtv: 75,
  gadThreshold: 80,
  reputation: 0,
  eMode: 'None',
};

export default function AppPage() {
  const { connected, publicKey } = useWallet();
  const [activeTab, setActiveTab] = useState<'deposit' | 'borrow' | 'leverage'>('deposit');
  const [showOffRamp, setShowOffRamp] = useState(false);

  if (!connected) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-center space-y-6">
          <h1 className="text-3xl font-bold">Connect Your Wallet</h1>
          <p className="text-white/60">Connect your wallet to access the Legasi protocol</p>
          <WalletMultiButton />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Legasi
          </Link>
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('deposit')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'deposit' ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              Deposit
            </button>
            <button
              onClick={() => setActiveTab('borrow')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'borrow' ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              Borrow
            </button>
            <button
              onClick={() => setActiveTab('leverage')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'leverage' ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              Leverage
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowOffRamp(true)}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg font-semibold text-sm hover:opacity-90 transition"
          >
            💸 Cash Out
          </button>
          <WalletMultiButton />
        </div>
      </nav>

      {/* Off-Ramp Modal */}
      <OffRampModal
        isOpen={showOffRamp}
        onClose={() => setShowOffRamp(false)}
        maxAmount={1000} // Mock available balance
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Position Overview */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Collateral"
            value="$0.00"
            subValue="0 SOL"
          />
          <StatCard
            label="Total Borrowed"
            value="$0.00"
            subValue="0 USDC"
          />
          <StatCard
            label="Health Factor"
            value="∞"
            subValue="Safe"
            valueColor="text-green-400"
          />
          <StatCard
            label="Current LTV"
            value="0%"
            subValue={`Max: ${mockPosition.maxLtv}%`}
          />
        </div>

        {/* GAD Indicator */}
        <div className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">GAD Status</h2>
            <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm">
              Safe Zone
            </span>
          </div>
          <div className="relative h-4 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all"
              style={{ width: '0%' }}
            />
            {/* GAD threshold marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-yellow-500"
              style={{ left: '80%' }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-red-500"
              style={{ left: '90%' }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-white/50">
            <span>0%</span>
            <span>Safe LTV: 75%</span>
            <span className="text-yellow-500">GAD: 80%</span>
            <span className="text-red-500">Hard: 90%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Action Panels */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Panel - Actions */}
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            {activeTab === 'deposit' && <DepositPanel />}
            {activeTab === 'borrow' && <BorrowPanel />}
            {activeTab === 'leverage' && <LeveragePanel />}
          </div>

          {/* Right Panel - Position Details */}
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h2 className="text-lg font-semibold mb-4">Your Position</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm text-white/50 mb-2">Collateral</h3>
                <div className="space-y-2">
                  <PositionRow asset="SOL" amount="0" value="$0.00" icon="◎" />
                  <PositionRow asset="JitoSOL" amount="0" value="$0.00" icon="🔥" />
                </div>
              </div>

              <div>
                <h3 className="text-sm text-white/50 mb-2">Borrowed</h3>
                <div className="space-y-2">
                  <PositionRow asset="USDC" amount="0" value="$0.00" icon="$" />
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <h3 className="text-sm text-white/50 mb-2">eMode</h3>
                <select className="w-full px-4 py-2 bg-white/10 rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none">
                  <option value="none">None (Standard)</option>
                  <option value="sol">SOL Correlated (93% LTV)</option>
                  <option value="stables">Stablecoins (97% LTV)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-white/10">
                <h3 className="text-sm text-white/50 mb-2">Reputation Score</h3>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">0</span>
                  <span className="text-white/50">/ 500</span>
                </div>
                <p className="text-xs text-white/40 mt-1">
                  Build reputation through successful repayments
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, subValue, valueColor = 'text-white' }: {
  label: string;
  value: string;
  subValue: string;
  valueColor?: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="text-sm text-white/50 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-sm text-white/40">{subValue}</div>
    </div>
  );
}

function PositionRow({ asset, amount, value, icon }: {
  asset: string;
  amount: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span>{asset}</span>
      </div>
      <div className="text-right">
        <div>{amount}</div>
        <div className="text-sm text-white/50">{value}</div>
      </div>
    </div>
  );
}

function DepositPanel() {
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('SOL');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Deposit Collateral</h2>
      
      <div>
        <label className="text-sm text-white/50 mb-2 block">Asset</label>
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none"
        >
          <option value="SOL">SOL</option>
          <option value="JitoSOL">JitoSOL</option>
          <option value="cbBTC">cbBTC</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-white/50 mb-2 block">Amount</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 bg-white/10 rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm bg-white/10 rounded hover:bg-white/20 transition">
            MAX
          </button>
        </div>
        <div className="text-sm text-white/40 mt-1">Balance: 0 {asset}</div>
      </div>

      <button className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition">
        Deposit {asset}
      </button>
    </div>
  );
}

function BorrowPanel() {
  const [amount, setAmount] = useState('');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Borrow USDC</h2>
      
      <div>
        <label className="text-sm text-white/50 mb-2 block">Amount</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 bg-white/10 rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm bg-white/10 rounded hover:bg-white/20 transition">
            MAX
          </button>
        </div>
        <div className="text-sm text-white/40 mt-1">Available: $0.00</div>
      </div>

      <div className="p-4 rounded-lg bg-white/5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-white/50">New LTV</span>
          <span>0%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/50">Interest Rate</span>
          <span>5.2% APY</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/50">GAD Threshold</span>
          <span className="text-yellow-400">80%</span>
        </div>
      </div>

      <button className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition">
        Borrow USDC
      </button>
    </div>
  );
}

function LeveragePanel() {
  const [leverage, setLeverage] = useState(2);
  const [direction, setDirection] = useState<'long' | 'short'>('long');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">One-Click Leverage</h2>
      
      <div className="flex gap-2">
        <button
          onClick={() => setDirection('long')}
          className={`flex-1 py-2 rounded-lg font-semibold transition ${
            direction === 'long'
              ? 'bg-green-500/20 text-green-400 border border-green-500/50'
              : 'bg-white/5 text-white/50 border border-white/10'
          }`}
        >
          🚀 Long SOL
        </button>
        <button
          onClick={() => setDirection('short')}
          className={`flex-1 py-2 rounded-lg font-semibold transition ${
            direction === 'short'
              ? 'bg-red-500/20 text-red-400 border border-red-500/50'
              : 'bg-white/5 text-white/50 border border-white/10'
          }`}
        >
          📉 Short SOL
        </button>
      </div>

      <div>
        <label className="text-sm text-white/50 mb-2 block">Leverage: {leverage}x</label>
        <input
          type="range"
          min="1"
          max="5"
          step="0.5"
          value={leverage}
          onChange={(e) => setLeverage(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-white/40 mt-1">
          <span>1x</span>
          <span>2x</span>
          <span>3x</span>
          <span>4x</span>
          <span>5x</span>
        </div>
      </div>

      <div>
        <label className="text-sm text-white/50 mb-2 block">Initial Collateral</label>
        <input
          type="number"
          placeholder="0.00"
          className="w-full px-4 py-3 bg-white/10 rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none"
        />
        <div className="text-sm text-white/40 mt-1">
          {direction === 'long' ? 'Deposit SOL' : 'Deposit USDC'}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-white/5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-white/50">Effective Position</span>
          <span>{leverage}x</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/50">Liquidation Price</span>
          <span className="text-yellow-400">$--</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/50">GAD Start Price</span>
          <span>$--</span>
        </div>
      </div>

      <button className={`w-full py-3 rounded-lg font-semibold transition ${
        direction === 'long'
          ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90'
          : 'bg-gradient-to-r from-red-500 to-rose-600 hover:opacity-90'
      }`}>
        Open {leverage}x {direction === 'long' ? 'Long' : 'Short'}
      </button>
    </div>
  );
}
