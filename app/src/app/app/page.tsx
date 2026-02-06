'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { useState } from 'react';
import OffRampModal from '@/components/offramp/OffRampModal';

const mockPosition = {
  collateral: {
    SOL: { amount: 0, valueUsd: 0 },
    cbBTC: { amount: 0, valueUsd: 0 },
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
      <main className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#001520] gradient-bg">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-[#FF4E00]/20 rounded-full blur-3xl scale-150"></div>
            <img src="/legasi-logo.svg" alt="Legasi" className="h-16 w-auto mx-auto relative z-10" />
          </div>
          <h1 className="text-3xl font-bold">Connect Your Wallet</h1>
          <p className="text-[#6a7a88]">Connect your wallet to access the Legasi protocol</p>
          <WalletMultiButton className="!bg-[#FF4E00] !hover:bg-[#E64500] !text-white !font-semibold !rounded-xl !h-14 !px-8" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#001520] text-white gradient-bg">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[#001520]/80 backdrop-blur-xl border-b border-[#0a2535]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <img src="/legasi-logo.svg" alt="Legasi" className="h-8 w-auto" />
            </Link>
            <div className="flex gap-1 p-1 bg-[#051525] border border-[#0a2535] rounded-xl">
              {(['deposit', 'borrow', 'leverage'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === tab
                      ? 'bg-[#FF4E00] text-white'
                      : 'text-[#6a7a88] hover:text-white hover:bg-[#0a2535]'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowOffRamp(true)}
              className="px-4 py-2 bg-[#0a2535] hover:bg-[#1a3545] border border-[#1a3545] rounded-xl font-medium text-sm transition-all hover:scale-105"
            >
              Cash Out
            </button>
            <WalletMultiButton className="!bg-[#0a2535] !border !border-[#1a3545] !rounded-xl !h-10 !text-sm" />
          </div>
        </div>
      </nav>

      <OffRampModal
        isOpen={showOffRamp}
        onClose={() => setShowOffRamp(false)}
        maxAmount={1000}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Position Overview */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Collateral" value="$0.00" subValue="0 SOL" />
          <StatCard label="Total Borrowed" value="$0.00" subValue="0 USDC" />
          <StatCard label="Health Factor" value="∞" subValue="Safe" valueColor="text-[#FF4E00]" />
          <StatCard label="Current LTV" value="0%" subValue={`Max: ${mockPosition.maxLtv}%`} />
        </div>

        {/* GAD Indicator */}
        <div className="mb-8 p-6 rounded-2xl bg-[#051525]/80 border border-[#0a2535] backdrop-blur-sm card-shine">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FF4E00]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#FF4E00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold">GAD Status</h2>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#FF4E00]/10 text-[#FF4E00] text-sm font-medium">
              Safe Zone
            </span>
          </div>
          <div className="relative h-3 bg-[#0a2535] rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#FF4E00] to-[#FF7A3D] rounded-full transition-all"
              style={{ width: '0%' }}
            />
            <div className="absolute top-0 h-full w-0.5 bg-yellow-500" style={{ left: '80%' }} />
            <div className="absolute top-0 h-full w-0.5 bg-red-500" style={{ left: '90%' }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-[#6a7a88]">
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
          <div className="p-6 rounded-2xl bg-[#051525]/80 border border-[#0a2535] backdrop-blur-sm card-shine">
            {activeTab === 'deposit' && <DepositPanel />}
            {activeTab === 'borrow' && <BorrowPanel />}
            {activeTab === 'leverage' && <LeveragePanel />}
          </div>

          {/* Right Panel - Position Details */}
          <div className="p-6 rounded-2xl bg-[#051525]/80 border border-[#0a2535] backdrop-blur-sm card-shine">
            <h2 className="text-lg font-semibold mb-4">Your Position</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-sm text-[#6a7a88] mb-3">Collateral</h3>
                <div className="space-y-2">
                  <PositionRow asset="SOL" amount="0" value="$0.00" />
                  <PositionRow asset="cbBTC" amount="0" value="$0.00" />
                </div>
              </div>

              <div>
                <h3 className="text-sm text-[#6a7a88] mb-3">Borrowed</h3>
                <div className="space-y-2">
                  <PositionRow asset="USDC" amount="0" value="$0.00" />
                </div>
              </div>

              <div className="pt-4 border-t border-[#0a2535]">
                <h3 className="text-sm text-[#6a7a88] mb-3">eMode</h3>
                <select className="w-full px-4 py-3 bg-[#001520] rounded-xl border border-[#0a2535] focus:border-[#FF4E00] focus:outline-none transition-all">
                  <option value="none">None (Standard)</option>
                  <option value="sol">SOL Correlated (93% LTV)</option>
                  <option value="stables">Stablecoins (97% LTV)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-[#0a2535]">
                <h3 className="text-sm text-[#6a7a88] mb-3">Reputation Score</h3>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-[#FF4E00]">0</span>
                  <span className="text-[#6a7a88]">/ 500</span>
                </div>
                <p className="text-xs text-[#5a6a78] mt-2">
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
    <div className="p-5 rounded-2xl bg-[#051525]/80 border border-[#0a2535] backdrop-blur-sm card-hover">
      <div className="text-xs text-[#6a7a88] mb-2 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-sm text-[#5a6a78] mt-1">{subValue}</div>
    </div>
  );
}

function PositionRow({ asset, amount, value }: {
  asset: string;
  amount: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-[#001520]/50 border border-[#0a2535]/50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#FF4E00]/10 flex items-center justify-center text-[#FF4E00] text-sm font-bold">
          {asset.charAt(0)}
        </div>
        <span className="font-medium">{asset}</span>
      </div>
      <div className="text-right">
        <div className="font-medium">{amount}</div>
        <div className="text-sm text-[#6a7a88]">{value}</div>
      </div>
    </div>
  );
}

function DepositPanel() {
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('SOL');

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Deposit Collateral</h2>
      
      <div>
        <label className="text-sm text-[#6a7a88] mb-2 block">Asset</label>
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="w-full px-4 py-3 bg-[#001520] rounded-xl border border-[#0a2535] focus:border-[#FF4E00] focus:outline-none transition-all"
        >
          <option value="SOL">SOL</option>
          <option value="cbBTC">cbBTC</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-[#6a7a88] mb-2 block">Amount</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 bg-[#001520] rounded-xl border border-[#0a2535] focus:border-[#FF4E00] focus:outline-none transition-all pr-20"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs bg-[#FF4E00]/10 text-[#FF4E00] rounded-lg hover:bg-[#FF4E00]/20 transition font-medium">
            MAX
          </button>
        </div>
        <div className="text-sm text-[#5a6a78] mt-2">Balance: 0 {asset}</div>
      </div>

      <button className="w-full py-4 bg-[#FF4E00] hover:bg-[#E64500] text-white rounded-xl font-semibold transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#FF4E00]/20">
        Deposit {asset}
      </button>
    </div>
  );
}

function BorrowPanel() {
  const [amount, setAmount] = useState('');

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Borrow USDC</h2>
      
      <div>
        <label className="text-sm text-[#6a7a88] mb-2 block">Amount</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 bg-[#001520] rounded-xl border border-[#0a2535] focus:border-[#FF4E00] focus:outline-none transition-all pr-20"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs bg-[#FF4E00]/10 text-[#FF4E00] rounded-lg hover:bg-[#FF4E00]/20 transition font-medium">
            MAX
          </button>
        </div>
        <div className="text-sm text-[#5a6a78] mt-2">Available: $0.00</div>
      </div>

      <div className="p-4 rounded-xl bg-[#001520]/50 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-[#6a7a88]">New LTV</span>
          <span className="font-medium">0%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#6a7a88]">Interest Rate</span>
          <span className="font-medium">5.2% APY</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#6a7a88]">GAD Threshold</span>
          <span className="text-yellow-400 font-medium">80%</span>
        </div>
      </div>

      <button className="w-full py-4 bg-[#FF4E00] hover:bg-[#E64500] text-white rounded-xl font-semibold transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#FF4E00]/20">
        Borrow USDC
      </button>
    </div>
  );
}

function LeveragePanel() {
  const [leverage, setLeverage] = useState(2);
  const [direction, setDirection] = useState<'long' | 'short'>('long');

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">One-Click Leverage</h2>
      
      <div className="flex gap-2">
        <button
          onClick={() => setDirection('long')}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            direction === 'long'
              ? 'bg-[#FF4E00]/10 text-[#FF4E00] border border-[#FF4E00]/30'
              : 'bg-[#001520] text-[#6a7a88] border border-[#0a2535] hover:border-[#1a3545]'
          }`}
        >
          Long SOL
        </button>
        <button
          onClick={() => setDirection('short')}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            direction === 'short'
              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
              : 'bg-[#001520] text-[#6a7a88] border border-[#0a2535] hover:border-[#1a3545]'
          }`}
        >
          Short SOL
        </button>
      </div>

      <div>
        <label className="text-sm text-[#6a7a88] mb-3 block">Leverage: <span className="text-white font-semibold">{leverage}x</span></label>
        <input
          type="range"
          min="1"
          max="5"
          step="0.5"
          value={leverage}
          onChange={(e) => setLeverage(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-[#5a6a78] mt-2">
          <span>1x</span>
          <span>2x</span>
          <span>3x</span>
          <span>4x</span>
          <span>5x</span>
        </div>
      </div>

      <div>
        <label className="text-sm text-[#6a7a88] mb-2 block">Initial Collateral</label>
        <input
          type="number"
          placeholder="0.00"
          className="w-full px-4 py-3 bg-[#001520] rounded-xl border border-[#0a2535] focus:border-[#FF4E00] focus:outline-none transition-all"
        />
        <div className="text-sm text-[#5a6a78] mt-2">
          {direction === 'long' ? 'Deposit SOL' : 'Deposit USDC'}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#001520]/50 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-[#6a7a88]">Effective Position</span>
          <span className="font-medium">{leverage}x</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#6a7a88]">Liquidation Price</span>
          <span className="text-yellow-400 font-medium">$--</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#6a7a88]">GAD Start Price</span>
          <span className="font-medium">$--</span>
        </div>
      </div>

      <button className={`w-full py-4 rounded-xl font-semibold transition-all hover:scale-[1.02] ${
        direction === 'long'
          ? 'bg-[#FF4E00] hover:bg-[#E64500] text-white hover:shadow-xl hover:shadow-[#FF4E00]/20'
          : 'bg-red-500 hover:bg-red-600 text-white hover:shadow-xl hover:shadow-red-500/20'
      }`}>
        Open {leverage}x {direction === 'long' ? 'Long' : 'Short'}
      </button>
    </div>
  );
}
