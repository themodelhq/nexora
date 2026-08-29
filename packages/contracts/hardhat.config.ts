import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-contract-sizer';
import 'dotenv/config';

// Solidity 0.8.28 with EVM target `cancun` is required to compile the
// OpenZeppelin Contracts 5.x release line (which uses the `mcopy` opcode).
// Cancun (post-Dencun) is active on Base and supported by Hardhat nodes.
// All Nexora contracts target this single stable compiler.
const SOLIDITY_VERSION = '0.8.28';

function getNetworkRpc(): { url: string; accounts?: string[] } | undefined {
  const url = process.env.RPC_URL;
  const deployer = process.env.DEPLOYER_PRIVATE_KEY;
  if (!url) return undefined;
  return {
    url,
    ...(deployer ? { accounts: [deployer] } : {}),
  };
}

const config: HardhatUserConfig = {
  solidity: {
    version: SOLIDITY_VERSION,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
      evmVersion: 'cancun',
    },
  },
  // Reproducible builds: avoid committing absolute source paths.
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      chainId: 84532, // mirror Base Sepolia chain id in local testing
      allowUnlimitedContractSize: false,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    baseSepolia: {
      url: process.env.RPC_URL ?? 'https://sepolia.base.org',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    base: {
      url: process.env.MAINNET_RPC_URL ?? '',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY ?? '',
      base: process.env.BASESCAN_API_KEY ?? '',
    },
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
    token: 'ETH',
  },
  contractSizer: {
    runOnCompile: false,
    strict: false,
  },
  mocha: {
    timeout: 60000,
  },
};

export default config;
