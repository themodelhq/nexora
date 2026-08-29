const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("========================================");
  console.log("STEP 34A-4 — NEXORA FACTORY DEPLOYMENT");
  console.log("========================================");

  require("dotenv").config();

  // ==================================================
  // 1. NETWORK
  // ==================================================
  console.log("\n1. NETWORK VERIFICATION");
  console.log("----------------------------------------");

  const provider = hre.ethers.provider;
  const network = await provider.getNetwork();

  console.log("Chain ID:", network.chainId.toString());

  if (network.chainId.toString() !== "84532") {
    throw new Error(
      `WRONG NETWORK — expected Base Sepolia (84532), got ${network.chainId}`
    );
  }

  console.log("Network: Base Sepolia");
  console.log("NETWORK: VERIFIED");

  // ==================================================
  // 2. DEPLOYER
  // ==================================================
  console.log("\n2. DEPLOYER VERIFICATION");
  console.log("----------------------------------------");

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is missing");
  }

  const wallet = new hre.ethers.Wallet(
    process.env.DEPLOYER_PRIVATE_KEY,
    provider
  );

  const expectedDeployer =
    "0x167d231F59f86D0317CBF031b807daceC2bE6857";

  console.log("Deployer:", wallet.address);

  if (
    wallet.address.toLowerCase() !==
    expectedDeployer.toLowerCase()
  ) {
    throw new Error("DEPLOYER ADDRESS MISMATCH");
  }

  console.log("Deployer address: MATCH");
  console.log("DEPLOYER: VERIFIED");

  // ==================================================
  // 3. BALANCE
  // ==================================================
  console.log("\n3. DEPLOYER BALANCE");
  console.log("----------------------------------------");

  const balance = await provider.getBalance(wallet.address);

  console.log(
    "Balance:",
    hre.ethers.formatEther(balance),
    "ETH"
  );

  if (balance === 0n) {
    throw new Error("DEPLOYER HAS ZERO ETH");
  }

  console.log("Balance: PASS");

  // ==================================================
  // 4. FACTORY DEPLOYMENT
  // ==================================================
  console.log("\n4. FACTORY DEPLOYMENT");
  console.log("----------------------------------------");

  console.log("Contract: NexoraFactory");
  console.log("Broadcast: ENABLED");
  console.log("Transaction: ABOUT TO BE SENT");

  const Factory =
    await hre.ethers.getContractFactory(
      "NexoraFactory",
      wallet
    );

  const factory = await Factory.deploy();

  console.log("\nDeployment transaction sent.");
  console.log("Transaction hash:", factory.deploymentTransaction().hash);

  console.log("\nWaiting for confirmation...");

  await factory.waitForDeployment();

  const factoryAddress =
    await factory.getAddress();

  const receipt =
    await factory.deploymentTransaction().wait();

  // ==================================================
  // 5. DEPLOYMENT RECEIPT
  // ==================================================
  console.log("\n5. DEPLOYMENT RECEIPT");
  console.log("----------------------------------------");

  console.log(
    "Factory address:",
    factoryAddress
  );

  console.log(
    "Transaction hash:",
    receipt.hash
  );

  console.log(
    "Block number:",
    receipt.blockNumber
  );

  console.log(
    "Gas used:",
    receipt.gasUsed.toString()
  );

  console.log(
    "Status:",
    receipt.status
  );

  if (receipt.status !== 1) {
    throw new Error(
      "FACTORY DEPLOYMENT TRANSACTION FAILED"
    );
  }

  // ==================================================
  // 6. ON-CHAIN BYTECODE
  // ==================================================
  console.log("\n6. ON-CHAIN BYTECODE VERIFICATION");
  console.log("----------------------------------------");

  const deployedCode =
    await provider.getCode(factoryAddress);

  console.log(
    "On-chain bytecode length:",
    (deployedCode.length - 2) / 2,
    "bytes"
  );

  if (!deployedCode || deployedCode === "0x") {
    throw new Error(
      "NO CONTRACT BYTECODE FOUND AT FACTORY ADDRESS"
    );
  }

  console.log("Contract bytecode: PRESENT");
  console.log("ON-CHAIN CODE: VERIFIED");

  // ==================================================
  // 7. SAVE DEPLOYMENT RECORD
  // ==================================================
  console.log("\n7. SAVING DEPLOYMENT RECORD");
  console.log("----------------------------------------");

  const deploymentRecord = {
    contract: "NexoraFactory",
    network: "baseSepolia",
    chainId: 84532,
    deployer: wallet.address,
    factoryAddress,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
    onChainBytecodeLength:
      (deployedCode.length - 2) / 2,
    deployedAt: new Date().toISOString()
  };

  const outputPath =
    path.join(
      process.cwd(),
      "deployments",
      "step34a4-nexora-factory.json"
    );

  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true }
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      deploymentRecord,
      null,
      2
    )
  );

  console.log(
    "Deployment record:",
    outputPath
  );

  // ==================================================
  // FINAL
  // ==================================================
  console.log("\n========================================");
  console.log("STEP 34A-4 PASSED");
  console.log("========================================");

  console.log(
    "Factory address:",
    factoryAddress
  );

  console.log(
    "Transaction hash:",
    receipt.hash
  );

  console.log(
    "Block number:",
    receipt.blockNumber
  );

  console.log(
    "Gas used:",
    receipt.gasUsed.toString()
  );

  console.log("Transaction status: SUCCESS");
  console.log("On-chain bytecode: VERIFIED");

  console.log("========================================");
}

main().catch((error) => {
  console.error("\n========================================");
  console.error("STEP 34A-4 FAILED");
  console.error("========================================");

  console.error(
    error.message || error
  );

  process.exit(1);
});
