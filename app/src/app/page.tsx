'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';

export default function Home() {
  const { connected } = useWallet();

  return (
    <main className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
            Legasi
          </span>
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
            Agentic
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-white/70 hover:text-white transition">
            Dashboard
          </Link>
          <a href="https://github.com/legasicrypto/colosseum-agent-hackathon" target="_blank" className="text-white/70 hover:text-white transition">
            GitHub
          </a>
          <WalletMultiButton />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm">
            <span className="animate-pulse">🤖</span>
            <span>Built for AI Agents</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold leading-tight">
            Agentic Credit{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-500 to-blue-500 bg-clip-text text-transparent">
              Infrastructure
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-white/70 max-w-2xl mx-auto">
            The first lending protocol where <strong className="text-white">AI agents are first-class citizens</strong>. 
            Autonomous borrowing. On-chain reputation. x402 payments.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-600 rounded-xl font-semibold text-lg hover:opacity-90 transition"
            >
              Agent Dashboard →
            </Link>
            <a
              href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
              target="_blank"
              className="px-8 py-4 border border-white/20 rounded-xl font-semibold text-lg hover:bg-white/5 transition"
            >
              Vote for Us 🗳️
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 pt-12 max-w-xl mx-auto">
            <div>
              <div className="text-3xl font-bold text-emerald-400">3</div>
              <div className="text-sm text-white/50">Programs on Devnet</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-cyan-400">+5%</div>
              <div className="text-sm text-white/50">Max LTV Bonus</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-400">x402</div>
              <div className="text-sm text-white/50">Native Payments</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 py-24 bg-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Why Agents Need Legasi
          </h2>
          <p className="text-white/60 text-center mb-16 max-w-2xl mx-auto">
            AI agents are becoming economic actors. They need financial infrastructure that works at machine speed.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="🤖"
              title="Autonomous Borrowing"
              description="Agents borrow within pre-configured limits. No human approval needed per transaction."
            />
            <FeatureCard
              icon="📊"
              title="On-Chain Financial Identity"
              description="Reputation score based on repayment history. Good behavior = better rates (+5% LTV bonus)."
            />
            <FeatureCard
              icon="💳"
              title="x402 Payment Protocol"
              description="Native support for HTTP 402 payments. Agents pay for services programmatically."
            />
            <FeatureCard
              icon="🛡️"
              title="Gradual Auto-Deleveraging"
              description="No sudden liquidations. Positions unwound gradually, protecting agents from MEV."
            />
            <FeatureCard
              icon="⚡"
              title="Flash Loans"
              description="Zero-collateral loans for arbitrage and position management. 0.09% fee."
            />
            <FeatureCard
              icon="🔗"
              title="Composable Primitives"
              description="PDAs and CPIs for other protocols. Infrastructure, not just a product."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            How Agents Use Legasi
          </h2>
          
          <div className="space-y-8">
            <StepCard
              number="1"
              title="Configure Agent"
              description="Set credit limits, collateral requirements, and allowed tokens for your agent."
              code="configure_agent(max_borrow: 10_000, min_collateral: 150%)"
            />
            <StepCard
              number="2"
              title="Autonomous Borrow"
              description="Agent borrows within limits when it needs capital. No human in the loop."
              code="agent_borrow(amount: 1000 USDC)"
            />
            <StepCard
              number="3"
              title="Build Reputation"
              description="Each successful repayment increases the agent's credit score."
              code="reputation.score += 50 // Unlocks +5% LTV at 400+"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-24 bg-gradient-to-b from-emerald-500/10 to-transparent">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Credit Infrastructure for the Agentic Economy
          </h2>
          <p className="text-xl text-white/70">
            Built for the Colosseum Agent Hackathon. Support us with your vote!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
              target="_blank"
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-600 rounded-xl font-semibold text-lg hover:opacity-90 transition"
            >
              Vote on Colosseum 🗳️
            </a>
            <a
              href="https://twitter.com/legaborateur"
              target="_blank"
              className="px-8 py-4 border border-white/20 rounded-xl font-semibold text-lg hover:bg-white/5 transition"
            >
              Follow on X
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-white/50">
            © 2026 Legasi. Built by Bouliche 🎱 for the Colosseum Hackathon.
          </div>
          <div className="flex gap-6">
            <a href="https://twitter.com/legaborateur" target="_blank" className="text-white/50 hover:text-white transition">
              Twitter
            </a>
            <a href="https://github.com/legasicrypto/colosseum-agent-hackathon" target="_blank" className="text-white/50 hover:text-white transition">
              GitHub
            </a>
            <a href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol" target="_blank" className="text-white/50 hover:text-white transition">
              Colosseum
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-white/60">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description, code }: { number: string; title: string; description: string; code: string }) {
  return (
    <div className="flex gap-6 items-start p-6 rounded-2xl bg-white/5 border border-white/10">
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-600 flex items-center justify-center text-xl font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-white/60 mb-4">{description}</p>
        <code className="block bg-black/50 px-4 py-2 rounded-lg text-emerald-400 text-sm font-mono">
          {code}
        </code>
      </div>
    </div>
  );
}
