/**
 * Demo: Price Feed Update → LTV Change
 * Shows how a price drop affects position health
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const DEVNET_RPC = 'https://api.devnet.solana.com';

const PROGRAMS = {
  core: new PublicKey('4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy'),
  lending: new PublicKey('9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw'),
};

const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

async function main() {
  console.log('📊 Demo: Price Feed & LTV Impact\n');
  console.log('='.repeat(50));

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(
      path.join(process.env.HOME || '~', '.config/solana/id.json'),
      'utf-8'
    )))
  );
  
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: 'confirmed' }
  );

  // Load programs
  const coreIdl = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../target/idl/legasi_core.json'),
    'utf-8'
  ));
  const lendingIdl = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../target/idl/legasi_lending.json'),
    'utf-8'
  ));
  // @ts-ignore
  const coreProgram = new anchor.Program(coreIdl, provider);
  // @ts-ignore
  const lendingProgram = new anchor.Program(lendingIdl, provider);

  // PDAs
  const [positionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), payer.publicKey.toBuffer()],
    PROGRAMS.lending
  );

  const [priceFeedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('price'), SOL_MINT.toBuffer()],
    PROGRAMS.core
  );

  // Get current position
  // @ts-ignore
  const position = await lendingProgram.account.position.fetch(positionPda);
  
  // Get current price
  // @ts-ignore  
  const priceFeed = await coreProgram.account.priceFeed.fetch(priceFeedPda);
  const priceValue = priceFeed.priceUsd6dec || priceFeed.price_usd_6dec || { toNumber: () => 100_000_000 };
  const currentPrice = (typeof priceValue.toNumber === 'function' ? priceValue.toNumber() : priceValue) / 1_000_000;

  // Calculate current LTV
  let totalCollateralUsd = 0;
  for (const c of position.collaterals) {
    const amount = c.amount.toNumber() / LAMPORTS_PER_SOL;
    totalCollateralUsd += amount * currentPrice;
  }

  let totalBorrowUsd = 0;
  for (const b of position.borrows) {
    totalBorrowUsd += (b.amount.toNumber() + b.accruedInterest.toNumber()) / 1_000_000;
  }

  const currentLtv = totalBorrowUsd > 0 ? (totalBorrowUsd / totalCollateralUsd) * 100 : 0;

  console.log(`\n📍 Current State:`);
  console.log(`   SOL Price: $${currentPrice}`);
  console.log(`   Collateral: $${totalCollateralUsd.toFixed(2)}`);
  console.log(`   Borrowed: $${totalBorrowUsd.toFixed(2)}`);
  console.log(`   LTV: ${currentLtv.toFixed(1)}%`);
  console.log(`   Max LTV: 75%`);
  console.log(`   Health: ${currentLtv < 75 ? '🟢 Healthy' : currentLtv < 80 ? '🟡 Warning' : '🔴 At Risk'}`);

  // Simulate price changes
  console.log(`\n📉 Simulating Price Impact:\n`);
  
  const priceScenarios = [0.9, 0.8, 0.7, 0.6, 0.5]; // -10%, -20%, -30%, -40%, -50%
  
  for (const multiplier of priceScenarios) {
    const newPrice = currentPrice * multiplier;
    const newCollateralUsd = (totalCollateralUsd / currentPrice) * newPrice;
    const newLtv = totalBorrowUsd > 0 ? (totalBorrowUsd / newCollateralUsd) * 100 : 0;
    
    let status = '🟢';
    let label = 'Healthy';
    if (newLtv >= 90) { status = '🔴'; label = 'GAD ACTIVE'; }
    else if (newLtv >= 80) { status = '🟠'; label = 'GAD Warning'; }
    else if (newLtv >= 75) { status = '🟡'; label = 'Max LTV'; }
    
    const change = ((multiplier - 1) * 100).toFixed(0);
    console.log(`   SOL ${change}% ($${newPrice.toFixed(0)}) → LTV: ${newLtv.toFixed(1)}% ${status} ${label}`);
  }

  console.log(`\n💡 With GAD enabled, positions are gradually deleveraged`);
  console.log(`   instead of instant liquidation. This protects users!`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Demo Complete!\n');
}

main().catch(console.error);
