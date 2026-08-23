-- ============================================================
-- Nexora — Initial database schema (PostgreSQL)
--
-- Notes on security:
--   * No private keys or seed phrases are EVER stored here.
--   * Wallet addresses are stored for display/eligibility only.
--   * Admin users are authenticated via wallet signatures (SIWE) and JWTs.
-- ============================================================

BEGIN;

-- Citext (case-insensitive text) is used for wallet addresses.
CREATE EXTENSION IF NOT EXISTS citext;

-- ------------------------------------------------------------------
-- users — canonical user records (created on wallet sign-in)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    email           CITEXT UNIQUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    notification_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ
);

-- ------------------------------------------------------------------
-- wallets — wallet addresses bound to a user
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address         CITEXT NOT NULL UNIQUE,
    chain_id        BIGINT NOT NULL DEFAULT 84532,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_primary      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- ------------------------------------------------------------------
-- airdrop_allocations — off-chain Merkle eligibility source (pre-images)
-- NOTE: On-chain truth is the Merkle root on the airdrop contract.
-- This table stores the raw distribution for generation/audit only.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airdrop_allocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address         CITEXT NOT NULL,
    amount          NUMERIC(78,0) NOT NULL,  -- in base units (wei)
    airdrop_round   TEXT NOT NULL DEFAULT 'genesis',
    merkle_root     CITEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (airdrop_round, address)
);
CREATE INDEX IF NOT EXISTS idx_airdrop_alloc_addr ON airdrop_allocations(address);
CREATE INDEX IF NOT EXISTS idx_airdrop_alloc_round ON airdrop_allocations(airdrop_round);

-- ------------------------------------------------------------------
-- airdrop_claims — records claims made against the airdrop contract
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airdrop_claims (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    airdrop_round   TEXT NOT NULL,
    address         CITEXT NOT NULL,
    amount          NUMERIC(78,0) NOT NULL,
    tx_hash         TEXT,
    claimed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (airdrop_round, address)
);
CREATE INDEX IF NOT EXISTS idx_airdrop_claims_round ON airdrop_claims(airdrop_round);

-- ------------------------------------------------------------------
-- vesting_schedules — off-chain mirror of on-chain vesting schedules
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vesting_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id     BIGINT NOT NULL,             -- on-chain schedule id
    beneficiary     CITEXT NOT NULL,
    total_amount    NUMERIC(78,0) NOT NULL,
    start_timestamp BIGINT NOT NULL,
    cliff_duration  BIGINT NOT NULL,
    total_duration  BIGINT NOT NULL,
    revocable       BOOLEAN NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vesting_beneficiary ON vesting_schedules(beneficiary);

-- ------------------------------------------------------------------
-- staking_positions — mirror of on-chain staking positions
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staking_positions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address         CITEXT NOT NULL,
    staked_amount   NUMERIC(78,0) NOT NULL,
    staked_at       BIGINT NOT NULL,
    last_update     BIGINT NOT NULL,
    UNIQUE (address)
);

-- ------------------------------------------------------------------
-- transactions — indexed blockchain activity for the dashboard
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash         TEXT NOT NULL UNIQUE,
    chain_id        BIGINT NOT NULL,
    block_number    BIGINT NOT NULL,
    from_address    CITEXT,
    to_address      CITEXT,
    token           TEXT,
    amount          NUMERIC(78,0),
    event_type      TEXT NOT NULL,
    log_index       BIGINT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_tx_event ON transactions(event_type);

-- ------------------------------------------------------------------
-- governance_proposals / governance_votes
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS governance_proposals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id     BIGINT NOT NULL,
    proposer        CITEXT NOT NULL,
    title           TEXT,
    description     TEXT,
    start_block     BIGINT,
    end_block       BIGINT,
    state           TEXT NOT NULL DEFAULT 'Pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (proposal_id)
);

CREATE TABLE IF NOT EXISTS governance_votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id     BIGINT NOT NULL REFERENCES governance_proposals(proposal_id) ON DELETE CASCADE,
    voter           CITEXT NOT NULL,
    support         SMALLINT NOT NULL,   -- 0 against, 1 for, 2 abstain
    weight          NUMERIC(78,0) NOT NULL,
    reason          TEXT,
    tx_hash         TEXT,
    UNIQUE (proposal_id, voter)
);

-- ------------------------------------------------------------------
-- treasury_transactions — indexed treasury spend
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash         TEXT NOT NULL,
    token           TEXT NOT NULL DEFAULT 'NXR',
    amount          NUMERIC(78,0) NOT NULL,
    category        TEXT,
    from_address    CITEXT,
    to_address      CITEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_tx_hash ON treasury_transactions(tx_hash);

-- ------------------------------------------------------------------
-- admin_users — role-based access control (role-based auth)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet          CITEXT NOT NULL UNIQUE,
    role            TEXT NOT NULL DEFAULT 'viewer',
    -- roles: viewer | operator | admin | superadmin
    status          TEXT NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (role IN ('viewer','operator','admin','superadmin')),
    CHECK (status IN ('active','suspended'))
);

-- ------------------------------------------------------------------
-- audit_logs — append-only admin activity log
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor           CITEXT NOT NULL,
    action          TEXT NOT NULL,
    resource        TEXT,
    resource_id     TEXT,
    metadata        JSONB,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ------------------------------------------------------------------
-- system_settings — key/value operational settings
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    key             TEXT PRIMARY KEY,
    value           JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      CITEXT
);

COMMIT;
