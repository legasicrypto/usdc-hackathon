import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const DEVNET_RPC = 'https://api.devnet.solana.com';

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Load wallet
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  if (!fs.existsSync(walletPath)) {
    console.error('Wallet not found at', walletPath);
    process.exit(1);
  }
  
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  
  console.log('Wallet:', payer.publicKey.toBase58());
  
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');
  
  if (balance < 0.1 * 1e9) {
    console.error('Insufficient balance. Need at least 0.1 SOL');
    process.exit(1);
  }
  
  // Create cbBTC test mint (8 decimals like real BTC)
  console.log('\nCreating test cbBTC mint...');
  const cbbtcMint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority
    8 // decimals (BTC has 8)
  );
  
  console.log('✅ cbBTC Mint:', cbbtcMint.toBase58());
  
  // Create ATA for payer
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    cbbtcMint,
    payer.publicKey
  );
  
  console.log('✅ cbBTC ATA:', ata.address.toBase58());
  
  // Mint some test cbBTC (10 cbBTC = 10 * 10^8)
  const mintAmount = 10 * 10 ** 8;
  await mintTo(
    connection,
    payer,
    cbbtcMint,
    ata.address,
    payer,
    mintAmount
  );
  
  console.log('✅ Minted 10 test cbBTC');
  
  // Save to file
  const output = {
    network: 'devnet',
    timestamp: new Date().toISOString(),
    cbbtc: {
      mint: cbbtcMint.toBase58(),
      decimals: 8,
      ata: ata.address.toBase58()
    }
  };
  
  fs.writeFileSync('.cbbtc-token.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Saved to .cbbtc-token.json');
  
  console.log('\n=== Next steps ===');
  console.log('1. Initialize cbBTC price feed:');
  console.log('   npx ts-node scripts/init-price-feeds.ts --cbbtc', cbbtcMint.toBase58());
  console.log('2. Register cbBTC as collateral');
}

main().catch(console.error);
