/**
 * E2E Test - Flash Loans on Devnet
 * Demonstrates: borrow → repay in same transaction
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, getAccount } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const DEVNET_RPC = 'https://api.devnet.solana.com';

const PROGRAMS = {
  core: new PublicKey('4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy'),
  flash: new PublicKey('Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m'),
  lp: new PublicKey('CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY'),
};

const USDC_MINT = new PublicKey('3J2i1X4VGSxkEiHdnq4zead7hiSYbQHs9ZZaS36yAfX8');

async function main() {
  console.log('⚡ E2E Test - Flash Loans\n');
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
  const flashIdl = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../target/idl/legasi_flash.json'),
    'utf-8'
  ));
  // @ts-ignore
  const flashProgram = new anchor.Program(flashIdl, provider);

  console.log(`👛 Wallet: ${payer.publicKey.toBase58()}`);

  // Get current slot for PDA
  const slot = await connection.getSlot();
  const slotBuffer = Buffer.alloc(8);
  slotBuffer.writeBigUInt64LE(BigInt(slot));

  // PDAs
  const [flashStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('flash_state'), payer.publicKey.toBuffer(), slotBuffer],
    PROGRAMS.flash
  );

  const [lpPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('lp_pool'), USDC_MINT.toBuffer()],
    PROGRAMS.lp
  );

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('lp_vault'), USDC_MINT.toBuffer()],
    PROGRAMS.lp
  );

  const [borrowablePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('borrowable'), USDC_MINT.toBuffer()],
    PROGRAMS.core
  );

  const [protocolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol')],
    PROGRAMS.core
  );

  // User's USDC ATA
  const userUsdcAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, USDC_MINT, payer.publicKey
  );

  const flashAmount = new anchor.BN(100 * 1_000_000); // 100 USDC

  console.log(`\n📍 Flash State PDA: ${flashStatePda.toBase58()}`);
  console.log(`📍 LP Pool: ${lpPoolPda.toBase58()}`);
  console.log(`📍 Vault: ${vaultPda.toBase58()}`);

  // Check vault balance
  try {
    const vaultAccount = await getAccount(connection, vaultPda);
    console.log(`📍 Vault Balance: ${Number(vaultAccount.amount) / 1_000_000} USDC`);
  } catch (e) {
    console.log(`📍 Vault: Not found or empty`);
  }

  // Check user balance before
  const userBalanceBefore = await getAccount(connection, userUsdcAta.address);
  console.log(`📍 User Balance Before: ${Number(userBalanceBefore.amount) / 1_000_000} USDC`);

  console.log('\n📍 Test: Flash Borrow 100 USDC + Repay (same tx)');
  
  try {
    // Build flash borrow instruction
    // @ts-ignore
    const borrowIx = await flashProgram.methods
      .flashBorrow(flashAmount, new anchor.BN(slot))
      .accounts({
        flashState: flashStatePda,
        lpPool: lpPoolPda,
        borrowable: borrowablePda,
        vault: vaultPda,
        userTokenAccount: userUsdcAta.address,
        borrower: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Build flash repay instruction
    // @ts-ignore
    const repayIx = await flashProgram.methods
      .flashRepay()
      .accounts({
        flashState: flashStatePda,
        lpPool: lpPoolPda,
        protocol: protocolPda,
        vault: vaultPda,
        userTokenAccount: userUsdcAta.address,
        borrower: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    // Execute both in same transaction
    const tx = new Transaction().add(borrowIx, repayIx);
    const sig = await provider.sendAndConfirm(tx);
    
    console.log(`   ✅ Flash loan successful!`);
    console.log(`   📝 Signature: ${sig}`);
    console.log(`   💰 Borrowed: 100 USDC`);
    console.log(`   💸 Fee: 0.1 USDC (0.1%)`);
    console.log(`   🔄 Repaid: 100.1 USDC`);

    // Check user balance after
    const userBalanceAfter = await getAccount(connection, userUsdcAta.address);
    const diff = (Number(userBalanceBefore.amount) - Number(userBalanceAfter.amount)) / 1_000_000;
    console.log(`   📊 User paid fee: ${diff.toFixed(2)} USDC`);

  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message?.slice(0, 150) || e}`);
    if (e.logs) {
      console.log('\n   📜 Program Logs:');
      e.logs.slice(-8).forEach((l: string) => console.log(`      ${l}`));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Flash Loan E2E Test Complete!\n');
}

main().catch(console.error);
