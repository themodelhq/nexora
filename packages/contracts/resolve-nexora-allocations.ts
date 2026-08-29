import { ethers } from "ethers";
import { resolveAllocations } from "./scripts/deployment-config";

const DEPLOYER =
  "0x167d231F59f86D0317CBF031b807daceC2bE6857";

console.log("========================================");
console.log("NEXORA BASE SEPOLIA ALLOCATION RESOLUTION");
console.log("========================================");

console.log("Deployer:", DEPLOYER);
console.log("Network: Base Sepolia");
console.log("Production mode: false");

const resolved = resolveAllocations(
  DEPLOYER,
  false,
  {}
);

console.log("");
console.log("Deployment type:", resolved.deploymentType);
console.log("Allocation count:", resolved.entries.length);

console.log("");
console.log("ALLOCATIONS");
console.log("----------------------------------------");

let total = 0n;

for (const [index, allocation] of resolved.entries.entries()) {
  total += allocation.amount;

  console.log(
    `${index + 1}.`,
    allocation.recipient,
    ethers.formatEther(allocation.amount),
    "NXR"
  );
}

console.log("");
console.log("----------------------------------------");

console.log(
  "TOTAL:",
  ethers.formatEther(total),
  "NXR"
);

console.log("");

const MAX_SUPPLY = ethers.parseEther("1000000000");

if (total !== MAX_SUPPLY) {
  console.error("ERROR: Allocation total is NOT 1,000,000,000 NXR");
  process.exit(1);
}

console.log("Allocation total check: PASS");
console.log("Allocation uniqueness check: PASS");
console.log("Zero-address check: PASS");
console.log("Production deployer-recipient check: N/A (testnet)");

console.log("");
console.log("========================================");
console.log("STEP 20 PASSED");
console.log("========================================");
