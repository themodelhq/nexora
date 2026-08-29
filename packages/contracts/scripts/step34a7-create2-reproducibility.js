
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("============================================================");
    console.log("STEP 34A-7 — CREATE2 REPRODUCIBILITY & COLLISION TEST");
    console.log("============================================================");

    const provider = hre.ethers.provider;

    const FACTORY_ADDRESS =
        "0x4587d758aD25B48be29cbbf6DE9ceca36Cb06265";

    const EXPECTED_DEPLOYER =
        "0x167d231F59f86D0317CBF031b807daceC2bE6857";

    const EXPECTED_CHAIN_ID = 84532;

    const EXISTING_TEST_ADDRESS =
        "0xB9EBEf96123112241d11d4736315801051e81024";

    const EXISTING_SALT =
        "0xbbc3ea4301461202dc17c36a2971f675a5494e1660e908a5e1bee51d671771e1";

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

    const factoryCodeLength =
        (factoryCode.length - 2) / 2;

    console.log(
        "Factory runtime bytecode:",
        factoryCodeLength,
        "bytes"
    );

    if (factoryCode === "0x") {
        throw new Error("Factory has no code");
    }

    console.log("Factory: LIVE");
    console.log("FACTORY: VERIFIED");

    const factoryAbi = [
        "function predictAddress(bytes32 salt, bytes initcode) view returns (address)",
        "function deploy(bytes32 salt, bytes initcode) returns (address deployed)"
    ];

    const factory = new hre.ethers.Contract(
        FACTORY_ADDRESS,
        factoryAbi,
        wallet
    );

    // ========================================================
    // 4. LOAD TEST BYTECODE
    // ========================================================
    console.log("\n4. TEST BYTECODE");
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
        throw new Error("Test artifact not found");
    }

    const artifact = JSON.parse(
        fs.readFileSync(artifactPath, "utf8")
    );

    const initcode = artifact.bytecode;

    if (!initcode || initcode === "0x") {
        throw new Error("Missing creation bytecode");
    }

    console.log(
        "Creation bytecode:",
        (initcode.length - 2) / 2,
        "bytes"
    );

    console.log("INITCODE: VERIFIED");

    // ========================================================
    // 5. VERIFY EXISTING DEPLOYMENT
    // ========================================================
    console.log("\n5. EXISTING CREATE2 DEPLOYMENT");
    console.log("----------------------------------------");

    const existingCode =
        await provider.getCode(EXISTING_TEST_ADDRESS);

    const existingCodeLength =
        (existingCode.length - 2) / 2;

    console.log(
        "Existing test address:",
        EXISTING_TEST_ADDRESS
    );

    console.log(
        "Existing runtime code:",
        existingCodeLength,
        "bytes"
    );

    if (existingCode === "0x") {
        throw new Error(
            "Previously deployed test contract is missing"
        );
    }

    console.log("Existing deployment: PRESENT");
    console.log("EXISTING DEPLOYMENT: VERIFIED");

    // ========================================================
    // 6. REPRODUCE ORIGINAL PREDICTION
    // ========================================================
    console.log("\n6. ORIGINAL ADDRESS REPRODUCTION");
    console.log("----------------------------------------");

    const reproducedAddress =
        await factory.predictAddress(
            EXISTING_SALT,
            initcode
        );

    console.log(
        "Original deployed address:",
        EXISTING_TEST_ADDRESS
    );

    console.log(
        "Recomputed address:",
        reproducedAddress
    );

    if (
        reproducedAddress.toLowerCase() !==
        EXISTING_TEST_ADDRESS.toLowerCase()
    ) {
        throw new Error(
            "CREATE2 address reproduction failed"
        );
    }

    console.log("Address match: YES");
    console.log("REPRODUCIBILITY: VERIFIED");

    // ========================================================
    // 7. INDEPENDENT CREATE2 CALCULATION
    // ========================================================
    console.log("\n7. INDEPENDENT CREATE2 FORMULA");
    console.log("----------------------------------------");

    const initCodeHash =
        hre.ethers.keccak256(initcode);

    const factoryBytes =
        FACTORY_ADDRESS.slice(2).toLowerCase();

    const saltBytes =
        EXISTING_SALT.slice(2);

    const hashBytes =
        initCodeHash.slice(2);

    const raw =
        "0xff" +
        factoryBytes +
        saltBytes +
        hashBytes;

    const fullHash =
        hre.ethers.keccak256(raw);

    const independentAddress =
        hre.ethers.getAddress(
            "0x" + fullHash.slice(-40)
        );

    console.log(
        "Initcode hash:",
        initCodeHash
    );

    console.log(
        "Independent CREATE2 address:",
        independentAddress
    );

    console.log(
        "Factory predictAddress:",
        reproducedAddress
    );

    if (
        independentAddress.toLowerCase() !==
        reproducedAddress.toLowerCase()
    ) {
        throw new Error(
            "Independent CREATE2 calculation mismatch"
        );
    }

    console.log("Formula match: YES");
    console.log("CREATE2 FORMULA: VERIFIED");

    // ========================================================
    // 8. DIFFERENT SALT TEST
    // ========================================================
    console.log("\n8. DIFFERENT SALT TEST");
    console.log("----------------------------------------");

    const differentSalt =
        hre.ethers.keccak256(
            hre.ethers.toUtf8Bytes(
                "NEXORA-STEP-34A-7-DIFFERENT-SALT"
            )
        );

    const differentSaltAddress =
        await factory.predictAddress(
            differentSalt,
            initcode
        );

    console.log(
        "Original salt:",
        EXISTING_SALT
    );

    console.log(
        "Different salt:",
        differentSalt
    );

    console.log(
        "Original address:",
        reproducedAddress
    );

    console.log(
        "Different salt address:",
        differentSaltAddress
    );

    if (
        differentSaltAddress.toLowerCase() ===
        reproducedAddress.toLowerCase()
    ) {
        throw new Error(
            "Different salt produced same address"
        );
    }

    console.log("Addresses differ: YES");
    console.log("SALT UNIQUENESS: VERIFIED");

    // ========================================================
    // 9. DIFFERENT INITCODE TEST
    // ========================================================
    console.log("\n9. DIFFERENT INITCODE TEST");
    console.log("----------------------------------------");

    const modifiedInitcode =
        initcode + "00";

    const differentInitcodeAddress =
        await factory.predictAddress(
            EXISTING_SALT,
            modifiedInitcode
        );

    console.log(
        "Original address:",
        reproducedAddress
    );

    console.log(
        "Modified initcode address:",
        differentInitcodeAddress
    );

    if (
        differentInitcodeAddress.toLowerCase() ===
        reproducedAddress.toLowerCase()
    ) {
        throw new Error(
            "Different initcode produced same address"
        );
    }

    console.log("Addresses differ: YES");
    console.log("INITCODE UNIQUENESS: VERIFIED");

    // ========================================================
    // 10. COLLISION CHECK
    // ========================================================
    console.log("\n10. CREATE2 COLLISION SAFETY");
    console.log("----------------------------------------");

    const occupiedCode =
        await provider.getCode(
            reproducedAddress
        );

    console.log(
        "Existing address:",
        reproducedAddress
    );

    console.log(
        "Code at existing address:",
        (occupiedCode.length - 2) / 2,
        "bytes"
    );

    if (occupiedCode === "0x") {
        throw new Error(
            "Expected CREATE2 address to be occupied"
        );
    }

    console.log("Address is occupied: YES");
    console.log("COLLISION CONDITION: VERIFIED");

    // ========================================================
    // 11. PREDICTION WITHOUT BROADCAST
    // ========================================================
    console.log("\n11. COLLISION RE-DEPLOYMENT PREFLIGHT");
    console.log("----------------------------------------");

    console.log(
        "Same salt + same initcode:",
        "WOULD TARGET EXISTING ADDRESS"
    );

    console.log(
        "Target:",
        reproducedAddress
    );

    console.log(
        "Broadcast for collision test:",
        "DISABLED"
    );

    console.log(
        "Transactions sent in this section: 0"
    );

    console.log("COLLISION REDEPLOYMENT PREFLIGHT: PASS");

    // ========================================================
    // 12. SAVE RECORD
    // ========================================================
    console.log("\n12. SAVING VERIFICATION RECORD");
    console.log("----------------------------------------");

    const record = {
        step: "34A-7",
        network: "Base Sepolia",
        chainId: EXPECTED_CHAIN_ID,
        factory: FACTORY_ADDRESS,
        deployer: wallet.address,

        existingSalt: EXISTING_SALT,

        existingDeployment:
            EXISTING_TEST_ADDRESS,

        reproducedAddress:
            reproducedAddress,

        independentAddress:
            independentAddress,

        differentSalt:
            differentSalt,

        differentSaltAddress:
            differentSaltAddress,

        differentInitcodeAddress:
            differentInitcodeAddress,

        initcodeHash:
            initCodeHash,

        reproducibilityVerified: true,
        independentFormulaVerified: true,
        saltUniquenessVerified: true,
        initcodeUniquenessVerified: true,
        collisionConditionVerified: true,

        collisionRedeploymentBroadcast: false,

        status: "SUCCESS"
    };

    const outputPath = path.join(
        process.cwd(),
        "deployments",
        "step34a7-create2-reproducibility.json"
    );

    fs.writeFileSync(
        outputPath,
        JSON.stringify(record, null, 2)
    );

    console.log(
        "Verification record:",
        outputPath
    );

    // ========================================================
    // FINAL
    // ========================================================
    console.log("\n============================================================");
    console.log("STEP 34A-7 PASSED");
    console.log("============================================================");

    console.log("Network: BASE SEPOLIA");
    console.log("Chain ID:", EXPECTED_CHAIN_ID);
    console.log("Factory: VERIFIED");
    console.log("Original deployment: VERIFIED");
    console.log("Address reproduction: VERIFIED");
    console.log("Independent CREATE2 formula: VERIFIED");
    console.log("Different salt: VERIFIED");
    console.log("Different initcode: VERIFIED");
    console.log("Collision condition: VERIFIED");
    console.log("Collision redeployment: NOT SENT");
    console.log("Production token deployment: NOT SENT");

    console.log("============================================================");
}

main().catch((error) => {
    console.error("\n============================================================");
    console.error("STEP 34A-7 FAILED");
    console.error("============================================================");
    console.error(error.message || error);
    process.exitCode = 1;
});
