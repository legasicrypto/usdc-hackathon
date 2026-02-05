import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { LegasiCore } from "../target/types/legasi_core";

describe("init-protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LegasiCore as Program<LegasiCore>;
  
  it("Initialize Protocol", async () => {
    const [protocolPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );
    
    console.log("Protocol PDA:", protocolPDA.toString());
    console.log("Program ID:", program.programId.toString());
    console.log("Admin:", provider.wallet.publicKey.toString());
    
    try {
      const tx = await program.methods
        .initializeProtocol(provider.wallet.publicKey) // treasury as arg
        .accounts({
          protocol: protocolPDA,
          admin: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ Protocol initialized! TX:", tx);
    } catch (err: any) {
      console.log("Error:", err.message);
      if (err.logs) console.log("Logs:", err.logs);
    }
  });
});
