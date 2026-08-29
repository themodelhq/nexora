# Nexora — Staking

`NexoraStaking` lets users stake NXR and earn accrual-based rewards.

## Model
- Rewards accrue proportionally to **stake × time × reward rate**.
- The reward rate is set by an authorized (`REWARD_RATE_ROLE`),
  governance-controlled role and **can change**. It is not a guaranteed return.
- Principal is never at risk (only protocol solvency of the reward reserve
  matters for paying rewards).

## Actions
- **Stake NXR** (approve + stake).
- **View staked balance** and pending rewards.
- **Claim rewards**.
- **Unstake** (returns principal + accrued rewards).
- **View historical activity** via the indexer/dashboard.

## Safety
- Reentrancy guard + checks-effects-interactions.
- Pausable.
- Emergency sweep role cannot touch principal or accrued rewards.
