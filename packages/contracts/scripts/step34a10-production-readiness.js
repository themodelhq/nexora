
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {

    console.log("============================================================");
    console.log("STEP 34A-10 — CREATE2 PRODUCTION READINESS TEST");
    console.log("============================================================");

    const provider = hre.ethers.provider;

    const FACTORY_ADDRESS =
        "0x4587d758aD25B48be29cbbf6DE9ceca36Cb06265";

    const EXPECTED_DEPLOYER =
        "0x167d231F59f86D0317CBF031b807daceC2bE6857";

    const EXPECTED_CHAIN_ID = 84532;

    const EXISTING_TEST_ADDRESS =
        "0xa6f7bff2803cB4a7774c69Ed74FF72DEcfe612CD";

    const EXISTING_SALT =
        "0x46b8ffceffba15eaccc6d3137d007985fea5e9923e16334350a27794c04e6a97";

    // ========================================================
    // 1. NETWORK
    // ========================================================

    console.log("\n1. NETWORK VERIFICATION");
    console.log("----------------------------------------");

    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("Chain ID:", chainId);
    console.log("Expected Chain ID:", EXPECTED_CHAIN_ID);

    if (chainId !== EXPECTED_CHAIN_ID) {
        throw new Error("Wrong network");
    }

    console.log("Network: Base Sepolia");
    console.log("NETWORK: VERIFIED");

    // ========================================================
    // 2. DEPLOYER
    // ========================================================

    console.log("\n2. DEPLOYER VERIFICATION");
    console.log("----------------------------------------");

    require("dotenv").config({
        path: path.join(process.cwd(), ".env")
    });

    if (!process.env.DEPLOYER_PRIVATE_KEY) {
        throw new Error("DEPLOYER_PRIVATE_KEY missing");
    }

    const wallet = new hre.ethers.Wallet(
        process.env.DEPLOYER_PRIVATE_KEY,
        provider
    );

    console.log("Deployer:", wallet.address);
    console.log("Expected:", EXPECTED_DEPLOYER);

    if (
        wallet.address.toLowerCase() !==
        EXPECTED_DEPLOYER.toLowerCase()
    ) {
        throw new Error("Deployer mismatch");
    }

    console.log("DEPLOYER: VERIFIED");
    console.log("Private key: NOT PRINTED");

    // ========================================================
    // 3. FACTORY
    // ========================================================

    console.log("\n3. FACTORY VERIFICATION");
    console.log("----------------------------------------");

    const factoryCode =
        await provider.getCode(FACTORY_ADDRESS);

    const factoryBytes =
        (factoryCode.length - 2) / 2;

    console.log(
        "Factory runtime bytecode:",
        factoryBytes,
        "bytes"
    );

    if (factoryCode === "0x") {
        throw new Error("Factory has no runtime code");
    }

    console.log("FACTORY: VERIFIED");

    const factoryAbi = [
        "function predictAddress(bytes32 salt, bytes initcode) view returns (address)",
        "function deploy(bytes32 salt, bytes initcode) returns (address deployed)"
    ];

    const factory =
        new hre.ethers.Contract(
            FACTORY_ADDRESS,
            factoryAbi,
            wallet
        );

    // ========================================================
    // 4. LOAD TEST CONTRACT
    // ========================================================

    console.log("\n4. TEST CONTRACT ARTIFACT");
    console.log("----------------------------------------");

    const artifactPath = path.join(
        process.cwd(),
        "artifacts",
        "src",
        "test",
        "NexoraDeterministicTestTarget.sol",
        "NexoraDeterministicTestTarget.json"
    );

    if (!fs.existsSync(artifactPath)) {
        throw new Error("Test artifact missing");
    }

    const artifact =
        JSON.parse(
            fs.readFileSync(
                artifactPath,
                "utf8"
            )
        );

    const initcode =
        artifact.bytecode;

    if (!initcode || initcode === "0x") {
        throw new Error("Creation bytecode missing");
    }

    const initcodeHash =
        hre.ethers.keccak256(initcode);

    console.log(
        "Initcode bytes:",
        (initcode.length - 2) / 2
    );

    console.log(
        "Initcode hash:",
        initcodeHash
    );

    console.log("INITCODE: VERIFIED");

    // ========================================================
    // 5. PREDICTION
    // ========================================================

    console.log("\n5. DETERMINISTIC ADDRESS PREDICTION");
    console.log("----------------------------------------");

    const predictedAddress =
        await factory.predictAddress(
            EXISTING_SALT,
            initcode
        );

    console.log(
        "Predicted address:",
        predictedAddress
    );

    if (
        predictedAddress.toLowerCase() !==
        EXISTING_TEST_ADDRESS.toLowerCase()
    ) {
        throw new Error(
            "Deterministic address mismatch"
        );
    }

    console.log("Address matches recorded deployment: YES");
    console.log("PREDICTION: VERIFIED");

    // ========================================================
    // 6. ON-CHAIN CODE
    // ========================================================

    console.log("\n6. DEPLOYED CONTRACT CODE");
    console.log("----------------------------------------");

    const runtimeCode =
        await provider.getCode(
            predictedAddress
        );

    const runtimeBytes =
        (runtimeCode.length - 2) / 2;

    console.log(
        "Runtime bytecode:",
        runtimeBytes,
        "bytes"
    );

    if (runtimeCode === "0x") {
        throw new Error(
            "Expected deployed contract code is missing"
        );
    }

    console.log("Runtime code: PRESENT");
    console.log("DEPLOYMENT: VERIFIED");

    // ========================================================
    // 7. INDEPENDENT CREATE2 FORMULA
    // ========================================================

    console.log("\n7. INDEPENDENT CREATE2 FORMULA");
    console.log("----------------------------------------");

    const create2Preimage =
        hre.ethers.concat([
            "0xff",
            FACTORY_ADDRESS,
            EXISTING_SALT,
            initcodeHash
        ]);

    console.log(
        "CREATE2 preimage bytes:",
        (create2Preimage.length - 2) / 2
    );

    const fullHash =
        hre.ethers.keccak256(
            create2Preimage
        );

    const independentAddress =
        hre.ethers.getAddress(
            "0x" + fullHash.slice(-40)
        );

    console.log(
        "Independent address:",
        independentAddress
    );

    console.log(
        "Factory prediction:",
        predictedAddress
    );

    if (
        independentAddress.toLowerCase() !==
        predictedAddress.toLowerCase()
    ) {
        throw new Error(
            "Independent CREATE2 calculation mismatch"
        );
    }

    console.log("FORMULA: VERIFIED");

    // ========================================================
    // 8. COLLISION PROTECTION
    // ========================================================

    console.log("\n8. COLLISION PROTECTION");
    console.log("----------------------------------------");

    let collisionBlocked = false;

    try {

        await factory.deploy.staticCall(
            EXISTING_SALT,
            initcode
        );

        console.log(
            "WARNING: staticCall did not revert"
        );

    } catch (error) {

        const message =
            error.shortMessage ||
            error.reason ||
            error.message ||
            "";

        console.log(
            "Expected revert:",
            message
        );

        if (
            message.includes("already deployed") ||
            message.includes("execution reverted")
        ) {
            collisionBlocked = true;
        }
    }

    if (!collisionBlocked) {
        throw new Error(
            "Factory did not demonstrate collision protection"
        );
    }

    console.log(
        "Same salt + same initcode blocked: YES"
    );

    console.log(
        "No collision transaction broadcast: YES"
    );

    console.log("COLLISION PROTECTION: VERIFIED");

    // ========================================================
    // 9. CONTRACT INTERFACE
    // ========================================================

    console.log("\n9. DEPLOYED CONTRACT INTERFACE");
    console.log("----------------------------------------");

    const targetAbi = [
        "function marker() view returns (uint256)"
    ];

    const target =
        new hre.ethers.Contract(
            predictedAddress,
            targetAbi,
            provider
        );

    const marker =
        await target.marker();

    console.log(
        "marker():",
        marker.toString()
    );

    if (marker.toString() !== "3406") {
        throw new Error(
            "Unexpected marker value"
        );
    }

    console.log("TARGET INTERFACE: VERIFIED");

    // ========================================================
    // 10. FINAL READINESS CHECK
    // ========================================================

    console.log("\n10. PRODUCTION READINESS");
    console.log("----------------------------------------");

    const checks = {
        network: true,
        deployer: true,
        factory: true,
        initcode: true,
        deterministicPrediction: true,
        deployedCode: true,
        independentCreate2: true,
        collisionProtection: collisionBlocked,
        targetInterface: true
    };

    const allPassed =
        Object.values(checks)
            .every(Boolean);

    if (!allPassed) {
        throw new Error(
            "One or more production-readiness checks failed"
        );
    }

    console.log(
        "Network: PASS"
    );

    console.log(
        "Factory: PASS"
    );

    console.log(
        "CREATE2 prediction: PASS"
    );

    console.log(
        "On-chain deployment: PASS"
    );

    console.log(
        "Independent formula: PASS"
    );

    console.log(
        "Collision protection: PASS"
    );

    console.log(
        "Target interface: PASS"
    );

    console.log(
        "PRODUCTION READINESS: PASS"
    );

    // ========================================================
    // 11. SAVE RECORD
    // ========================================================

    console.log("\n11. SAVING VERIFICATION RECORD");
    console.log("----------------------------------------");

    const outputPath =
        path.join(
            process.cwd(),
            "deployments",
            "step34a10-production-readiness.json"
        );

    const record = {
        step: "34A-10",
        network: "Base Sepolia",
        chainId: EXPECTED_CHAIN_ID,

        deployer:
            wallet.address,

        factory:
            FACTORY_ADDRESS,

        salt:
            EXISTING_SALT,

        predictedAddress:
            predictedAddress,

        independentAddress:
            independentAddress,

        initcodeHash:
            initcodeHash,

        runtimeBytes:
            runtimeBytes,

        marker:
            marker.toString(),

        collisionProtectionVerified:
            collisionBlocked,

        productionDeploymentBroadcast:
            false,

        status:
            "SUCCESS"
    };

    fs.writeFileSync(
        outputPath,
        JSON.stringify(
            record,
            null,
            2
        )
    );

    console.log(
        "Verification record:",
        outputPath
    );

    // ========================================================
    // FINAL
    // ========================================================

    console.log("\n============================================================");
    console.log("STEP 34A-10 PASSED");
    console.log("============================================================");
    console.log("Network: BASE SEPOLIA");
    console.log("Factory: VERIFIED");
    console.log("Deterministic address: VERIFIED");
    console.log("Runtime code: VERIFIED");
    console.log("Independent CREATE2 formula: VERIFIED");
    console.log("Collision protection: VERIFIED");
    console.log("Target interface: VERIFIED");
    console.log("Production deployment: NOT SENT");
    console.log("Status: SUCCESS");
    console.log("============================================================");
}

main().catch((error) => {

    console.error("\n============================================================");
    console.error("STEP 34A-10 FAILED");
    console.error("============================================================");

    console.error(
        error.shortMessage ||
        error.reason ||
        error.message ||
        error
    );

    process.exitCode = 1;
});
