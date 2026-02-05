# Vercel Deployment Guide

## Quick Deploy

### Option 1: One-Click (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `legasicrypto/colosseum-agent-hackathon`
3. Set root directory to `app`
4. Deploy!

### Option 2: CLI

```bash
# Install Vercel CLI (if not already)
npm install -g vercel

# Login
vercel login

# Deploy from project root
cd /path/to/colosseum-agent-hackathon
vercel --prod
```

Or use our script:
```bash
./scripts/deploy-vercel.sh
```

## Environment Variables

Set these in Vercel dashboard (Settings → Environment Variables):

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SOLANA_NETWORK` | `devnet` or `mainnet-beta` | Yes |
| `NEXT_PUBLIC_RPC_URL` | Solana RPC endpoint | Yes |
| `BRIDGE_API_KEY` | Bridge.xyz API key | Optional (for off-ramp) |

## Project Settings

The `vercel.json` is already configured:
- Build command: `cd app && npm install && npm run build`
- Output directory: `app/.next`

## After Deployment

1. Copy the production URL (e.g., `legasi-app.vercel.app`)
2. Update README.md with the live demo link
3. Test all pages work correctly
4. Add URL to hackathon submission

## Troubleshooting

### Build fails
- Check `app/` folder has all dependencies
- Run `npm run build` locally first

### Wallet not connecting
- Check `NEXT_PUBLIC_SOLANA_NETWORK` is set
- Ensure Phantom/Solflare is on devnet

### API routes failing
- Check environment variables in Vercel dashboard
- View function logs in Vercel dashboard
