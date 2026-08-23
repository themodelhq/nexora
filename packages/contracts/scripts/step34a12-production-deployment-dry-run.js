
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const {
    ethers,
    network
} = hre;

const PROJECT_ROOT = process.cwd();

const FACTORY_ADDRESS =
    "0x4587d758aD25B48be29cbbf6DE9ceca36Cb06265";

const EXPECTED_CHAIN_ID = 84532;

const DEPLOYER_EXPECTED =
    "0x167d231F59f86D0317CBF031b807daceC2bE6857";

const AUDIT_RECORD =
    path.join(
        PROJECT_ROOT,
        "deployments",
        "step34a11-production-contract-audit.json"
    );

const OUTPUT_RECORD =
    path.join(
        PROJECT_ROOT,
        "deployments",
        "step34a12-production-deployment-dry-run.json"
    );

function section(title) {
    console.log("");
    console.log("=".repeat(68));
    console.log(title);
    console.log("=".repeat(68));
}

function subsection(title) {
    console.log("");
    console.log(title);
    console.log("-".repeat(48));
}

function fail(message) {
    console.error("");
    console.error("============================================================");
    console.error("STEP 34A-12 FAILED");
    console.error("============================================================");
    console.error(message);
    process.exit(1);
}

async function main() {

    section(
        "STEP 34A-12 — PRODUCTION DEPLOYMENT CONFIGURATION DRY RUN"
    );

    // --------------------------------------------------------
    // 1. Network
    // --------------------------------------------------------

    subsection("1. NETWORK VERIFICATION");

    const provider = ethers.provider;
    const networkInfo = await provider.getNetwork();

    const chainId = Number(networkInfo.chainId);

    console.log(`Chain ID: ${chainId}`);
    console.log(`Expected Chain ID: ${EXPECTED_CHAIN_ID}`);

    if (chainId !== EXPECTED_CHAIN_ID) {
        fail(
            `Wrong network. Expected ${EXPECTED_CHAIN_ID}, got ${chainId}`
        );
    }

    console.log("NETWORK: VERIFIED");

    // --------------------------------------------------------
    // 2. Signer
    // --------------------------------------------------------

    subsection("2. DEPLOYER VERIFICATION");

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();

    console.log(`Deployer: ${deployerAddress}`);
    console.log(`Expected: ${DEPLOYER_EXPECTED}`);

    if (
        deployerAddress.toLowerCase() !==
        DEPLOYER_EXPECTED.toLowerCase()
    ) {
        fail("Unexpected deployer address");
    }

    console.log("DEPLOYER: VERIFIED");
    console.log("Private key: NOT PRINTED");

    // --------------------------------------------------------
    // 3. Factory
    // --------------------------------------------------------

    subsection("3. FACTORY VERIFICATION");

    const factoryCode =
        await provider.getCode(FACTORY_ADDRESS);

    console.log(
        `Factory runtime bytes: ${(factoryCode.length - 2) / 2}`
    );

    if (factoryCode === "0x") {
        fail("Factory has no runtime code");
    }

    console.log(`Factory: ${FACTORY_ADDRESS}`);
    console.log("FACTORY: VERIFIED");

    // --------------------------------------------------------
    // 4. Audit record
    // --------------------------------------------------------

    subsection("4. STEP 34A-11 AUDIT RECORD");

    if (!fs.existsSync(AUDIT_RECORD)) {
        fail(`Missing audit record: ${AUDIT_RECORD}`);
    }

    const audit =
        JSON.parse(
            fs.readFileSync(AUDIT_RECORD, "utf8")
        );

    console.log(`Audit step: ${audit.step}`);
    console.log(`Audit status: ${audit.status}`);
    console.log(
        `Production deployment sent: ${audit.productionDeploymentSent}`
    );
    console.log(
        `Transactions sent: ${audit.transactionsSent}`
    );

    if (audit.productionDeploymentSent !== false) {
        fail("STEP 34A-11 indicates production deployment was sent");
    }

    if (audit.transactionsSent !== 0) {
        fail("STEP 34A-11 indicates transactions were sent");
    }

    console.log("AUDIT RECORD: VERIFIED");

    // --------------------------------------------------------
    // 5. NexoraToken artifact
    // --------------------------------------------------------

    subsection("5. PRODUCTION CONTRACT ARTIFACT");

    const artifact =
        await hre.artifacts.readArtifact("NexoraToken");

    console.log("Contract: NexoraToken");
    console.log(
        `Creation bytecode bytes: ${
            (artifact.bytecode.length - 2) / 2
        }`
    );
    console.log(
        `Runtime bytecode bytes: ${
            (artifact.deployedBytecode.length - 2) / 2
        }`
    );

    if (artifact.bytecode === "0x") {
        fail("NexoraToken creation bytecode is empty");
    }

    if (artifact.deployedBytecode === "0x") {
        fail("NexoraToken runtime bytecode is empty");
    }

    console.log("ARTIFACT: VERIFIED");

    // --------------------------------------------------------
    // 6. Constructor inspection
    // --------------------------------------------------------

    subsection("6. CONSTRUCTOR INSPECTION");

    const constructorInputs =
        artifact.abi.find(
            item => item.type === "constructor"
        )?.inputs || [];

    console.log(
        `Constructor parameters: ${constructorInputs.length}`
    );

    for (let i = 0; i < constructorInputs.length; i++) {
        const input = constructorInputs[i];

        console.log(
            `[${i}] ${input.name || "(unnamed)"} : ${input.type}`
        );
    }

    // --------------------------------------------------------
    // IMPORTANT:
    // Do not guess constructor arguments.
    //
    // The script intentionally stops before creating production
    // deployment calldata unless the project's deployment
    // configuration explicitly supplies the arguments.
    // --------------------------------------------------------

    const deploymentConfigCandidates = [
        path.join(
            PROJECT_ROOT,
            "deployments",
            "production-config.json"
        ),
        path.join(
            PROJECT_ROOT,
            "deployments",
            "production-deployment-config.json"
        ),
        path.join(
            PROJECT_ROOT,
            "registry.json"
        )
    ];

    let configPath = null;

    for (const candidate of deploymentConfigCandidates) {
        if (fs.existsSync(candidate)) {
            configPath = candidate;
            break;
        }
    }

    subsection("7. DEPLOYMENT CONFIGURATION");

    if (configPath) {
        console.log(`Configuration candidate: ${configPath}`);

        let config;

        try {
            config =
                JSON.parse(
                    fs.readFileSync(configPath, "utf8")
                );
        } catch (error) {
            fail(
                `Unable to parse deployment configuration: ${error.message}`
            );
        }

        console.log("Configuration JSON: VALID");

        const record = {
            step: "34A-12",
            network: "Base Sepolia",
            chainId,
            contract: "NexoraToken",
            factory: FACTORY_ADDRESS,
            deployer: deployerAddress,
            configurationFile: configPath,
            constructorParameterCount:
                constructorInputs.length,
            constructorParameters:
                constructorInputs.map(x => ({
                    name: x.name || null,
                    type: x.type
                })),
            productionDeploymentSent: false,
            transactionsSent: 0,
            broadcastEnabled: false,
            status: "DRY_RUN_CONFIGURATION_FOUND"
        };

        fs.writeFileSync(
            OUTPUT_RECORD,
            JSON.stringify(record, null, 2)
        );

        console.log(
            `Dry-run record: ${OUTPUT_RECORD}`
        );

    } else {

        console.log(
            "No dedicated production deployment configuration found."
        );

        const record = {
            step: "34A-12",
            network: "Base Sepolia",
            chainId,
            contract: "NexoraToken",
            factory: FACTORY_ADDRESS,
            deployer: deployerAddress,
            constructorParameterCount:
                constructorInputs.length,
            constructorParameters:
                constructorInputs.map(x => ({
                    name: x.name || null,
                    type: x.type
                })),
            productionDeploymentSent: false,
            transactionsSent: 0,
            broadcastEnabled: false,
            status: "CONFIGURATION_REQUIRES_EXPLICIT_ARGUMENTS"
        };

        fs.writeFileSync(
            OUTPUT_RECORD,
            JSON.stringify(record, null, 2)
        );

        console.log(
            `Dry-run record: ${OUTPUT_RECORD}`
        );

        console.log("");
        console.log(
            "No production deployment has been attempted."
        );
        console.log(
            "Constructor arguments must be explicitly supplied"
        );
        console.log(
            "before production calldata can be generated."
        );
    }

    // --------------------------------------------------------
    // 8. Final safety state
    // --------------------------------------------------------

    subsection("8. DEPLOYMENT SAFETY");

    console.log("Production deployment: NOT SENT");
    console.log("Transactions broadcast: 0");
    console.log("CREATE2 deployment: NOT EXECUTED");
    console.log("Production token deployment: NOT EXECUTED");
    console.log("BROADCAST: DISABLED");

    // --------------------------------------------------------
    // Final
    // --------------------------------------------------------

    section("STEP 34A-12 COMPLETE");

    console.log("Network: VERIFIED");
    console.log("Deployer: VERIFIED");
    console.log("Factory: VERIFIED");
    console.log("NexoraToken artifact: VERIFIED");
    console.log("Constructor ABI: INSPECTED");
    console.log("Production broadcast: DISABLED");
    console.log("Status: DRY RUN");
}

main().catch(error => {
    console.error("");
    console.error("--- STDERR ---");
    console.error("");
    console.error(
        "============================================================"
    );
    console.error("STEP 34A-12 FAILED");
    console.error(
        "============================================================"
    );
    console.error(error.shortMessage || error.message || error);
    process.exit(1);
});
