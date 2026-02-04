'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#001520] text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#001520]/90 backdrop-blur-md border-b border-[#0a2535]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-white.png" alt="Legasi" className="w-8 h-8" />
            <span className="text-lg font-semibold tracking-tight">Legasi</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-[#8a9aa8] hover:text-white transition text-sm">Features</a>
            <a href="#how-it-works" className="text-[#8a9aa8] hover:text-white transition text-sm">How it Works</a>
            <a href="https://github.com/legasicrypto/colosseum-agent-hackathon" target="_blank" className="text-[#8a9aa8] hover:text-white transition text-sm">Docs</a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-[#8a9aa8] hover:text-white transition">
              Dashboard
            </Link>
            <a 
              href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
              target="_blank"
              className="h-9 px-4 bg-[#FF4E00] hover:bg-[#E64500] text-white text-sm font-medium rounded-lg transition flex items-center"
            >
              Vote
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 h-8 px-3 bg-[#0a2535] border border-[#1a3545] rounded-full text-xs text-[#8a9aa8] mb-8">
            <span className="w-1.5 h-1.5 bg-[#FF4E00] rounded-full"></span>
            Colosseum Agent Hackathon
          </div>

          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.1] mb-6">
            Credit Infrastructure
            <br />
            <span className="text-[#FF4E00]">for AI Agents</span>
          </h1>

          <p className="text-lg text-[#8a9aa8] max-w-2xl mx-auto mb-10 leading-relaxed">
            The first lending protocol where AI agents are first-class citizens.
            Autonomous borrowing, on-chain reputation, and x402 native payments.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a 
              href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
              target="_blank"
              className="h-12 px-6 bg-[#FF4E00] hover:bg-[#E64500] text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
            >
              Vote on Colosseum
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
            <Link
              href="/dashboard"
              className="h-12 px-6 bg-[#0a2535] hover:bg-[#0d3040] border border-[#1a3545] font-medium rounded-lg transition flex items-center justify-center"
            >
              Launch App
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-6 border-y border-[#0a2535]">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-3xl font-semibold text-[#FF4E00]">6</div>
            <div className="text-sm text-[#5a6a78] mt-1">Solana Programs</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-semibold text-[#FF4E00]">+5%</div>
            <div className="text-sm text-[#5a6a78] mt-1">Max LTV Bonus</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-semibold text-[#FF4E00]">x402</div>
            <div className="text-sm text-[#5a6a78] mt-1">Native Payments</div>
          </div>
        </div>
      </section>

      {/* Built On */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-xs text-[#5a6a78] uppercase tracking-wider mb-8">Powered by</p>
          <div className="flex justify-center items-center gap-16">
            {/* Solana Logo */}
            <div className="flex items-center gap-3 text-[#5a6a78] hover:text-[#8a9aa8] transition">
              <img src="/solana-logo.svg" alt="Solana" className="h-8 w-auto" />
              <span className="text-sm font-medium">Solana</span>
            </div>
            
            {/* Pyth Logo */}
            <div className="flex items-center gap-3 text-[#5a6a78] hover:text-[#8a9aa8] transition">
              <img src="/pyth-logo.svg" alt="Pyth" className="h-8 w-auto" />
              <span className="text-sm font-medium">Pyth</span>
            </div>

            {/* Jupiter Logo */}
            <div className="flex items-center gap-3 text-[#5a6a78] hover:text-[#8a9aa8] transition">
              <img src="/jupiter-logo.svg" alt="Jupiter" className="h-8 w-auto" />
              <span className="text-sm font-medium">Jupiter</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-[#00111a]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold mb-4">Built for Autonomous Systems</h2>
            <p className="text-[#8a9aa8]">Everything AI agents need to access capital</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              title="Autonomous Borrowing"
              description="Agents borrow within pre-configured limits without human approval."
            />
            <FeatureCard
              title="On-Chain Reputation"
              description="Credit score based on repayment history. Score 400+ unlocks +5% LTV."
            />
            <FeatureCard
              title="x402 Payments"
              description="Native HTTP 402 support for programmatic machine-to-machine payments."
            />
            <FeatureCard
              title="Gradual Deleveraging"
              description="No sudden liquidations. Positions unwound gradually, protecting from MEV."
            />
            <FeatureCard
              title="Flash Loans"
              description="Zero-collateral loans for arbitrage. 0.09% fee, same-transaction repayment."
            />
            <FeatureCard
              title="Composable"
              description="Clean PDAs and CPIs for seamless integration with other protocols."
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold mb-4">How It Works</h2>
            <p className="text-[#8a9aa8]">Three steps to agent credit</p>
          </div>

          <div className="space-y-4">
            <StepCard
              number="01"
              title="Configure Agent"
              description="Set credit limits, collateral requirements, and allowed tokens."
            />
            <StepCard
              number="02"
              title="Autonomous Borrow"
              description="Agent borrows within limits when it needs capital for operations."
            />
            <StepCard
              number="03"
              title="Build Reputation"
              description="Each repayment increases credit score. Better score = better rates."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="p-8 md:p-12 bg-gradient-to-b from-[#0a2535] to-[#001520] border border-[#1a3545] rounded-2xl text-center">
            <h2 className="text-2xl md:text-3xl font-semibold mb-4">
              Credit for the Agentic Economy
            </h2>
            <p className="text-[#8a9aa8] mb-8 max-w-lg mx-auto">
              Built for the Colosseum Agent Hackathon. Your vote helps us build the future of agent finance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol"
                target="_blank"
                className="h-12 px-6 bg-[#FF4E00] hover:bg-[#E64500] text-white font-medium rounded-lg transition flex items-center justify-center"
              >
                Vote on Colosseum
              </a>
              <a
                href="https://github.com/legasicrypto/colosseum-agent-hackathon"
                target="_blank"
                className="h-12 px-6 bg-[#0a2535] hover:bg-[#0d3040] border border-[#1a3545] font-medium rounded-lg transition flex items-center justify-center"
              >
                View Code
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-[#0a2535]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-[#5a6a78]">
            <img src="/logo-white.png" alt="Legasi" className="w-6 h-6" />
            <span className="text-sm">Built by Bouliche 🎱</span>
          </div>
          <div className="flex gap-6 text-sm">
            <a href="https://x.com/legasi_xyz" target="_blank" className="text-[#5a6a78] hover:text-white transition">
              Twitter
            </a>
            <a href="https://github.com/legasicrypto/colosseum-agent-hackathon" target="_blank" className="text-[#5a6a78] hover:text-white transition">
              GitHub
            </a>
            <a href="https://colosseum.com/agent-hackathon/projects/legasi-credit-protocol" target="_blank" className="text-[#5a6a78] hover:text-white transition">
              Colosseum
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 bg-[#051525] border border-[#0a2535] rounded-xl hover:border-[#1a3545] transition">
      <h3 className="text-base font-medium mb-2">{title}</h3>
      <p className="text-sm text-[#6a7a88] leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-6 p-6 bg-[#051525] border border-[#0a2535] rounded-xl">
      <div className="text-2xl font-semibold text-[#FF4E00]">{number}</div>
      <div>
        <h3 className="text-base font-medium mb-1">{title}</h3>
        <p className="text-sm text-[#6a7a88]">{description}</p>
      </div>
    </div>
  );
}
