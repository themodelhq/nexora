-- ============================================================
-- Nexora — migration 002: additional production tables.
-- ============================================================
BEGIN;

-- ------------------------------------------------------------------
-- sessions — persistent admin/user sessions (replaces in-memory Map)
-- ------------------------------------------------------------------
-- ------------------------------------------------------------------
-- nonces — single-use SIWE nonces (replay prevention)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nonces (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address       CITEXT NOT NULL,
    nonce         TEXT NOT NULL UNIQUE,
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    used          BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_nonces_addr ON nonces(address);

CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,               -- random session token hash
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet        CITEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    nonce         TEXT NOT NULL,
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    ip_address    TEXT,
    revoked       BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet);

-- ------------------------------------------------------------------
-- admin_roles — explicit admin role grants (mirrors AccessControl)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_roles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet        CITEXT NOT NULL,
    role          TEXT NOT NULL,
    granted_by    CITEXT,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wallet, role)
);
CREATE INDEX IF NOT EXISTS idx_admin_roles_wallet ON admin_roles(wallet);

-- ------------------------------------------------------------------
-- presale_purchases / presale_claims / presale_refunds
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presale_purchases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash       TEXT NOT NULL UNIQUE,
    buyer         CITEXT NOT NULL,
    contributed   NUMERIC(78,0) NOT NULL,
    token_amount  NUMERIC(78,0) NOT NULL,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_purchases_buyer ON presale_purchases(buyer);

CREATE TABLE IF NOT EXISTS presale_claims (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash       TEXT NOT NULL UNIQUE,
    buyer         CITEXT NOT NULL,
    amount        NUMERIC(78,0) NOT NULL,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_claims_buyer ON presale_claims(buyer);

CREATE TABLE IF NOT EXISTS presale_refunds (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash       TEXT NOT NULL UNIQUE,
    buyer         CITEXT NOT NULL,
    amount        NUMERIC(78,0) NOT NULL,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_refunds_buyer ON presale_refunds(buyer);

-- ------------------------------------------------------------------
-- staking_rewards — reward claims/events
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staking_rewards (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash       TEXT NOT NULL UNIQUE,
    address       CITEXT NOT NULL,
    amount        NUMERIC(78,0) NOT NULL,
    event_type    TEXT NOT NULL,               -- 'staked'|'unstaked'|'reward_claimed'
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staking_rewards_addr ON staking_rewards(address);

-- ------------------------------------------------------------------
-- indexed_blocks — persistent indexer checkpoints (reorg-safe)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indexed_blocks (
    chain_id      BIGINT NOT NULL,
    block_number  BIGINT NOT NULL,
    block_hash    TEXT NOT NULL,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, block_number)
);

COMMIT;
