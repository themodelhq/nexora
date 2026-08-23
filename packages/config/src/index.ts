/**
 * Nexora shared configuration.
 *
 * This package is consumed by the frontend (web/admin), backend (api), and
 * scripts. It centralises chain metadata, tokenomics constants, and contract
 * address registry so a single source of truth is used across the ecosystem.
 */

export * from './chains';
export * from './tokenomics';
export * from './addresses';
export * from './brand';
