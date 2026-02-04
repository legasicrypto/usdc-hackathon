'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen bg-[#0a0a0f]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black">
              L
            </div>
            <span className="text-xl font-semibold">Legasi</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-white/60 hover:text-white transition text-sm">Features</a>
            <a href="#how-it-works" className="text-white/60 hover:text-white transition text-sm">How it Works</a>
            <a href="https://github.com/legasicrypto/colosseum-agent-hackathon" target="_blank" className="text-white/60 hover:text-white transition text-sm">GitHub</a>
          </div>
          <div className="flex items-center gap-3">
            <Link 
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition"
            >
              Dashboard
            </Link>
            <a 
              href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
              target="_blank"
              className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg hover:opacity-90 transition"
            >
              Vote Now
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-emerald-500/20 rounded-full blur-[120px]" />
        
        <div className="relative max-w-5xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-white/70">Colosseum Agent Hackathon</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="text-white">Agentic Credit</span>
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Infrastructure
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
            The first lending protocol where AI agents are first-class citizens. 
            Autonomous borrowing. On-chain reputation. x402 payments.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <a 
              href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
              target="_blank"
              className="group px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl font-semibold text-lg hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
            >
              Support Us on Colosseum
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
            </a>
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-white/5 border border-white/10 rounded-xl font-semibold text-lg hover:bg-white/10 transition"
            >
              Try Dashboard
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 pt-16 max-w-2xl mx-auto">
            <StatCard value="6" label="Solana Programs" />
            <StatCard value="+5%" label="LTV Reputation Bonus" />
            <StatCard value="x402" label="Native Payments" />
          </div>
        </div>
      </section>

      {/* Logos / Social Proof */}
      <section className="py-16 px-6 border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-white/40 text-sm mb-8">BUILT ON</p>
          <div className="flex justify-center items-center gap-12 flex-wrap">
            <div className="flex items-center gap-2 text-white/40">
              <SolanaLogo />
              <span className="font-medium">Solana</span>
            </div>
            <div className="flex items-center gap-2 text-white/40">
              <span className="text-2xl">⚓</span>
              <span className="font-medium">Anchor</span>
            </div>
            <div className="flex items-center gap-2 text-white/40">
              <span className="text-2xl">🔮</span>
              <span className="font-medium">Pyth</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <span className="text-emerald-400 font-medium text-sm tracking-wider uppercase">The Problem</span>
              <h2 className="text-3xl md:text-4xl font-bold">
                DeFi is built for humans clicking buttons
              </h2>
              <p className="text-white/60 text-lg leading-relaxed">
                AI agents are becoming economic actors. They need to pay for services, 
                access capital on-demand, and build creditworthiness over time.
              </p>
              <p className="text-white/60 text-lg leading-relaxed">
                But existing protocols require human intervention for every transaction. 
                That doesn't scale in an agentic economy.
              </p>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-3xl blur-xl" />
              <div className="relative bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
                <div className="flex items-center gap-3 text-red-400">
                  <span className="text-2xl">❌</span>
                  <span>Manual approval for each borrow</span>
                </div>
                <div className="flex items-center gap-3 text-red-400">
                  <span className="text-2xl">❌</span>
                  <span>No credit history for agents</span>
                </div>
                <div className="flex items-center gap-3 text-red-400">
                  <span className="text-2xl">❌</span>
                  <span>Sudden liquidation cascades</span>
                </div>
                <div className="flex items-center gap-3 text-red-400">
                  <span className="text-2xl">❌</span>
                  <span>No machine-to-machine payments</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-emerald-400 font-medium text-sm tracking-wider uppercase">Features</span>
            <h2 className="text-3xl md:text-5xl font-bold mt-4">
              Built for Autonomous Systems
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon="🤖"
              title="Autonomous Borrowing"
              description="Agents borrow within pre-configured limits. No human approval needed per transaction."
            />
            <FeatureCard
              icon="📊"
              title="On-Chain Reputation"
              description="Credit score based on repayment history. Score 400+ unlocks +5% LTV bonus."
            />
            <FeatureCard
              icon="💳"
              title="x402 Payments"
              description="Native HTTP 402 support. Agents pay for services programmatically."
            />
            <FeatureCard
              icon="🛡️"
              title="Gradual Deleveraging"
              description="No sudden liquidations. Positions unwound gradually, protecting from MEV."
            />
            <FeatureCard
              icon="⚡"
              title="Flash Loans"
              description="Zero-collateral loans for arbitrage. 0.09% fee, same-transaction repayment."
            />
            <FeatureCard
              icon="🔗"
              title="Composable"
              description="Clean PDAs and CPIs for other protocols to integrate."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-emerald-400 font-medium text-sm tracking-wider uppercase">How It Works</span>
            <h2 className="text-3xl md:text-5xl font-bold mt-4">
              Three Steps to Agent Credit
            </h2>
          </div>

          <div className="space-y-6">
            <StepCard
              number={1}
              title="Configure Agent"
              description="Set credit limits, collateral requirements, and allowed tokens."
              code="configure_agent(max_borrow: 10_000, min_collateral: 150%)"
            />
            <StepCard
              number={2}
              title="Autonomous Borrow"
              description="Agent borrows within limits when it needs capital."
              code="agent_borrow(mint: USDC, amount: 1_000)"
            />
            <StepCard
              number={3}
              title="Build Reputation"
              description="Each repayment increases credit score. Better score = better rates."
              code="// Score 400+ → +5% LTV bonus"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-blue-500/20" />
            <div className="absolute inset-0 bg-[#0a0a0f]/80" />
            <div className="relative p-12 md:p-16 text-center space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold">
                Credit Infrastructure for the Agentic Economy
              </h2>
              <p className="text-white/60 text-lg max-w-xl mx-auto">
                Built for the Colosseum Agent Hackathon. Support us with your vote!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <a
                  href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
                  target="_blank"
                  className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl font-semibold text-lg hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
                >
                  Vote on Colosseum 🗳️
                </a>
                <a
                  href="https://github.com/legasicrypto/colosseum-agent-hackathon"
                  target="_blank"
                  className="px-8 py-4 bg-white/5 border border-white/10 rounded-xl font-semibold text-lg hover:bg-white/10 transition"
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black">
              L
            </div>
            <span className="text-white/60">Built by Bouliche 🎱 for Colosseum</span>
          </div>
          <div className="flex gap-6">
            <a href="https://twitter.com/legaborateur" target="_blank" className="text-white/40 hover:text-white transition">
              Twitter
            </a>
            <a href="https://github.com/legasicrypto/colosseum-agent-hackathon" target="_blank" className="text-white/40 hover:text-white transition">
              GitHub
            </a>
            <a href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol" target="_blank" className="text-white/40 hover:text-white transition">
              Colosseum
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="text-sm text-white/50 mt-2">{label}</div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 hover:bg-white/[0.04] transition-all">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2 group-hover:text-emerald-400 transition">{title}</h3>
      <p className="text-white/50 leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description, code }: { number: number; title: string; description: string; code: string }) {
  return (
    <div className="flex gap-6 p-6 rounded-2xl bg-white/[0.02] border border-white/5">
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-xl font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-white/50 mb-4">{description}</p>
        <code className="block bg-black/50 px-4 py-3 rounded-lg text-emerald-400 text-sm font-mono border border-white/5">
          {code}
        </code>
      </div>
    </div>
  );
}

function SolanaLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 128 128" fill="currentColor">
      <path d="M25.4 101.3c0.9-0.9 2.2-1.5 3.5-1.5h91.7c2.2 0 3.3 2.7 1.7 4.3l-17.8 17.8c-0.9 0.9-2.2 1.5-3.5 1.5H9.3c-2.2 0-3.3-2.7-1.7-4.3L25.4 101.3z"/>
      <path d="M25.4 5.5c1-0.9 2.2-1.5 3.5-1.5h91.7c2.2 0 3.3 2.7 1.7 4.3L104.5 26c-0.9 0.9-2.2 1.5-3.5 1.5H9.3c-2.2 0-3.3-2.7-1.7-4.3L25.4 5.5z"/>
      <path d="M104.5 53.1c-0.9-0.9-2.2-1.5-3.5-1.5H9.3c-2.2 0-3.3 2.7-1.7 4.3l17.8 17.8c0.9 0.9 2.2 1.5 3.5 1.5h91.7c2.2 0 3.3-2.7 1.7-4.3L104.5 53.1z"/>
    </svg>
  );
}
