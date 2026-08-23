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

console.log(
  "Expected:",
  ethers.formatEther(ethers.parseEther("1000000000")),
  "NXR"
);

if (total !== ethers.parseEther("1000000000")) {
  throw new Error("ERROR: Allocation total is NOT 1,000,000,000 NXR");
}

const unique = new Set(
  resolved.entries.map(
    (x) => x.recipient.toLowerCase()
  )
);

if (unique.size !== resolved.entries.length) {
  throw new Error("ERROR: Duplicate allocation recipient detected");
}

for (const allocation of resolved.entries) {
  if (allocation.recipient === ethers.ZeroAddress) {
    throw new Error("ERROR: Zero address allocation detected");
  }
}

console.log("");
console.log("Unique recipients:", unique.size);
console.log("Zero addresses: 0");
console.log("Allocation total: PASS");
console.log("Recipient uniqueness: PASS");

console.log("");
console.log("========================================");
console.log("STEP 20 PASSED");
console.log("========================================");
