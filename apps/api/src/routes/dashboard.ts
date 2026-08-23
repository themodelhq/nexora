/**
 * Dashboard routes: fetch authoritative on-chain data via viem.
 * No fabricated data — if a value can't be read, it is omitted/null.
 */
import { Router } from 'express';
import { getPublicClient, formatUnits } from '@nexora/blockchain';
import { getBalance, getErc20Info } from '@nexora/blockchain';
import { loadAddresses } from '@nexora/config';
import { requireAuth } from './auth';

export const dashboardRouter = Router();

/**
 * GET /api/dashboard?address=0x...
 * Returns on-chain token data and user balance for the connected wallet.
 */
dashboardRouter.get('/', async (req, res) => {
  const address = (req.query.address as string) ?? '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'invalid address' });
  }

  try {
    const addrs = loadAddresses();
    const tokenAddress = addrs.nxrToken;
    if (!tokenAddress) {
      return res.json({ error: 'NXR token not deployed yet (testnet deployment pending)' });
    }

    const client = getPublicClient();
    const info = await getErc20Info(tokenAddress as `0x${string}`);
    const balance = await getBalance(tokenAddress as `0x${string}`, address as `0x${string}`);

    const network = await client.getChainId();

    return res.json({
      address,
      chainId: network,
      token: {
        name: info.name,
        symbol: info.symbol,
        decimals: info.decimals,
        totalSupply: info.totalSupply.toString(),
        totalSupplyHuman: formatUnits(info.totalSupply, info.decimals),
        address: tokenAddress,
      },
      balance: balance.toString(),
      balanceHuman: formatUnits(balance, info.decimals),
    });
  } catch (err) {
    return res.status(502).json({ error: `blockchain read failed: ${(err as Error).message}` });
  }
});
