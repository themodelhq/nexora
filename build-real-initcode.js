const fs = require("fs");
const { ethers } = require("ethers");

const artifactPath =
  "/content/nexora/packages/contracts/artifacts/src/token/NexoraToken.sol/NexoraToken.json";

const artifact = JSON.parse(
  fs.readFileSync(artifactPath, "utf8")
);

const deployer = "0x167d231F59f86D0317CBF031b807daceC2bE6857";

const allocations = [
  {
    recipient: deployer,
    amount: ethers.parseEther("350000000")
  },
  {
    recipient: "0x0000000000000000000000000000000000000001",
    amount: ethers.parseEther("150000000")
  },
  {
    recipient: "0x0000000000000000000000000000000000000002",
    amount: ethers.parseEther("150000000")
  },
  {
    recipient: "0x0000000000000000000000000000000000000003",
    amount: ethers.parseEther("100000000")
  },
  {
    recipient: "0x0000000000000000000000000000000000000004",
    amount: ethers.parseEther("50000000")
  },
  {
    recipient: "0x0000000000000000000000000000000000000005",
    amount: ethers.parseEther("100000000")
  },
  {
    recipient: "0x0000000000000000000000000000000000000006",
    amount: ethers.parseEther("100000000")
  }
];

const total = allocations.reduce(
  (sum, x) => sum + x.amount,
  0n
);

const maxSupply = ethers.parseEther("1000000000");

if (total !== maxSupply) {
  throw new Error(
    `Allocation total incorrect: ${ethers.formatEther(total)}`
  );
}

const constructorTypes = [
  "tuple(address recipient,uint256 amount)[]"
];

const encodedConstructor = ethers.AbiCoder.defaultAbiCoder().encode(
  constructorTypes,
  [allocations]
);

const initCode =
  artifact.bytecode + encodedConstructor.slice(2);

console.log("========================================");
console.log("REAL NEXORA INITCODE");
console.log("========================================");

console.log("Deployer:", deployer);
console.log("Allocation count:", allocations.length);
console.log("Total supply:", ethers.formatEther(total), "NXR");

console.log(
  "Creation bytecode bytes:",
  (artifact.bytecode.length - 2) / 2
);

console.log(
  "Constructor encoding bytes:",
  (encodedConstructor.length - 2) / 2
);

console.log(
  "Final CREATE2 initcode bytes:",
  (initCode.length - 2) / 2
);

console.log("Initcode begins:", initCode.slice(0, 42));
console.log("Initcode length:", initCode.length);

fs.writeFileSync(
  "/content/nexora/real-nexora-initcode.txt",
  initCode
);

fs.writeFileSync(
  "/content/nexora/real-nexora-allocations.json",
  JSON.stringify(
    allocations.map(x => ({
      recipient: x.recipient,
      amount: x.amount.toString()
    })),
    null,
    2
  )
);

console.log("Saved:");
console.log("/content/nexora/real-nexora-initcode.txt");
console.log("/content/nexora/real-nexora-allocations.json");

console.log("========================================");
console.log("STEP 14 PASSED");
console.log("========================================");
