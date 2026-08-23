/**
 * Nexora — Tokenomics verification.
 *
 * Validates that the token allocation in @nexora/config is internally
 * consistent: percentages sum to 100 and amounts sum to the fixed maximum
 * supply of 1,000,000,000 NXR.
 *
 * Run: npx ts-node scripts/tokenomics/verify-allocations.ts
 */

import { TOKENOMICS, assertTokenomicsValid } from '../../packages/config/src/tokenomics';

function main(): void {
  console.log(`Token: ${TOKENOMICS.name} (${TOKENOMICS.symbol})`);
  console.log(`Max supply: ${TOKENOMICS.maxSupplyHuman.toLocaleString()} NXR`);
  console.log(`Decimals: ${TOKENOMICS.decimals}`);
  console.log('\nAllocation buckets:');
  for (const b of TOKENOMICS.buckets) {
    const human = Number(b.amount / 10n ** 18n).toLocaleString();
    console.log(
      `  ${b.percent.toString().padStart(2)}%  ${human.padStart(13)} NXR  ${b.category}${b.vesting ? '  (vested)' : ''}`,
    );
  }

  const valid = assertTokenomicsValid(TOKENOMICS);
  if (!valid) {
    console.error('\nERROR: Tokenomics are INCONSISTENT (percentages or amounts do not sum correctly).');
    process.exit(1);
  }
  console.log('\nTokenomics verified: percentages sum to 100% and amounts sum to max supply. ✓');
}

main();
