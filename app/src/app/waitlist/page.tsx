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
    <main className="min-h-screen bg-[#001520] text-white gradient-bg">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[#001520]/80 backdrop-blur-xl border-b border-[#0a2535]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-white.png" alt="Legasi" className="w-8 h-8" />
            <span className="text-lg font-semibold tracking-tight">Legasi</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-[#8a9aa8] hover:text-white transition text-sm">
              Home
            </Link>
            <Link href="/dashboard" className="text-[#8a9aa8] hover:text-white transition text-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in-up">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Join the{' '}
            <span className="gradient-text">Waitlist</span>
          </h1>
          <p className="text-xl text-[#8a9aa8]">
            Get early access to Legasi and earn rewards for referrals
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-12 max-w-md mx-auto animate-fade-in-up animate-delay-100">
            <div className="p-6 rounded-2xl bg-[#051525]/80 border border-[#0a2535] text-center card-hover">
              <div className="text-3xl font-bold text-[#FF4E00]">
                {stats.totalSignups.toLocaleString()}
              </div>
              <div className="text-sm text-[#6a7a88]">Total Signups</div>
            </div>
            <div className="p-6 rounded-2xl bg-[#051525]/80 border border-[#0a2535] text-center card-hover">
              <div className="text-3xl font-bold text-[#FF4E00]">
                {stats.totalReferrals.toLocaleString()}
              </div>
              <div className="text-sm text-[#6a7a88]">Total Referrals</div>
            </div>
          </div>
        )}

        {/* Entry Status (if signed up) */}
        {entry && (
          <div className="mb-12 p-8 rounded-2xl bg-gradient-to-br from-[#FF4E00]/10 to-[#FF4E00]/5 border border-[#FF4E00]/20 animate-fade-in-up">
            <h2 className="text-2xl font-bold mb-6 text-center">You&apos;re on the list!</h2>
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-[#FF4E00]">#{entry.position}</div>
                <div className="text-sm text-[#6a7a88]">Your Position</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-[#FF4E00]">{entry.referralCount}</div>
                <div className="text-sm text-[#6a7a88]">Referrals</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-mono font-bold text-white">{entry.code}</div>
                <div className="text-sm text-[#6a7a88]">Your Code</div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[#8a9aa8] mb-4">
                Share your referral link to move up the list!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist?ref=${entry.code}`}
                  className="px-4 py-3 bg-[#001520] rounded-xl border border-[#0a2535] text-[#8a9aa8] text-sm flex-1 max-w-md"
                />
                <button
                  onClick={copyReferralLink}
                  className="px-6 py-3 bg-[#FF4E00] hover:bg-[#E64500] text-white rounded-xl font-semibold transition-all hover:scale-105"
                >
                  Copy Link
                </button>
              </div>
            </div>

            {/* Share Buttons */}
            <div className="flex justify-center gap-4 mt-6">
              <a
                href={`https://twitter.com/intent/tweet?text=I just joined the @legasi_xyz waitlist! No more liquidation cliffs with GAD protection. Join me: ${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist?ref=${entry.code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#0a2535] hover:bg-[#1a3545] text-white rounded-xl transition-all hover:scale-105"
              >
                Share on X
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist?ref=${entry.code}`)}&text=Join the Legasi waitlist! No more liquidation cliffs.`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#0a2535] hover:bg-[#1a3545] text-white rounded-xl transition-all hover:scale-105"
              >
                Share on Telegram
              </a>
            </div>
          </div>
        )}

        {/* Signup Form */}
        {!entry && (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto mb-12 animate-fade-in-up animate-delay-200">
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-[#8a9aa8] mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-6 py-4 bg-[#051525] rounded-xl border border-[#0a2535] focus:border-[#FF4E00] focus:outline-none focus:shadow-lg focus:shadow-[#FF4E00]/10 transition-all"
                />
              </div>

              <div>
                <label htmlFor="referral" className="block text-sm text-[#8a9aa8] mb-2">
                  Referral Code (optional)
                </label>
                <input
                  id="referral"
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXXXX"
                  maxLength={8}
                  className="w-full px-6 py-4 bg-[#051525] rounded-xl border border-[#0a2535] focus:border-[#FF4E00] focus:outline-none font-mono uppercase transition-all"
                />
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {success && !entry && (
                <div className="p-4 bg-[#FF4E00]/10 border border-[#FF4E00]/20 rounded-xl text-[#FF4E00] text-sm">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-8 py-4 bg-[#FF4E00] hover:bg-[#E64500] text-white rounded-xl font-semibold text-lg transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#FF4E00]/30 disabled:opacity-50 disabled:hover:scale-100 glow-btn"
              >
                {loading ? 'Joining...' : 'Join Waitlist'}
              </button>
            </div>
          </form>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="mt-16 animate-fade-in-up animate-delay-300">
            <h2 className="text-2xl font-bold text-center mb-8">Top Referrers</h2>
            <div className="max-w-md mx-auto space-y-3">
              {leaderboard.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-xl bg-[#051525]/80 border border-[#0a2535] card-hover"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-bold text-[#FF4E00] w-8">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </span>
                    <span className="text-[#8a9aa8]">{entry.email}</span>
                  </div>
                  <span className="text-[#FF4E00] font-semibold">
                    {entry.referralCount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Benefits */}
        <div className="mt-16 animate-fade-in-up animate-delay-400">
          <h2 className="text-2xl font-bold text-center mb-8">Why Join Early?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <BenefitCard
              title="Early Access"
              description="Be first to use Legasi when we launch on mainnet"
            />
            <BenefitCard
              title="Exclusive Benefits"
              description="Lower fees and higher LTV limits for early adopters"
            />
            <BenefitCard
              title="Referral Rewards"
              description="Earn bonus rewards for every friend you refer"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-[#0a2535]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3 text-[#5a6a78]">
            <img src="/logo-white.png" alt="Legasi" className="w-6 h-6" />
            <span className="text-sm">Legasi Protocol</span>
          </div>
          <div className="flex gap-8 text-sm">
            <a href="https://x.com/legasi_xyz" target="_blank" className="text-[#5a6a78] hover:text-[#FF4E00] transition-colors">
              Twitter
            </a>
            <a href="https://t.me/legasi_community" target="_blank" className="text-[#5a6a78] hover:text-[#FF4E00] transition-colors">
              Telegram
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function BenefitCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-[#051525]/80 border border-[#0a2535] text-center card-hover card-shine">
      <div className="w-12 h-12 rounded-xl bg-[#FF4E00]/10 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-[#FF4E00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-[#6a7a88]">{description}</p>
    </div>
  );
}
