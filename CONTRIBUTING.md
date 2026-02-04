# Contributing to LEGASI

Thank you for your interest in contributing to Legasi! This document provides guidelines for contributing.

## Development Setup

### Prerequisites

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.30.1
- Node.js 18+
- pnpm or npm

### Quick Start

```bash
# Clone the repository
git clone https://github.com/legasicrypto/colosseum-agent-hackathon.git
cd colosseum-agent-hackathon

# Install Rust dependencies
cargo build

# Build Anchor programs
anchor build

# Install frontend dependencies
cd app && npm install

# Run tests
anchor test

# Start local development
npm run dev
```

## Project Structure

```
.
├── programs/           # Solana programs (Rust)
│   ├── legasi-core/    # Core protocol state
│   ├── legasi-lending/ # Main lending logic
│   ├── legasi-lp/      # LP pools
│   ├── legasi-gad/     # Gradual Auto-Deleveraging
│   ├── legasi-flash/   # Flash loans
│   └── legasi-leverage/# One-click leverage
├── app/                # Next.js frontend
├── tests/              # Anchor tests
└── docs/               # Documentation
```

## Code Style

### Rust
- Follow Rust conventions
- Use `cargo fmt` before committing
- Run `cargo clippy` for linting
- Add doc comments for public items

### TypeScript
- Use TypeScript strict mode
- Follow ESLint rules
- Use meaningful variable names

## Commit Messages

Follow conventional commits:

```
feat: add agent borrow limits
fix: prevent overflow in interest calculation
docs: update architecture diagram
test: add GAD liquidation tests
refactor: simplify PDA derivation
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run tests: `anchor test`
5. Push and open a PR
6. Wait for review

## Testing

### Unit Tests
```bash
cargo test
```

### Integration Tests
```bash
anchor test
```

### Manual Testing
```bash
# Start local validator
solana-test-validator &

# Deploy programs
anchor deploy --provider.cluster localnet

# Run frontend
cd app && npm run dev
```

## Security

If you discover a security vulnerability, please email security@legasi.xyz instead of opening a public issue.

## Questions?

- Open a GitHub issue
- Join our Discord: [link]
- Twitter: @LegasiProtocol

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
