BEGIN;
-- Add proof storage to airdrop_allocations so the public proof endpoint can serve claims.
ALTER TABLE airdrop_allocations ADD COLUMN IF NOT EXISTS proof JSONB;
ALTER TABLE airdrop_allocations ADD COLUMN IF NOT EXISTS merkle_root_round TEXT;
COMMIT;
