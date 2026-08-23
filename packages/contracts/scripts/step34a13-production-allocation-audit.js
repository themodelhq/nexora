
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { ethers } = hre;

const PROJECT_ROOT = process.cwd();

const EXPECTED_CHAIN_ID = 84532;

const FACTORY_ADDRESS =
    "0x4587d758aD25B48be29cbbf6DE9ceca36Cb06265";

const DEPLOYER_EXPECTED =
    "0x167d231F59f86D0317CBF031b807daceC2bE6857";

const REGISTRY =
    path.join(PROJECT_ROOT, "registry.json");

const DRY_RUN_RECORD =
    path.join(
        PROJECT_ROOT,
        "deployments",
        "step34a12-production-deployment-dry-run.json"
    );

const OUTPUT_RECORD =
    path.join(
        PROJECT_ROOT,
        "deployments",
        "step34a13-production-allocation-audit.json"
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
    console.error("STEP 34A-13 FAILED");
    console.error("============================================================");
    console.error(message);
    process.exit(1);
}

function normalize(value) {
    if (typeof value === "bigint") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.map(normalize);
    }

    if (value && typeof value === "object") {
        const out = {};

        for (const [key, val] of Object.entries(value)) {
            if (!/^\d+$/.test(key)) {
                out[key] = normalize(val);
            }
        }

        return out;
    }

    return value;
}

function findCandidates(object, names = []) {
    const found = [];

    function walk(value, pathName) {

        if (
            value === null ||
            value === undefined
        ) {
            return;
        }

        if (typeof value !== "object") {
            return;
        }

        for (const [key, child] of Object.entries(value)) {

            const childPath =
                pathName
                    ? `${pathName}.${key}`
                    : key;

            const lower =
                key.toLowerCase();

            if (
                names.some(
                    name => lower.includes(name)
                )
            ) {
                found.push({
                    path: childPath,
                    value: child
                });
            }

            walk(child, childPath);
        }
    }

    walk(object, "");

    return found;
}

