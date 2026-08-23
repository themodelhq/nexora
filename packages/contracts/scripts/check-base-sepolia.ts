import { ethers } from "hardhat";

async function main() {
    const network = await ethers.provider.getNetwork();
    const signers = await ethers.getSigners();

    if (signers.length === 0) {
        throw new Error(
            "NO DEPLOYER ACCOUNT: DEPLOYER_PRIVATE_KEY is not being loaded."
        );
    }

    const deployer = signers[0];
    const balance = await ethers.provider.getBalance(deployer.address);

    console.log("");
    console.log("========================================");
    console.log("NEXORA BASE SEPOLIA CONNECTION CHECK");
    console.log("========================================");

    console.log("Chain ID:", network.chainId.toString());
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");

    console.log("========================================");

    if (network.chainId !== 84532n) {
        throw new Error(
            `WRONG NETWORK: expected Base Sepolia 84532, got ${network.chainId}`
        );
    }

    if (balance === 0n) {
        throw new Error("DEPLOYER HAS NO ETH");
    }

    console.log("NETWORK CHECK: PASS");
    console.log("DEPLOYER CHECK: PASS");
    console.log("BALANCE CHECK: PASS");
    console.log("========================================");
    console.log("STEP 24 PASSED");
    console.log("========================================");
}

main().catch((error) => {
    console.error("");
    console.error("STEP 24 FAILED");
    console.error(error);
    process.exit(1);
});
