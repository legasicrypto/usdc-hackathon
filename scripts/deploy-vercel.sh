#!/bin/bash
# Deploy Legasi app to Vercel
# Run from project root: ./scripts/deploy-vercel.sh

set -e

echo "🚀 Deploying Legasi to Vercel..."

# Check if logged in
if ! npx vercel whoami > /dev/null 2>&1; then
  echo "⚠️  Not logged in to Vercel. Running login..."
  npx vercel login
fi

# Production deployment
echo "📦 Building and deploying to production..."
npx vercel --prod

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Copy the production URL"
echo "2. Add it to README.md"
echo "3. Update vercel.json if needed"