async function main() {

    section(
        "STEP 34A-13 — PRODUCTION ALLOCATION & CONSTRUCTOR AUDIT"
    );

    // --------------------------------------------------------
    // 1. Network
    // --------------------------------------------------------

    subsection("1. NETWORK VERIFICATION");

    const network =
        await ethers.provider.getNetwork();

    const chainId =
        Number(network.chainId);

    console.log(`Chain ID: ${chainId}`);
    console.log(
        `Expected Chain ID: ${EXPECTED_CHAIN_ID}`
    );

    if (chainId !== EXPECTED_CHAIN_ID) {
        fail("Wrong network");
    }

    console.log("NETWORK: VERIFIED");

    // --------------------------------------------------------
    // 2. Deployer
    // --------------------------------------------------------

    subsection("2. DEPLOYER VERIFICATION");

    const [deployer] =
        await ethers.getSigners();

    const deployerAddress =
        await deployer.getAddress();

    console.log(
        `Deployer: ${deployerAddress}`
    );

    console.log(
        `Expected: ${DEPLOYER_EXPECTED}`
    );

    if (
        deployerAddress.toLowerCase() !==
        DEPLOYER_EXPECTED.toLowerCase()
    ) {
        fail("Unexpected deployer");
    }

    console.log("DEPLOYER: VERIFIED");

    // --------------------------------------------------------
    // 3. Registry
    // --------------------------------------------------------

    subsection("3. REGISTRY INSPECTION");

    if (!fs.existsSync(REGISTRY)) {
        fail("registry.json does not exist");
    }

    let registry;

    try {
        registry =
            JSON.parse(
                fs.readFileSync(
                    REGISTRY,
                    "utf8"
                )
            );
    } catch (error) {
        fail(
            `Invalid registry.json: ${error.message}`
        );
    }

    console.log(
        "registry.json: VALID JSON"
    );

    console.log(
        `Top-level keys: ${Object.keys(registry).join(", ")}`
    );

    // --------------------------------------------------------
    // 4. Token artifact
    // --------------------------------------------------------

    subsection("4. NEXORA TOKEN ARTIFACT");

    const artifact =
        await hre.artifacts.readArtifact(
            "NexoraToken"
        );

    if (artifact.bytecode === "0x") {
        fail("NexoraToken creation bytecode missing");
    }

    if (artifact.deployedBytecode === "0x") {
        fail("NexoraToken runtime bytecode missing");
    }

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

    console.log("ARTIFACT: VERIFIED");

    // --------------------------------------------------------
    // 5. Constructor ABI
    // --------------------------------------------------------

    subsection("5. CONSTRUCTOR ABI");

    const constructor =
        artifact.abi.find(
            item =>
                item.type === "constructor"
        );

    if (!constructor) {
        fail("NexoraToken constructor not found");
    }

    console.log(
        `Constructor parameters: ${
            constructor.inputs.length
        }`
    );

    if (constructor.inputs.length !== 1) {
        fail(
            "Expected exactly one constructor parameter"
        );
    }

    const allocationsInput =
        constructor.inputs[0];

    console.log(
        `Name: ${
            allocationsInput.name
        }`
    );

    console.log(
        `Type: ${
            allocationsInput.type
        }`
    );

    console.log(
        "Internal type:",
        allocationsInput.internalType
    );

    if (
        allocationsInput.name !==
        "allocations"
    ) {
        fail(
            "Constructor parameter is not named allocations"
        );
    }

    // --------------------------------------------------------
    // 6. Tuple structure
    // --------------------------------------------------------

    subsection("6. ALLOCATIONS TUPLE STRUCTURE");

    const components =
        allocationsInput.components || [];

    console.log(
        `Tuple components: ${components.length}`
    );

    if (components.length === 0) {
        fail(
            "Allocations tuple has no components"
        );
    }

    components.forEach(
        (component, index) => {
            console.log(
                `[${index}] ${
                    component.name
                } : ${
                    component.type
                }`
            );

            if (component.internalType) {
                console.log(
                    `    internalType: ${
                        component.internalType
                    }`
                );
            }
        }
    );

    // --------------------------------------------------------
    // 7. Registry allocation candidates
    // --------------------------------------------------------

    subsection(
        "7. REGISTRY ALLOCATION CANDIDATES"
    );

    const candidates =
        findCandidates(
            registry,
            [
                "allocation",
                "allocations",
                "token",
                "supply",
                "treasury",
                "vesting",
                "staking",
                "presale",
                "airdrop",
                "team",
                "liquidity",
                "ecosystem",
                "marketing"
            ]
        );

    console.log(
        `Candidate registry entries: ${
            candidates.length
        }`
    );

    for (
        const candidate of candidates
    ) {
        console.log("");
        console.log(
            candidate.path
        );

        try {
            console.log(
                JSON.stringify(
                    candidate.value,
                    null,
                    2
                )
            );
        } catch {
            console.log(
                String(candidate.value)
            );
        }
    }

    // --------------------------------------------------------
    // 8. Locate likely allocation object
    // --------------------------------------------------------

    subsection(
        "8. ALLOCATION CONFIGURATION RESOLUTION"
    );

    let allocationConfig = null;
    let allocationPath = null;

    const directCandidates = [
        "allocations",
        "allocation",
        "tokenAllocations",
        "tokenAllocation",
        "nexoraAllocations"
    ];

    for (
        const key of directCandidates
    ) {

        if (
            registry[key] !== undefined
        ) {
            allocationConfig =
                registry[key];

            allocationPath = key;
            break;
        }
    }

    if (!allocationConfig) {

        const token =
            registry.token ||
            registry.NexoraToken ||
            registry.nexoraToken;

        if (token) {

            for (
                const key of directCandidates
            ) {

                if (
                    token[key] !== undefined
                ) {
                    allocationConfig =
                        token[key];

                    allocationPath =
                        `token.${key}`;

                    break;
                }
            }
        }
    }

    if (!allocationConfig) {

        console.log(
            "Direct allocation configuration was not resolved."
        );

        console.log(
            "No constructor arguments will be guessed."
        );

        const record = {
            step: "34A-13",
            network: "Base Sepolia",
            chainId,
            deployer: deployerAddress,
            factory: FACTORY_ADDRESS,
            contract: "NexoraToken",
            constructorParameter: "allocations",
            constructorComponents: components.map(
                component => ({
                    name: component.name,
                    type: component.type,
                    internalType:
                        component.internalType ||
                        null
                })
            ),
            allocationConfigurationResolved:
                false,
            constructorEncodingGenerated:
                false,
            initcodeGenerated:
                false,
            productionDeploymentSent:
                false,
            transactionsSent:
                0,
            broadcastEnabled:
                false,
            status:
                "ALLOCATION_CONFIGURATION_REQUIRES_REVIEW"
        };

        fs.writeFileSync(
            OUTPUT_RECORD,
            JSON.stringify(
                record,
                null,
                2
            )
        );

        console.log(
            `Audit record: ${OUTPUT_RECORD}`
        );

        section(
            "STEP 34A-13 COMPLETE — REVIEW REQUIRED"
        );

        return;
    }

    console.log(
        `Resolved allocation path: ${
            allocationPath
        }`
    );

    console.log(
        JSON.stringify(
            allocationConfig,
            null,
            2
        )
    );

    // --------------------------------------------------------
    // 9. Do NOT guess tuple mapping
    // --------------------------------------------------------

    subsection(
        "9. CONSTRUCTOR MAPPING SAFETY"
    );

    if (
        !Array.isArray(
            allocationConfig
        )
    ) {
        console.log(
            "Allocation configuration is not an array."
        );

        console.log(
            "No tuple conversion will be guessed."
        );

        const record = {
            step: "34A-13",
            network: "Base Sepolia",
            chainId,
            deployer: deployerAddress,
            factory: FACTORY_ADDRESS,
            contract: "NexoraToken",
            allocationPath,
            allocationConfiguration:
                normalize(
                    allocationConfig
                ),
            allocationConfigurationResolved:
                true,
            tupleArrayDetected:
                false,
            constructorEncodingGenerated:
                false,
            initcodeGenerated:
                false,
            productionDeploymentSent:
                false,
            transactionsSent:
                0,
            broadcastEnabled:
                false,
            status:
                "ALLOCATION_STRUCTURE_REQUIRES_REVIEW"
        };

        fs.writeFileSync(
            OUTPUT_RECORD,
            JSON.stringify(
                record,
                null,
                2
            )
        );

        console.log(
            `Audit record: ${OUTPUT_RECORD}`
        );

        section(
            "STEP 34A-13 COMPLETE — REVIEW REQUIRED"
        );

        return;
    }

    console.log(
        `Allocation entries: ${
            allocationConfig.length
        }`
    );

    // --------------------------------------------------------
    // 10. Address / amount inspection
    // --------------------------------------------------------

    subsection(
        "10. ALLOCATION ENTRY INSPECTION"
    );

    const inspected =
        allocationConfig.map(
            (entry, index) => {

                console.log("");
                console.log(
                    `Allocation [${index}]`
                );

                console.log(
                    JSON.stringify(
                        entry,
                        null,
                        2
                    )
                );

                return normalize(entry);
            }
        );

    // --------------------------------------------------------
    // 11. Encode ONLY if exact tuple shape matches
    // --------------------------------------------------------

    subsection(
        "11. CONSTRUCTOR ENCODING"
    );

    const expectedTupleCount =
        components.length;

    const canEncode =
        allocationConfig.every(
            entry =>
                Array.isArray(entry) &&
                entry.length ===
                    expectedTupleCount
        );

    if (!canEncode) {

        console.log(
            "Allocation entries do not exactly match constructor tuple shape."
        );

        console.log(
            "NO constructor encoding performed."
        );

        const record = {
            step: "34A-13",
            network: "Base Sepolia",
            chainId,
            deployer: deployerAddress,
            factory: FACTORY_ADDRESS,
            contract: "NexoraToken",
            allocationPath,
            constructorComponents:
                components.map(
                    component => ({
                        name: component.name,
                        type: component.type,
                        internalType:
                            component.internalType ||
                            null
                    })
                ),
            allocationEntries:
                inspected,
            constructorEncodingGenerated:
                false,
            initcodeGenerated:
                false,
            productionDeploymentSent:
                false,
            transactionsSent:
                0,
            broadcastEnabled:
                false,
            status:
                "TUPLE_SHAPE_REQUIRES_REVIEW"
        };

        fs.writeFileSync(
            OUTPUT_RECORD,
            JSON.stringify(
                record,
                null,
                2
            )
        );

        console.log(
            `Audit record: ${OUTPUT_RECORD}`
        );

        section(
            "STEP 34A-13 COMPLETE — REVIEW REQUIRED"
        );

        return;
    }

    let encodedConstructor;

    try {

        const coder =
            ethers.AbiCoder.defaultAbiCoder();

        encodedConstructor =
            coder.encode(
                [
                    allocationsInput.type
                ],
                [
                    allocationConfig
                ]
            );

    } catch (error) {

        fail(
            `Constructor ABI encoding failed: ${
                error.message
            }`
        );
    }

    console.log(
        `Constructor calldata bytes: ${
            (encodedConstructor.length - 2) / 2
        }`
    );

    console.log(
        `Constructor calldata hash: ${
            ethers.keccak256(
                encodedConstructor
            )
        }`
    );

    console.log(
        "CONSTRUCTOR ENCODING: VERIFIED"
    );

    // --------------------------------------------------------
    // 12. Final initcode
    // --------------------------------------------------------

    subsection(
        "12. FINAL PRODUCTION INITCODE"
    );

    const initcode =
        ethers.concat([
            artifact.bytecode,
            encodedConstructor
        ]);

    const initcodeHash =
        ethers.keccak256(
            initcode
        );

    console.log(
        `Initcode bytes: ${
            (initcode.length - 2) / 2
        }`
    );

    console.log(
        `Initcode hash: ${
            initcodeHash
        }`
    );

    console.log(
        "INITCODE: VERIFIED"
    );

    // --------------------------------------------------------
    // 13. CREATE2 salt
    // --------------------------------------------------------

    subsection(
        "13. CREATE2 SALT"
    );

    /*
     * IMPORTANT:
     * No arbitrary production salt is invented here.
     *
     * Look for explicit production salt configuration.
     */

    const saltCandidates = [
        registry.productionSalt,
        registry.create2Salt,
        registry.nexoraTokenSalt,
        registry.tokenSalt
    ];

    const validSalts =
        saltCandidates.filter(
            value =>
                typeof value === "string" &&
                /^0x[0-9a-fA-F]{64}$/.test(
                    value
                )
        );

    if (validSalts.length === 0) {

        console.log(
            "No explicit production CREATE2 salt found."
        );

        console.log(
            "NO production address will be invented."
        );

        const record = {
            step: "34A-13",
            network: "Base Sepolia",
            chainId,
            deployer: deployerAddress,
            factory: FACTORY_ADDRESS,
            contract: "NexoraToken",
            allocationPath,
            allocationEntries:
                inspected,
            constructorCalldata:
                encodedConstructor,
            constructorCalldataHash:
                ethers.keccak256(
                    encodedConstructor
                ),
            initcodeBytes:
                (initcode.length - 2) / 2,
            initcodeHash,
            create2Salt:
                null,
            predictedAddress:
                null,
            productionDeploymentSent:
                false,
            transactionsSent:
                0,
            broadcastEnabled:
                false,
            status:
                "PRODUCTION_SALT_REQUIRES_EXPLICIT_CONFIGURATION"
        };

        fs.writeFileSync(
            OUTPUT_RECORD,
            JSON.stringify(
                record,
                null,
                2
            )
        );

        console.log(
            `Audit record: ${OUTPUT_RECORD}`
        );

        section(
            "STEP 34A-13 COMPLETE — SALT REQUIRED"
        );

        return;
    }

    const salt =
        validSalts[0];

    console.log(
        `Production salt: ${salt}`
    );

    // --------------------------------------------------------
    // 14. Factory prediction
    // --------------------------------------------------------

    subsection(
        "14. CREATE2 ADDRESS PREDICTION"
    );

    const factoryAbi = [
        "function predictAddress(bytes32 salt, bytes memory initcode) view returns (address)"
    ];

    const factory =
        new ethers.Contract(
            FACTORY_ADDRESS,
            factoryAbi,
            provider
        );

    const predicted =
        await factory.predictAddress(
            salt,
            initcode
        );

    console.log(
        `Predicted production address: ${
            predicted
        }`
    );

    // --------------------------------------------------------
    // 15. Independent formula
    // --------------------------------------------------------

    subsection(
        "15. INDEPENDENT CREATE2 FORMULA"
    );

    const preimage =
        ethers.concat([
            "0xff",
            FACTORY_ADDRESS,
            salt,
            initcodeHash
        ]);

    const independent =
        ethers.getAddress(
            "0x" +
            ethers.keccak256(
                preimage
            ).slice(-40)
        );

    console.log(
        `Independent address: ${
            independent
        }`
    );

    console.log(
        `Factory prediction: ${
            predicted
        }`
    );

    if (
        independent.toLowerCase() !==
        predicted.toLowerCase()
    ) {
        fail(
            "Independent CREATE2 formula mismatch"
        );
    }

    console.log(
        "CREATE2 FORMULA: VERIFIED"
    );

    // --------------------------------------------------------
    // 16. Collision check
    // --------------------------------------------------------

    subsection(
        "16. PRODUCTION ADDRESS COLLISION CHECK"
    );

    const existingCode =
        await provider.getCode(
            predicted
        );

    const occupied =
        existingCode !== "0x";

    console.log(
        `Address: ${predicted}`
    );

    console.log(
        `Runtime code bytes: ${
            (existingCode.length - 2) / 2
        }`
    );

    console.log(
        `Address occupied: ${
            occupied
        }`
    );

    if (occupied) {
        fail(
            "Production CREATE2 target is already occupied"
        );
    }

    console.log(
        "COLLISION CHECK: PASS"
    );

    // --------------------------------------------------------
    // 17. Final record
    // --------------------------------------------------------

    const record = {
        step: "34A-13",
        network: "Base Sepolia",
        chainId,
        deployer: deployerAddress,
        factory: FACTORY_ADDRESS,
        contract: "NexoraToken",

        allocationPath,

        constructorComponents:
            components.map(
                component => ({
                    name: component.name,
                    type: component.type,
                    internalType:
                        component.internalType ||
                        null
                })
            ),

        allocationEntries:
            inspected,

        constructorCalldata:
            encodedConstructor,

        constructorCalldataHash:
            ethers.keccak256(
                encodedConstructor
            ),

        initcodeBytes:
            (initcode.length - 2) / 2,

        initcodeHash,

        create2Salt:
            salt,

        predictedAddress:
            predicted,

        independentCreate2Address:
            independent,

        addressOccupied:
            false,

        productionDeploymentSent:
            false,

        transactionsSent:
            0,

        broadcastEnabled:
            false,

        status:
            "ALLOCATION_AUDIT_COMPLETE"
    };

    fs.writeFileSync(
        OUTPUT_RECORD,
        JSON.stringify(
            record,
            null,
            2
        )
    );

    subsection(
        "17. DEPLOYMENT SAFETY"
    );

    console.log(
        "Production deployment: NOT SENT"
    );

    console.log(
        "Transactions broadcast: 0"
    );

    console.log(
        "BROADCAST: DISABLED"
    );

    console.log(
        `Audit record: ${OUTPUT_RECORD}`
    );

    section(
        "STEP 34A-13 PASSED"
    );

    console.log(
        "Allocation configuration: VERIFIED"
    );

    console.log(
        "Constructor encoding: VERIFIED"
    );

    console.log(
        "Production initcode: VERIFIED"
    );

    console.log(
        "CREATE2 prediction: VERIFIED"
    );

    console.log(
        "Collision check: PASS"
    );

    console.log(
        "Production deployment: NOT SENT"
    );

    console.log(
        "Status: SUCCESS"
    );
}

main().catch(error => {

    console.error("");
    console.error("--- STDERR ---");
    console.error("");

    console.error(
        "============================================================"
    );

    console.error(
        "STEP 34A-13 FAILED"
    );

    console.error(
        "============================================================"
    );

    console.error(
        error.shortMessage ||
        error.message ||
        error
    );

    process.exit(1);
});
