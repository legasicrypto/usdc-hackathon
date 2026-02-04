'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { connected } = useWallet();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok && res.status !== 200) {
        setError(data.error || 'Something went wrong');
        return;
      }

      // Redirect to waitlist page with their code
      router.push(`/waitlist?ref=${data.entry.code}`);
    } catch (err) {
      console.error('Waitlist error:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Legasi
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-white/70 hover:text-white transition">
            App
          </Link>
          <Link href="https://docs.legasi.io" className="text-white/70 hover:text-white transition">
            Docs
          </Link>
          <WalletMultiButton />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-5xl md:text-7xl font-bold leading-tight">
            Credit Infrastructure for{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Digital Assets
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-white/70 max-w-2xl mx-auto">
            Borrow against your crypto with <strong className="text-white">Gradual Auto-Deleverage</strong> protection. 
            No liquidation cliff. Sleep soundly.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            {connected ? (
              <Link
                href="/app"
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl font-semibold text-lg hover:opacity-90 transition"
              >
                Launch App →
              </Link>
            ) : (
              <WalletMultiButton className="!bg-gradient-to-r !from-blue-500 !to-purple-600 !rounded-xl !font-semibold !text-lg !px-8 !py-4" />
            )}
            <Link
              href="#features"
              className="px-8 py-4 border border-white/20 rounded-xl font-semibold text-lg hover:bg-white/5 transition"
            >
              Learn More
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 pt-12 max-w-xl mx-auto">
            <div>
              <div className="text-3xl font-bold text-blue-400">$0</div>
              <div className="text-sm text-white/50">Total Value Locked</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-400">0</div>
              <div className="text-sm text-white/50">Forced Liquidations</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-pink-400">7%+</div>
              <div className="text-sm text-white/50">LP Yield</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 py-24 bg-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            Why Legasi?
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="🛡️"
              title="Gradual Auto-Deleverage"
              description="No sudden liquidations. GAD smoothly reduces your position when LTV exceeds threshold, protecting your capital."
            />
            <FeatureCard
              icon="⚡"
              title="eMode for Correlated Assets"
              description="Up to 97% LTV on stablecoins, 93% on SOL/JitoSOL. Maximum capital efficiency for sophisticated users."
            />
            <FeatureCard
              icon="🔄"
              title="One-Click Leverage"
              description="Go 2-5x long or short in a single transaction. Jupiter integration for optimal swaps."
            />
            <FeatureCard
              icon="💰"
              title="Auto-Stake Jito"
              description="Deposited SOL automatically earns ~7% APY through Jito staking while serving as collateral."
            />
            <FeatureCard
              icon="⚡"
              title="Flash Loans"
              description="0.05% fee flash loans for arbitrage, liquidations, and position management."
            />
            <FeatureCard
              icon="📊"
              title="On-Chain Reputation"
              description="Build your credit score on-chain. Better reputation = higher LTV limits."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to Experience DeFi Without the Cliff?
          </h2>
          <p className="text-xl text-white/70">
            Join the waitlist for early access and exclusive benefits.
          </p>
          <form onSubmit={handleWaitlistSubmit} className="flex flex-col sm:flex-row gap-4 justify-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="px-6 py-4 bg-white/10 rounded-xl border border-white/20 focus:border-blue-400 focus:outline-none w-full sm:w-80"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join Waitlist'}
            </button>
          </form>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <p className="text-white/50 text-sm">
            Already signed up?{' '}
            <Link href="/waitlist" className="text-blue-400 hover:underline">
              Check your status
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-white/50">
            © 2026 Legasi. Built on Solana.
          </div>
          <div className="flex gap-6">
            <Link href="https://twitter.com/legasicrypto" className="text-white/50 hover:text-white transition">
              Twitter
            </Link>
            <Link href="https://discord.gg/legasi" className="text-white/50 hover:text-white transition">
              Discord
            </Link>
            <Link href="https://github.com/legasicrypto" className="text-white/50 hover:text-white transition">
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-white/60">{description}</p>
    </div>
  );
}
