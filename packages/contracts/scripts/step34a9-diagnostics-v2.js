
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {

    const provider = hre.ethers.provider;

    const FACTORY_ADDRESS =
        "0x4587d758aD25B48be29cbbf6DE9ceca36Cb06265";

    const TX_HASH =
        "0x1acff787165c4f9f398f84089d8ecb661324336afc68ff717ed4ddd6bed66e79";

    const SALT =
        "0x46b8ffceffba15eaccc6d3137d007985fea5e9923e16334350a27794c04e6a97";

    const EXPECTED_ADDRESS =
        "0xa6f7bff2803cB4a7774c69Ed74FF72DEcfe612CD";

    const artifactPath = path.join(
        process.cwd(),
        "artifacts",
        "src",
        "test",
        "NexoraDeterministicTestTarget.sol",
        "NexoraDeterministicTestTarget.json"
    );

    console.log("\n1. TRANSACTION INSPECTION");
    console.log("----------------------------------------");

    const tx =
        await provider.getTransaction(TX_HASH);

    if (!tx) {
        throw new Error("Transaction not found");
    }

    console.log("Transaction:", TX_HASH);
    console.log("From:", tx.from);
    console.log("To:", tx.to);
    console.log("Block:", tx.blockNumber);
    console.log("Nonce:", tx.nonce);
    console.log("Gas limit:", tx.gasLimit.toString());
    console.log("Value:", tx.value.toString());
    console.log(
        "Calldata bytes:",
        (tx.data.length - 2) / 2
    );

    console.log("\n2. RECEIPT INSPECTION");
    console.log("----------------------------------------");

    const receipt =
        await provider.getTransactionReceipt(TX_HASH);

    if (!receipt) {
        throw new Error("Receipt not found");
    }

    console.log("Status:", receipt.status);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Logs:", receipt.logs.length);
    console.log(
        "Contract address:",
        receipt.contractAddress
    );

    console.log("\n3. FACTORY CODE");
    console.log("----------------------------------------");

    const factoryCode =
        await provider.getCode(
            FACTORY_ADDRESS
        );

    console.log(
        "Factory:",
        FACTORY_ADDRESS
    );

    console.log(
        "Factory runtime bytes:",
        (factoryCode.length - 2) / 2
    );

    if (factoryCode === "0x") {
        throw new Error(
            "Factory has no runtime code"
        );
    }

    console.log("FACTORY: LIVE");

    console.log("\n4. TEST INITCODE");
    console.log("----------------------------------------");

    if (!fs.existsSync(artifactPath)) {
        throw new Error(
            "Test artifact not found"
        );
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

    console.log(
        "Initcode bytes:",
        (initcode.length - 2) / 2
    );

    const initCodeHash =
        hre.ethers.keccak256(
            initcode
        );

    console.log(
        "Initcode hash:",
        initCodeHash
    );

    console.log("\n5. FACTORY PREDICTION");
    console.log("----------------------------------------");

    const factoryAbi = [
        "function predictAddress(bytes32 salt, bytes initcode) view returns (address)",
        "function deploy(bytes32 salt, bytes initcode) returns (address deployed)"
    ];

    const factory =
        new hre.ethers.Contract(
            FACTORY_ADDRESS,
            factoryAbi,
            provider
        );

    const factoryPrediction =
        await factory.predictAddress(
            SALT,
            initcode
        );

    console.log(
        "Factory prediction:",
        factoryPrediction
    );

    console.log(
        "Expected address:",
        EXPECTED_ADDRESS
    );

    console.log(
        "Factory prediction match:",
        factoryPrediction.toLowerCase() ===
        EXPECTED_ADDRESS.toLowerCase()
            ? "YES"
            : "NO"
    );

    console.log("\n6. INDEPENDENT CREATE2 CALCULATION");
    console.log("----------------------------------------");

    /*
     * IMPORTANT:
     * Use ethers' native CREATE2 helper.
     * Do NOT manually concatenate 0xff + address + salt + hash.
     */

    const independentAddress =
        hre.ethers.getCreate2Address(
            FACTORY_ADDRESS,
            SALT,
            initCodeHash
        );

    console.log(
        "Independent CREATE2:",
        independentAddress
    );

    console.log(
        "Factory prediction:",
        factoryPrediction
    );

    console.log(
        "Independent formula match:",
        independentAddress.toLowerCase() ===
        factoryPrediction.toLowerCase()
            ? "YES"
            : "NO"
    );

    console.log("\n7. CODE AT PREDICTED ADDRESS");
    console.log("----------------------------------------");

    const predictedCode =
        await provider.getCode(
            factoryPrediction
        );

    console.log(
        "Predicted address:",
        factoryPrediction
    );

    console.log(
        "Runtime code bytes:",
        (predictedCode.length - 2) / 2
    );

    console.log(
        "Runtime code:",
        predictedCode
    );

    if (predictedCode === "0x") {
        console.log(
            "RESULT: NO CODE AT PREDICTED ADDRESS"
        );
    } else {
        console.log(
            "RESULT: CODE PRESENT"
        );
    }

    console.log("\n8. TRANSACTION LOG ANALYSIS");
    console.log("----------------------------------------");

    console.log(
        "Number of logs:",
        receipt.logs.length
    );

    for (
        let i = 0;
        i < receipt.logs.length;
        i++
    ) {

        const log =
            receipt.logs[i];

        console.log(
            `\nLOG ${i}`
        );

        console.log(
            "Address:",
            log.address
        );

        console.log(
            "Topics:",
            log.topics
        );

        console.log(
            "Data:",
            log.data
        );

        console.log(
            "Data bytes:",
            (log.data.length - 2) / 2
        );
    }

    console.log("\n9. DEPLOY CALL STATIC TEST");
    console.log("----------------------------------------");

    try {

        const staticResult =
            await factory.deploy.staticCall(
                SALT,
                initcode
            );

        console.log(
            "staticCall result:",
            staticResult
        );

        if (
            typeof staticResult === "string" &&
            staticResult.toLowerCase() ===
            factoryPrediction.toLowerCase()
        ) {
            console.log(
                "staticCall prediction: MATCH"
            );
        } else {
            console.log(
                "staticCall prediction: DIFFERENT"
            );
        }

    } catch (error) {

        console.log(
            "staticCall REVERTED"
        );

        console.log(
            "shortMessage:",
            error.shortMessage || "N/A"
        );

        console.log(
            "reason:",
            error.reason || "N/A"
        );

        console.log(
            "message:",
            error.message || error
        );
    }

    console.log("\n10. DEPLOY FUNCTION SELECTOR");
    console.log("----------------------------------------");

    const iface =
        new hre.ethers.Interface(
            factoryAbi
        );

    const deployFunction =
        iface.getFunction("deploy");

    const expectedSelector =
        deployFunction.selector;

    const actualSelector =
        tx.data.slice(0, 10);

    console.log(
        "Actual transaction selector:",
        actualSelector
    );

    console.log(
        "Expected deploy selector:",
        expectedSelector
    );

    console.log(
        "Selector match:",
        actualSelector.toLowerCase() ===
        expectedSelector.toLowerCase()
            ? "YES"
            : "NO"
    );

    console.log("\n11. TRANSACTION CALL DATA DECODE");
    console.log("----------------------------------------");

    try {

        const decoded =
            iface.decodeFunctionData(
                "deploy",
                tx.data
            );

        console.log(
            "Decoded salt:",
            decoded[0]
        );

        console.log(
            "Decoded initcode bytes:",
            (decoded[1].length - 2) / 2
        );

        console.log(
            "Decoded initcode hash:",
            hre.ethers.keccak256(
                decoded[1]
            )
        );

        console.log(
            "Salt matches expected:",
            decoded[0].toLowerCase() ===
            SALT.toLowerCase()
                ? "YES"
                : "NO"
        );

        console.log(
            "Initcode hash matches artifact:",
            hre.ethers.keccak256(
                decoded[1]
            ).toLowerCase() ===
            initCodeHash.toLowerCase()
                ? "YES"
                : "NO"
        );

    } catch (error) {

        console.log(
            "Calldata decode failed:"
        );

        console.log(
            error.message || error
        );
    }

    console.log("\n12. FACTORY EVENT INTERFACE CHECK");
    console.log("----------------------------------------");

    console.log(
        "Factory logs emitted:",
        receipt.logs.length
    );

    if (receipt.logs.length > 0) {

        for (
            let i = 0;
            i < receipt.logs.length;
            i++
        ) {

            const log =
                receipt.logs[i];

            console.log(
                `Log ${i} address:`,
                log.address
            );

            console.log(
                `Log ${i} topics:`,
                JSON.stringify(log.topics)
            );
        }
    }

    console.log("\n13. FINAL DIAGNOSIS");
    console.log("----------------------------------------");

    if (
        independentAddress.toLowerCase() !==
        factoryPrediction.toLowerCase()
    ) {

        console.log(
            "DIAGNOSIS:"
        );

        console.log(
            "FACTORY predictAddress() DOES NOT"
        );

        console.log(
            "MATCH THE STANDARD CREATE2 FORMULA."
        );

    } else if (
        predictedCode === "0x"
    ) {

        console.log(
            "DIAGNOSIS:"
        );

        console.log(
            "STANDARD CREATE2 PREDICTION IS CORRECT,"
        );

        console.log(
            "BUT THE FACTORY DEPLOYMENT PRODUCED"
        );

        console.log(
            "NO RUNTIME CODE AT THE TARGET ADDRESS."
        );

        console.log(
            "THE FACTORY DEPLOY IMPLEMENTATION"
        );

        console.log(
            "MUST BE INSPECTED BEFORE CONTINUING."
        );

    } else {

        console.log(
            "DIAGNOSIS:"
        );

        console.log(
            "CODE IS PRESENT AT THE TARGET."
        );
    }

    console.log("\n============================================================");
    console.log("STEP 34A-9 CORRECTED DIAGNOSTICS COMPLETE");
    console.log("============================================================");
}

main().catch((error) => {

    console.error(
        "\n============================================================"
    );

    console.error(
        "DIAGNOSTICS FAILED"
    );

    console.error(
        "============================================================"
    );

    console.error(
        error.shortMessage ||
        error.reason ||
        error.message ||
        error
    );

    process.exitCode = 1;
});
