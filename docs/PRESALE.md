# Nexora — Presale

> **Status: DISABLED by default. Legal/compliance review required before any sale.**

The `NexoraPresale` contract is a token-sale module. It ships **disabled**; the
production system will not accidentally expose a public sale. Enabling it
requires an explicit role action after legal review.

## Design (post-remediation)

- **Explicit purchase amounts.** `purchase(paymentAmount)` pulls exactly that
  amount via SafeERC20; `purchaseNative()` validates `msg.value`. The amount is
  never inferred from `balanceOf(msg.sender)`.
- **Per-buyer purchase record** (`contributed`, `totalTokens`, `claimed`,
  `refunded`) — no double-claim, no double-refund, no over-allocation.
- **TGE + vesting.** `tgeUnlockBps` unlocks immediately; the remainder vests
  linearly after a cliff over a duration. The vested remainder is always
  accounted for and visible to the buyer (total purchased, TGE allocation,
  claimed, remaining, next unlock, schedule).
- **Refund solvency.** `withdrawableFunds()` returns balance minus outstanding
  refund obligations; `withdrawFunds()` can only move that amount. Admin cannot
  withdraw funds required for valid refunds.
- **Caps.** Per-wallet cap and a global contribution cap.
- **Admin controls** are role-gated (`MANAGER_ROLE`, `PAUSER_ROLE`) and emit
  events. Critical changes should sit behind the multisig/timelock.

## Buyer-facing fields
Total purchased · TGE allocation · claimed · remaining · next unlock · vesting
schedule · refund entitlement.

## Compliance controls (architectural hooks)
KYC/AML provider integration, jurisdiction restrictions, wallet screening,
terms acceptance, risk disclosure, purchase limits, blocked jurisdictions, and
a refund mechanism are the responsibility of the legal/compliance team before
enablement. See `docs/LEGAL_COMPLIANCE_CHECKLIST.md`.
