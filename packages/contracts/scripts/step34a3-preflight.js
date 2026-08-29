const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("========================================");
  console.log("STEP 34A-3 — DEPLOYMENT PREFLIGHT");
  console.log("========================================");

  // ==================================================
  // 1. ENVIRONMENT
  // ==================================================
  console.log("\n1. ENVIRONMENT");
  console.log("----------------------------------------");

  const envPath = path.join(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    throw new Error(".env file not found");
  }

  require("dotenv").config({ path: envPath });

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is missing");
  }

  console.log(".env: PASS");
  console.log("DEPLOYER_PRIVATE_KEY: PRESENT");
  console.log("Private key: NOT PRINTED");

  // ==================================================
  // 2. DEPLOYER VERIFICATION
  // ==================================================
  console.log("\n2. DEPLOYER VERIFICATION");
  console.log("----------------------------------------");

  const expectedDeployer =
    "0x167d231F59f86D0317CBF031b807daceC2bE6857";

  const provider = hre.ethers.provider;

  const wallet = new hre.ethers.Wallet(
    process.env.DEPLOYER_PRIVATE_KEY,
    provider
  );

  const actualDeployer = wallet.address;

  console.log("Derived deployer:", actualDeployer);
  console.log("Expected deployer:", expectedDeployer);

  if (
    actualDeployer.toLowerCase() !==
    expectedDeployer.toLowerCase()
  ) {
    throw new Error("DEPLOYER ADDRESS MISMATCH");
  }

  console.log("Deployer address: MATCH");
  console.log("DEPLOYER: VERIFIED");

  // ==================================================
  // 3. NETWORK VERIFICATION
  // ==================================================
  console.log("\n3. NETWORK VERIFICATION");
  console.log("----------------------------------------");

  const network = await provider.getNetwork();
  const chainId = network.chainId.toString();

  console.log("Chain ID:", chainId);
  console.log("Expected Chain ID: 84532");

  if (chainId !== "84532") {
    throw new Error(
      `WRONG NETWORK — expected 84532, got ${chainId}`
    );
  }

  console.log("Network: Base Sepolia");
  console.log("NETWORK: VERIFIED");

  // ==================================================
  // 4. RPC CONNECTIVITY
  // ==================================================
  console.log("\n4. RPC CONNECTIVITY");
  console.log("----------------------------------------");

  const blockNumber = await provider.getBlockNumber();

  console.log("Latest block:", blockNumber);

  if (!blockNumber || blockNumber <= 0) {
    throw new Error("Invalid block number");
  }

  console.log("RPC connectivity: PASS");

  // ==================================================
  // 5. DEPLOYER BALANCE
  // ==================================================
  console.log("\n5. DEPLOYER BALANCE");
  console.log("----------------------------------------");

  const balance = await provider.getBalance(actualDeployer);
  const balanceEth = hre.ethers.formatEther(balance);

  console.log("Deployer:", actualDeployer);
  console.log("Balance:", balanceEth, "ETH");

  if (balance === 0n) {
    throw new Error("DEPLOYER HAS ZERO ETH");
  }

  console.log("Balance: PASS");

  // ==================================================
  // 6. FACTORY ARTIFACT
  // ==================================================
  console.log("\n6. NEXORA FACTORY ARTIFACT");
  console.log("----------------------------------------");

  const Factory =
    await hre.ethers.getContractFactory("NexoraFactory");

  console.log("Contract name: NexoraFactory");

  if (!Factory.bytecode || Factory.bytecode === "0x") {
    throw new Error(
      "NexoraFactory bytecode is empty"
    );
  }

  const bytecodeLength =
    (Factory.bytecode.length - 2) / 2;

  console.log(
    "Bytecode length:",
    bytecodeLength,
    "bytes"
  );

  console.log("Factory artifact: PASS");
  console.log("Factory bytecode: PASS");

  // ==================================================
  // 7. DEPLOYMENT TRANSACTION CONSTRUCTION
  // ==================================================
  console.log("\n7. DEPLOYMENT TRANSACTION PREFLIGHT");
  console.log("----------------------------------------");

  const deployTx =
    await Factory.getDeployTransaction();

  if (!deployTx) {
    throw new Error(
      "Unable to construct deployment transaction"
    );
  }

  if (!deployTx.data || deployTx.data === "0x") {
    throw new Error(
      "Deployment transaction contains no bytecode"
    );
  }

  console.log(
    "Deployment transaction: CONSTRUCTED"
  );

  console.log(
    "Transaction data: PRESENT"
  );

  // ==================================================
  // 8. GAS ESTIMATION
  // ==================================================
  console.log("\n8. GAS ESTIMATION");
  console.log("----------------------------------------");

  const gasEstimate =
    await provider.estimateGas({
      from: actualDeployer,
      data: deployTx.data,
    });

  console.log(
    "Estimated gas:",
    gasEstimate.toString()
  );

  if (gasEstimate <= 0n) {
    throw new Error("Invalid gas estimate");
  }

  console.log("Gas estimation: PASS");

  // ==================================================
  // 9. DEPLOYMENT COST
  // ==================================================
  console.log("\n9. DEPLOYMENT COST ESTIMATE");
  console.log("----------------------------------------");

  const feeData =
    await provider.getFeeData();

  const gasPrice =
    feeData.maxFeePerGas ??
    feeData.gasPrice;

  if (!gasPrice) {
    throw new Error(
      "Unable to determine gas price"
    );
  }

  const estimatedCost =
    gasEstimate * gasPrice;

  const estimatedCostEth =
    hre.ethers.formatEther(
      estimatedCost
    );

  console.log(
    "Estimated deployment cost:",
    estimatedCostEth,
    "ETH"
  );

  if (balance < estimatedCost) {
    throw new Error(
      `INSUFFICIENT BALANCE — required approximately ${estimatedCostEth} ETH`
    );
  }

  console.log(
    "Deployment funding: PASS"
  );

  // ==================================================
  // 10. TRANSACTION SAFETY CHECK
  // ==================================================
  console.log("\n10. TRANSACTION SAFETY CHECK");
  console.log("----------------------------------------");

  console.log(
    "Deployment transaction: NOT SENT"
  );

  console.log(
    "Broadcast: DISABLED"
  );

  console.log(
    "Transactions sent by this script: 0"
  );

  // ==================================================
  // FINAL RESULT
  // ==================================================
  console.log("\n========================================");
  console.log("STEP 34A-3 PASSED");
  console.log("========================================");

  console.log("Environment: VERIFIED");
  console.log("Deployer: VERIFIED");
  console.log("Network: BASE SEPOLIA");
  console.log("Chain ID: 84532");
  console.log("RPC: VERIFIED");
  console.log("Balance: VERIFIED");
  console.log("NexoraFactory artifact: VERIFIED");
  console.log("Factory bytecode: VERIFIED");
  console.log("Deployment transaction: CONSTRUCTED");
  console.log("Gas estimation: VERIFIED");
  console.log("Funding: SUFFICIENT");
  console.log("Transactions sent: 0");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\n========================================");
  console.error("STEP 34A-3 FAILED");
  console.error("========================================");

  console.error(error.message || error);

  process.exit(1);
});
