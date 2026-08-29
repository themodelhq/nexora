
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

    console.log("\n1. NETWORK");
    console.log("----------------------------------------");

    const network = await provider.getNetwork();

    console.log(
        "Chain ID:",
        Number(network.chainId)
    );

    console.log("\n2. TRANSACTION");
    console.log("----------------------------------------");

    const tx = await provider.getTransaction(TX_HASH);

    if (!tx) {
        throw new Error(
            "Transaction not found"
        );
    }

    console.log(
        "Transaction hash:",
        TX_HASH
    );

    console.log(
        "From:",
        tx.from
    );

    console.log(
        "To:",
        tx.to
    );

    console.log(
        "Block:",
        tx.blockNumber
    );

    console.log(
        "Nonce:",
        tx.nonce
    );

    console.log(
        "Gas limit:",
        tx.gasLimit.toString()
    );

    console.log(
        "Value:",
        tx.value.toString()
    );

    console.log(
        "Data bytes:",
        (tx.data.length - 2) / 2
    );

    console.log("\n3. RECEIPT");
    console.log("----------------------------------------");

    const receipt =
        await provider.getTransactionReceipt(
            TX_HASH
        );

    if (!receipt) {
        throw new Error(
            "Transaction receipt not found"
        );
    }

    console.log(
        "Status:",
        receipt.status
    );

    console.log(
        "Block:",
        receipt.blockNumber
    );

    console.log(
        "Gas used:",
        receipt.gasUsed.toString()
    );

    console.log(
        "Logs:",
        receipt.logs.length
    );

    console.log(
        "Contract address:",
        receipt.contractAddress
    );

    console.log("\n4. FACTORY ADDRESS");
    console.log("----------------------------------------");

    console.log(
        "Factory:",
        FACTORY_ADDRESS
    );

    const factoryCode =
        await provider.getCode(
            FACTORY_ADDRESS
        );

    console.log(
        "Factory code bytes:",
        (factoryCode.length - 2) / 2
    );

    if (factoryCode === "0x") {
        throw new Error(
            "Factory has no runtime code"
        );
    }

    console.log(
        "Factory: LIVE"
    );

    console.log("\n5. TEST INITCODE");
    console.log("----------------------------------------");

    if (!fs.existsSync(artifactPath)) {
        throw new Error(
            "Test artifact missing"
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

    console.log(
        "Initcode hash:",
        hre.ethers.keccak256(initcode)
    );

    console.log("\n6. FACTORY PREDICTION");
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

    const predicted =
        await factory.predictAddress(
            SALT,
            initcode
        );

    console.log(
        "Salt:",
        SALT
    );

    console.log(
        "Factory predicted:",
        predicted
    );

    console.log(
        "Expected from Step 34A-9:",
        EXPECTED_ADDRESS
    );

    console.log(
        "Prediction match:",
        predicted.toLowerCase() ===
        EXPECTED_ADDRESS.toLowerCase()
            ? "YES"
            : "NO"
    );

    console.log("\n7. INDEPENDENT CREATE2 FORMULA");
    console.log("----------------------------------------");

    const initCodeHash =
        hre.ethers.keccak256(initcode);

    const raw =
        "0xff" +
        FACTORY_ADDRESS.slice(2).toLowerCase() +
        SALT.slice(2) +
        initCodeHash.slice(2);

    const fullHash =
        hre.ethers.keccak256(
            "0x" + raw
        );

    const independent =
        hre.ethers.getAddress(
            "0x" + fullHash.slice(-40)
        );

    console.log(
        "Independent address:",
        independent
    );

    console.log(
        "Factory prediction:",
        predicted
    );

    console.log(
        "Formula match:",
        independent.toLowerCase() ===
        predicted.toLowerCase()
            ? "YES"
            : "NO"
    );

    console.log("\n8. CODE AT PREDICTED ADDRESS");
    console.log("----------------------------------------");

    const code =
        await provider.getCode(
            predicted
        );

    console.log(
        "Address:",
        predicted
    );

    console.log(
        "Runtime code bytes:",
        (code.length - 2) / 2
    );

    console.log(
        "Runtime code:",
        code
    );

    console.log("\n9. FACTORY DEPLOY STATIC CALL");
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

        console.log(
            "staticCall result type:",
            typeof staticResult
        );

        console.log(
            "Matches predicted:",
            staticResult.toLowerCase() ===
            predicted.toLowerCase()
                ? "YES"
                : "NO"
        );
    } catch (error) {
        console.log(
            "staticCall REVERTED"
        );

        console.log(
            "Error:",
            error.shortMessage ||
            error.reason ||
            error.message
        );
    }

    console.log("\n10. TRANSACTION LOG INSPECTION");
    console.log("----------------------------------------");

    if (receipt.logs.length === 0) {
        console.log(
            "No logs emitted by factory transaction."
        );
    } else {
        for (
            let i = 0;
            i < receipt.logs.length;
            i++
        ) {
            const log =
                receipt.logs[i];

            console.log(
                `Log ${i}:`
            );

            console.log(
                "  Address:",
                log.address
            );

            console.log(
                "  Topics:",
                log.topics
            );

            console.log(
                "  Data bytes:",
                (log.data.length - 2) / 2
            );
        }
    }

    console.log("\n11. TRANSACTION CALL DATA");
    console.log("----------------------------------------");

    console.log(
        "Function selector:",
        tx.data.slice(0, 10)
    );

    console.log(
        "Expected deploy selector:"
    );

    const iface =
        new hre.ethers.Interface(
            factoryAbi
        );

    console.log(
        iface.getFunction("deploy").selector
    );

    console.log(
        "Selector match:",
        tx.data.slice(0, 10).toLowerCase() ===
        iface.getFunction("deploy").selector.toLowerCase()
            ? "YES"
            : "NO"
    );

    console.log("\n12. FINAL DIAGNOSIS");
    console.log("----------------------------------------");

    if (predicted.toLowerCase() !==
        EXPECTED_ADDRESS.toLowerCase()) {

        console.log(
            "DIAGNOSIS: FACTORY PREDICTION CHANGED"
        );

    } else if (
        independent.toLowerCase() !==
        predicted.toLowerCase()
    ) {

        console.log(
            "DIAGNOSIS: CREATE2 FORMULA MISMATCH"
        );

    } else if (code === "0x") {

        console.log(
            "DIAGNOSIS: TRANSACTION SUCCEEDED"
        );

        console.log(
            "BUT NO CONTRACT CODE EXISTS AT THE"
        );

        console.log(
            "PREDICTED CREATE2 ADDRESS."
        );

        console.log(
            "FACTORY DEPLOYMENT PATH REQUIRES INSPECTION."
        );

    } else {

        console.log(
            "DIAGNOSIS: CONTRACT CODE IS PRESENT."
        );
    }

    console.log("\n============================================================");
    console.log("STEP 34A-9 DIAGNOSTICS COMPLETE");
    console.log("============================================================");
}

main().catch((error) => {
    console.error("\n============================================================");
    console.error("DIAGNOSTICS FAILED");
    console.error("============================================================");
    console.error(
        error.shortMessage ||
        error.reason ||
        error.message ||
        error
    );
    process.exitCode = 1;
});
