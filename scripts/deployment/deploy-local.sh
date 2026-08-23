#!/usr/bin/env bash
# ============================================================
# Nexora — Local development deployment
#
# Starts a local Hardhat node, compiles & tests, then deploys
# all contracts to it and records addresses.
#
# Usage:  bash scripts/deployment/deploy-local.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> Compiling contracts..."
npm run compile

echo "==> Running contract tests..."
npm run test:contracts

echo "==> Starting local Hardhat node on port 8545..."
npx hardhat node --port 8545 --network hardhat &
NODE_PID=$!
trap 'kill $NODE_PID 2>/dev/null || true' EXIT

echo "==> Waiting for the node to accept connections..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://127.0.0.1:8545; then
    break
  fi
  sleep 1
done

echo "==> Deploying contracts to localhost..."
npx hardhat run packages/contracts/scripts/deploy-local.ts --network localhost

echo "==> Local deployment complete."
echo "    Contract addresses were recorded in packages/contracts/deployments/."
