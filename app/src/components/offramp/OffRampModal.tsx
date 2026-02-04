'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface Quote {
  source_amount: string;
  source_currency: string;
  destination_amount: string;
  destination_currency: string;
  fees: {
    bridge_fee: string;
    gas_fee: string;
    total: string;
  };
  expires_at: string;
}

interface OffRampModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxAmount?: number;
}

export default function OffRampModal({ isOpen, onClose, maxAmount = 10000 }: OffRampModalProps) {
  const { publicKey } = useWallet();
  const [step, setStep] = useState<'amount' | 'confirm' | 'processing' | 'complete'>('amount');
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMockMode, setIsMockMode] = useState(false);
  const [transferId, setTransferId] = useState('');

  const fetchQuote = useCallback(async (amt: string) => {
    if (!amt || parseFloat(amt) <= 0) {
      setQuote(null);
      return;
    }

    try {
      const res = await fetch(`/api/offramp/quote?amount=${amt}&currency=usdc&chain=solana`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setQuote(data.quote);
      setIsMockMode(data.isMockMode);
    } catch (err) {
      console.error('Quote error:', err);
    }
  }, []);

  // Debounced quote fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      if (amount) {
        fetchQuote(amount);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [amount, fetchQuote]);

  const handleAmountChange = (value: string) => {
    // Only allow numbers and decimal
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    setAmount(value);
    setError('');
  };

  const handleContinue = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) > maxAmount) {
      setError(`Maximum amount is $${maxAmount.toLocaleString()}`);
      return;
    }
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!publicKey) {
      setError('Please connect your wallet');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/offramp/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          amount,
          currency: 'usdc',
          chain: 'solana',
          walletAddress: publicKey.toBase58(),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setTransferId(data.transfer.id);
      setStep('processing');

      // Simulate processing time in mock mode
      if (isMockMode) {
        setTimeout(() => {
          setStep('complete');
        }, 2000);
      }
    } catch (err) {
      console.error('Transfer error:', err);
      setError('Failed to create transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('amount');
    setAmount('');
    setEmail('');
    setQuote(null);
    setError('');
    setTransferId('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 rounded-2xl border border-white/10 w-full max-w-md p-6 m-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            {step === 'amount' && '💸 Cash Out'}
            {step === 'confirm' && '📋 Confirm Transfer'}
            {step === 'processing' && '⏳ Processing'}
            {step === 'complete' && '✅ Complete'}
          </h2>
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Mock Mode Banner */}
        {isMockMode && (
          <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm">
            ⚠️ Demo Mode: No real transfers will be made
          </div>
        )}

        {/* Step: Amount */}
        {step === 'amount' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">
                Amount (USDC)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:border-blue-400 focus:outline-none text-2xl"
                />
                <button
                  onClick={() => setAmount(maxAmount.toString())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                >
                  MAX
                </button>
              </div>
              <p className="text-xs text-white/50 mt-1">
                Available: ${maxAmount.toLocaleString()} USDC
              </p>
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-2">
                Email (for receipt)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:border-blue-400 focus:outline-none"
              />
            </div>

            {/* Quote Preview */}
            {quote && (
              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">You send</span>
                  <span>{quote.source_amount} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Bridge fee</span>
                  <span className="text-white/70">-${quote.fees.bridge_fee}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Network fee</span>
                  <span className="text-white/70">-${quote.fees.gas_fee}</span>
                </div>
                <div className="border-t border-white/10 pt-2 flex justify-between font-semibold">
                  <span>You receive</span>
                  <span className="text-green-400">${quote.destination_amount} USD</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleContinue}
              disabled={!amount || !email || parseFloat(amount) <= 0}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              Continue
            </button>

            <p className="text-xs text-white/40 text-center">
              Powered by Bridge.xyz • Funds arrive in 1-3 business days
            </p>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && quote && (
          <div className="space-y-4">
            <div className="p-4 bg-white/5 rounded-xl space-y-3">
              <div className="flex justify-between">
                <span className="text-white/50">From</span>
                <span className="font-mono text-sm">
                  {publicKey?.toBase58().slice(0, 8)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Amount</span>
                <span>{quote.source_amount} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">To</span>
                <span className="text-sm">{email}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between font-semibold text-lg">
                <span>You&apos;ll receive</span>
                <span className="text-green-400">${quote.destination_amount}</span>
              </div>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-sm">
              <p className="text-blue-400">
                💡 Your bank account details will be collected securely by Bridge after confirmation.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('amount')}
                className="flex-1 py-3 bg-white/10 rounded-xl font-semibold hover:bg-white/20 transition"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Confirm Cash Out'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="text-center py-8 space-y-4">
            <div className="text-6xl animate-spin">⏳</div>
            <h3 className="text-lg font-semibold">Processing your transfer...</h3>
            <p className="text-white/50 text-sm">
              Transfer ID: {transferId.slice(0, 16)}...
            </p>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && (
          <div className="text-center py-8 space-y-4">
            <div className="text-6xl">✅</div>
            <h3 className="text-lg font-semibold">Transfer Initiated!</h3>
            <p className="text-white/50 text-sm">
              Your funds will arrive in 1-3 business days.
            </p>
            <div className="p-4 bg-white/5 rounded-xl text-sm">
              <p className="text-white/70 mb-2">Transfer ID:</p>
              <p className="font-mono text-xs break-all">{transferId}</p>
            </div>
            <button
              onClick={handleClose}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl font-semibold hover:opacity-90 transition"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
