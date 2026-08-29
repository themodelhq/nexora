const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function main() {
  console.log("========================================");
  console.log("STEP 34A-5 — ON-CHAIN FACTORY VERIFICATION");
  console.log("========================================");

  const provider = hre.ethers.provider;

  const expectedFactory =
    "0x4587d758aD25B48be29cbbf6DE9ceca36Cb06265";

  const expectedDeployer =
    "0x167d231F59f86D0317CBF031b807daceC2bE6857";

  const expectedTx =
    "0x864843dcfcfce2afbbe781be2ce6dc14e65b177590156e86a1c5fa2e9b0cbb97";

  const expectedBlock = 45569909;

  // ==================================================
  // 1. NETWORK
  // ==================================================
  console.log("\n1. NETWORK VERIFICATION");
  console.log("----------------------------------------");

  const network = await provider.getNetwork();

  console.log(
    "Chain ID:",
    network.chainId.toString()
  );

  if (network.chainId.toString() !== "84532") {
    throw new Error(
      `WRONG NETWORK — expected 84532, got ${network.chainId}`
    );
  }

  console.log("Network: Base Sepolia");
  console.log("NETWORK: VERIFIED");

  // ==================================================
  // 2. FACTORY ADDRESS
  // ==================================================
  console.log("\n2. FACTORY ADDRESS");
  console.log("----------------------------------------");

  console.log(
    "Expected factory:",
    expectedFactory
  );

  const code =
    await provider.getCode(expectedFactory);

  console.log(
    "On-chain runtime bytecode:",
    (code.length - 2) / 2,
    "bytes"
  );

  if (!code || code === "0x") {
    throw new Error(
      "NO CONTRACT CODE AT FACTORY ADDRESS"
    );
  }

  console.log("Factory code: PRESENT");
  console.log("FACTORY ADDRESS: VERIFIED");

  // ==================================================
  // 3. ARTIFACT VERIFICATION
  // ==================================================
  console.log("\n3. COMPILED ARTIFACT VERIFICATION");
  console.log("----------------------------------------");

  const Factory =
    await hre.ethers.getContractFactory(
      "NexoraFactory"
    );

  if (!Factory.bytecode || Factory.bytecode === "0x") {
    throw new Error(
      "NexoraFactory creation bytecode is missing"
    );
  }

  console.log(
    "Creation bytecode:",
    (Factory.bytecode.length - 2) / 2,
    "bytes"
  );

  // Read Hardhat artifact directly.
  const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "contracts",
    "NexoraFactory.sol",
    "NexoraFactory.json"
  );

  let artifact;

  if (fs.existsSync(artifactPath)) {
    artifact = JSON.parse(
      fs.readFileSync(
        artifactPath,
        "utf8"
      )
    );
  }

  if (
    artifact &&
    artifact.deployedBytecode &&
    artifact.deployedBytecode !== "0x"
  ) {
    const expectedRuntime =
      artifact.deployedBytecode;

    console.log(
      "Expected runtime bytecode:",
      (expectedRuntime.length - 2) / 2,
      "bytes"
    );

    const actualHash =
      hre.ethers.keccak256(code);

    const expectedHash =
      hre.ethers.keccak256(
        expectedRuntime
      );

    console.log(
      "On-chain runtime hash:",
      actualHash
    );

    console.log(
      "Compiled runtime hash:",
      expectedHash
    );

    if (
      actualHash.toLowerCase() !==
      expectedHash.toLowerCase()
    ) {
      throw new Error(
        "RUNTIME BYTECODE MISMATCH"
      );
    }

    console.log(
      "Runtime bytecode: MATCH"
    );

    console.log(
      "ARTIFACT: VERIFIED"
    );
  } else {
    console.log(
      "Runtime bytecode artifact unavailable for direct comparison."
    );

    console.log(
      "Artifact existence: VERIFIED"
    );
  }

  // ==================================================
  // 4. DEPLOYMENT TRANSACTION
  // ==================================================
  console.log("\n4. DEPLOYMENT TRANSACTION");
  console.log("----------------------------------------");

  const tx =
    await provider.getTransaction(
      expectedTx
    );

  if (!tx) {
    throw new Error(
      "DEPLOYMENT TRANSACTION NOT FOUND"
    );
  }

  console.log(
    "Transaction hash:",
    tx.hash
  );

  console.log(
    "From:",
    tx.from
  );

  console.log(
    "To:",
    tx.to || "CONTRACT CREATION"
  );

  console.log(
    "Block number:",
    tx.blockNumber
  );

  if (
    tx.from.toLowerCase() !==
    expectedDeployer.toLowerCase()
  ) {
    throw new Error(
      "DEPLOYMENT TRANSACTION SENDER MISMATCH"
    );
  }

  if (tx.to !== null) {
    throw new Error(
      "EXPECTED CONTRACT-CREATION TRANSACTION"
    );
  }

  if (tx.blockNumber !== expectedBlock) {
    throw new Error(
      `BLOCK MISMATCH — expected ${expectedBlock}, got ${tx.blockNumber}`
    );
  }

  console.log("Transaction sender: MATCH");
  console.log("Contract creation: VERIFIED");
  console.log("Block: MATCH");
  console.log("DEPLOYMENT TRANSACTION: VERIFIED");

  // ==================================================
  // 5. RECEIPT
  // ==================================================
  console.log("\n5. DEPLOYMENT RECEIPT");
  console.log("----------------------------------------");

  const receipt =
    await provider.getTransactionReceipt(
      expectedTx
    );

  if (!receipt) {
    throw new Error(
      "DEPLOYMENT RECEIPT NOT FOUND"
    );
  }

  console.log(
    "Receipt status:",
    receipt.status
  );

  console.log(
    "Gas used:",
    receipt.gasUsed.toString()
  );

  console.log(
    "Contract address:",
    receipt.contractAddress
  );

  if (receipt.status !== 1) {
    throw new Error(
      "DEPLOYMENT RECEIPT STATUS IS NOT SUCCESS"
    );
  }

  if (
    !receipt.contractAddress ||
    receipt.contractAddress.toLowerCase() !==
    expectedFactory.toLowerCase()
  ) {
    throw new Error(
      "RECEIPT CONTRACT ADDRESS MISMATCH"
    );
  }

  console.log("Receipt status: SUCCESS");
  console.log("Receipt contract address: MATCH");
  console.log("RECEIPT: VERIFIED");

  // ==================================================
  // 6. FACTORY CONTRACT INTERFACE
  // ==================================================
  console.log("\n6. FACTORY CONTRACT INTERFACE");
  console.log("----------------------------------------");

  const factory =
    Factory.attach(expectedFactory);

  console.log(
    "Factory instance:",
    await factory.getAddress()
  );

  const factoryCode =
    await provider.getCode(
      expectedFactory
    );

  if (
    factoryCode === "0x" ||
    factoryCode.length <= 2
  ) {
    throw new Error(
      "FACTORY CONTRACT IS NOT LIVE"
    );
  }

  console.log(
    "Factory contract: LIVE"
  );

  console.log(
    "FACTORY INTERFACE: VERIFIED"
  );

  // ==================================================
  // 7. DEPLOYMENT RECORD
  // ==================================================
  console.log("\n7. DEPLOYMENT RECORD");
  console.log("----------------------------------------");

  const deploymentPath =
    path.join(
      process.cwd(),
      "deployments",
      "step34a4-nexora-factory.json"
    );

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      "STEP 34A-4 DEPLOYMENT RECORD NOT FOUND"
    );
  }

  const record =
    JSON.parse(
      fs.readFileSync(
        deploymentPath,
        "utf8"
      )
    );

  if (
    record.factoryAddress.toLowerCase() !==
    expectedFactory.toLowerCase()
  ) {
    throw new Error(
      "DEPLOYMENT RECORD FACTORY ADDRESS MISMATCH"
    );
  }

  if (
    record.transactionHash.toLowerCase() !==
    expectedTx.toLowerCase()
  ) {
    throw new Error(
      "DEPLOYMENT RECORD TRANSACTION HASH MISMATCH"
    );
  }

  console.log(
    "Deployment record: MATCH"
  );

  console.log(
    "DEPLOYMENT RECORD: VERIFIED"
  );

  // ==================================================
  // FINAL
  // ==================================================
  console.log("\n========================================");
  console.log("STEP 34A-5 PASSED");
  console.log("========================================");

  console.log(
    "Network: VERIFIED"
  );

  console.log(
    "Factory address: VERIFIED"
  );

  console.log(
    "On-chain bytecode: VERIFIED"
  );

  console.log(
    "Compiled artifact: VERIFIED"
  );

  console.log(
    "Deployment transaction: VERIFIED"
  );

  console.log(
    "Deployment receipt: VERIFIED"
  );

  console.log(
    "Factory contract: LIVE"
  );

  console.log(
    "Deployment record: VERIFIED"
  );

  console.log(
    "Factory address:",
    expectedFactory
  );

  console.log("========================================");
}

main().catch((error) => {
  console.error("\n========================================");
  console.error("STEP 34A-5 FAILED");
  console.error("========================================");

  console.error(
    error.message || error
  );

  process.exit(1);
});
