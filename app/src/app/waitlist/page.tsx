'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface WaitlistEntry {
  code: string;
  referralCount: number;
  position: number;
  createdAt: string;
}

interface WaitlistStats {
  totalSignups: number;
  totalReferrals: number;
}

interface LeaderboardEntry {
  email: string;
  referralCount: number;
  position: number;
}

export default function WaitlistPage() {
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<WaitlistEntry | null>(null);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check for referral code in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      setReferralCode(ref);
    }
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/waitlist');
      const data = await res.json();
      setStats(data.stats);
      setLeaderboard(data.leaderboard);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, referralCode: referralCode || undefined }),
      });

      const data = await res.json();

      if (!res.ok && res.status !== 200) {
        setError(data.error || 'Something went wrong');
        return;
      }

      // Fetch full entry with position
      const entryRes = await fetch(`/api/waitlist/${data.entry.code}`);
      const entryData = await entryRes.json();
      setEntry(entryData);
      setSuccess(data.message);
      loadStats();
    } catch (err) {
      console.error('Submit error:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = () => {
    if (entry) {
      const link = `${window.location.origin}/waitlist?ref=${entry.code}`;
      navigator.clipboard.writeText(link);
      setSuccess('Referral link copied!');
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  return (
    <main className="min-h-screen bg-black">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Legasi
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-white/70 hover:text-white transition">
            Home
          </Link>
          <Link href="/app" className="text-white/70 hover:text-white transition">
            App
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Join the{' '}
            <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Waitlist
            </span>
          </h1>
          <p className="text-xl text-white/70">
            Get early access to Legasi and earn rewards for referrals
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-12 max-w-md mx-auto">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-3xl font-bold text-blue-400">
                {stats.totalSignups.toLocaleString()}
              </div>
              <div className="text-sm text-white/50">Total Signups</div>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-3xl font-bold text-purple-400">
                {stats.totalReferrals.toLocaleString()}
              </div>
              <div className="text-sm text-white/50">Total Referrals</div>
            </div>
          </div>
        )}

        {/* Entry Status (if signed up) */}
        {entry && (
          <div className="mb-12 p-8 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10">
            <h2 className="text-2xl font-bold mb-6 text-center">🎉 You&apos;re on the list!</h2>
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-400">#{entry.position}</div>
                <div className="text-sm text-white/50">Your Position</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-purple-400">{entry.referralCount}</div>
                <div className="text-sm text-white/50">Referrals</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-mono font-bold text-pink-400">{entry.code}</div>
                <div className="text-sm text-white/50">Your Code</div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-white/70 mb-4">
                Share your referral link to move up the list!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist?ref=${entry.code}`}
                  className="px-4 py-3 bg-white/10 rounded-xl border border-white/20 text-white/70 text-sm flex-1 max-w-md"
                />
                <button
                  onClick={copyReferralLink}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl font-semibold hover:opacity-90 transition"
                >
                  Copy Link
                </button>
              </div>
            </div>

            {/* Share Buttons */}
            <div className="flex justify-center gap-4 mt-6">
              <a
                href={`https://twitter.com/intent/tweet?text=I just joined the @legasicrypto waitlist! No more liquidation cliffs with GAD protection. Join me: ${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist?ref=${entry.code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#1DA1F2]/20 text-[#1DA1F2] rounded-lg hover:bg-[#1DA1F2]/30 transition"
              >
                Share on X
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist?ref=${entry.code}`)}&text=Join the Legasi waitlist! No more liquidation cliffs.`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#0088cc]/20 text-[#0088cc] rounded-lg hover:bg-[#0088cc]/30 transition"
              >
                Share on Telegram
              </a>
            </div>
          </div>
        )}

        {/* Signup Form */}
        {!entry && (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto mb-12">
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-white/70 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-6 py-4 bg-white/10 rounded-xl border border-white/20 focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="referral" className="block text-sm text-white/70 mb-2">
                  Referral Code (optional)
                </label>
                <input
                  id="referral"
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXXXX"
                  maxLength={8}
                  className="w-full px-6 py-4 bg-white/10 rounded-xl border border-white/20 focus:border-blue-400 focus:outline-none font-mono uppercase"
                />
              </div>

              {error && (
                <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {success && !entry && (
                <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-green-400 text-sm">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl font-semibold text-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Joining...' : 'Join Waitlist'}
              </button>
            </div>
          </form>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-center mb-8">🏆 Top Referrers</h2>
            <div className="max-w-md mx-auto space-y-3">
              {leaderboard.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </span>
                    <span className="text-white/70">{entry.email}</span>
                  </div>
                  <span className="text-purple-400 font-bold">
                    {entry.referralCount} referrals
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Benefits */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-center mb-8">Why Join Early?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-4xl mb-4">🎁</div>
              <h3 className="font-semibold mb-2">Early Access</h3>
              <p className="text-sm text-white/60">
                Be first to use Legasi when we launch on mainnet
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-4xl mb-4">💎</div>
              <h3 className="font-semibold mb-2">Exclusive Benefits</h3>
              <p className="text-sm text-white/60">
                Lower fees and higher LTV limits for early adopters
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="font-semibold mb-2">Referral Rewards</h3>
              <p className="text-sm text-white/60">
                Earn bonus rewards for every friend you refer
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-white/50">© 2026 Legasi. Built on Solana.</div>
          <div className="flex gap-6">
            <Link href="https://twitter.com/legasicrypto" className="text-white/50 hover:text-white transition">
              Twitter
            </Link>
            <Link href="https://discord.gg/legasi" className="text-white/50 hover:text-white transition">
              Discord
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
