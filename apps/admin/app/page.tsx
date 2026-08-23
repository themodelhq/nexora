'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { shortAddress } from '@nexora/blockchain';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Section =
  | 'token' | 'airdrop' | 'vesting' | 'treasury' | 'staking'
  | 'governance' | 'security';

const sections: Array<{ id: Section; label: string }> = [
  { id: 'token', label: 'Token' },
  { id: 'airdrop', label: 'Airdrop' },
  { id: 'vesting', label: 'Vesting' },
  { id: 'treasury', label: 'Treasury' },
  { id: 'staking', label: 'Staking' },
  { id: 'governance', label: 'Governance' },
  { id: 'security', label: 'Security' },
];

interface Session {
  token: string;
  address: string;
  role: string;
}

/** Real SIWE (EIP-4361) sign-in. No demo gate. */
async function siweSignIn(address: string, signMessage: (msg: string) => Promise<string>): Promise<Session> {
  // 1. Obtain a one-time nonce from the backend.
  const nonceRes = await fetch(`${API}/api/auth/nonce?address=${encodeURIComponent(address)}`);
  if (!nonceRes.ok) throw new Error('failed to get nonce');
  const { nonce } = await nonceRes.json();

  const now = new Date();
  const iat = now.toISOString();
  const exp = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const chainId = 84532;
  const domain = typeof window !== 'undefined' ? window.location.hostname : 'nexora.io';

  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    `Nexora admin authentication.\\n\\nI accept the Nexora Terms of Service.`,
    '',
    `URI: ${typeof window !== 'undefined' ? window.location.origin : 'https://nexora.io'}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${iat}`,
    `Expiration Time: ${exp}`,
  ].join('\n');

  const signature = await signMessage(message);

  // 2. Verify with the backend and create a persistent session.
  const verifyRes = await fetch(`${API}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error ?? 'verification failed');
  }
  return verifyRes.json();
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>('token');

  // Sign with the injected wallet (personal_sign for the SIWE message).
  const signMessage = async (msg: string) => {
    const provider = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!provider) throw new Error('no injected wallet found');
    const result = (await provider.request({
      method: 'personal_sign',
      params: [msg, address],
    })) as string;
    return result;
  };

  const handleSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      if (!address) return;
      const s = await siweSignIn(address, signMessage);
      setSession(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isConnected || !address) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-elevated p-8 text-center">
        <h1 className="text-xl font-semibold">Admin sign-in</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Connect a wallet and sign a message (SIWE). Only wallets with a granted admin role in the backend are
          authorized.
        </p>
        <button
          onClick={() => connect({ connector: injected() })}
          className="mt-6 w-full rounded-lg bg-brand py-3 font-medium text-white hover:bg-brand-hover"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-elevated p-8 text-center">
        <h1 className="text-xl font-semibold">Authenticate</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Wallet: {shortAddress(address)}. Sign the SIWE message to create an authenticated session.
        </p>
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-brand py-3 font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? 'Signing…' : 'Sign in with Ethereum'}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <aside className="w-48 shrink-0">
        <nav className="flex flex-col gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`rounded-md px-3 py-2 text-left text-sm ${section === s.id ? 'bg-brand text-white' : 'text-text-secondary hover:bg-overlay'}`}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => { disconnect(); setSession(null); }}
            className="mt-4 rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-overlay"
          >
            Sign out
          </button>
        </nav>
      </aside>
      <div className="flex-1">
        <p className="mb-4 text-xs text-text-muted">
          Session: {shortAddress(session.address)} · role: {session.role}
        </p>
        {section === 'token' && <TokenSection token={session.token} />}
        {section === 'airdrop' && <AirdropSection token={session.token} />}
        {section === 'vesting' && <VestingSection />}
        {section === 'treasury' && <TreasurySection token={session.token} />}
        {section === 'staking' && <StakingSection />}
        {section === 'governance' && <GovernanceSection />}
        {section === 'security' && <SecuritySection token={session.token} />}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-5">
      <h3 className="mb-3 font-semibold text-text-primary">{title}</h3>
      {children}
    </div>
  );
}

/** Fetches data from the backend (server-side authorization enforced). */
function useApi<T>(token: string, path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const load = () => {
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setErr(''); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoaded(true));
  };
  return { data, err, loaded, load };
}

function TokenSection({ token }: { token: string }) {
  const { data, err, loaded, load } = useApi<any>(token, '/api/admin/token', null);
  if (!loaded) return <Card title="Token"><button onClick={() => load()} className="text-brand">Load token info</button></Card>;
  return (
    <Card title="Token information">
      <p className="text-sm text-text-secondary">Nexora (NXR) · 18 decimals · fixed supply 1,000,000,000.</p>
      <p className="mt-2 break-all font-mono text-xs text-text-muted">Contract: {data?.token ?? 'Data unavailable'}</p>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </Card>
  );
}

function AirdropSection({ token }: { token: string }) {
  const { data, err, load } = useApi<any>(token, '/api/admin/airdrop/claims', null);
  return (
    <div className="space-y-4">
      <Card title="Generate Merkle root">
        <p className="text-sm text-text-secondary">
          Upload an allocation CSV. The backend validates addresses and generates an OpenZeppelin-compatible Merkle root.
        </p>
        <p className="mt-2 text-xs text-text-muted">In production, this calls POST /api/airdrop/generate and publishes the root on-chain via an admin wallet.</p>
      </Card>
      <Card title="Claims">
        <button onClick={load} className="rounded-md bg-brand px-3 py-1.5 text-xs text-white">Load claims</button>
        <p className="mt-2 text-sm text-text-secondary">{data ? `Loaded ${data.claims?.length ?? 0} claims.` : 'No data loaded.'}</p>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </Card>
    </div>
  );
}

function VestingSection() {
  return <Card title="Vesting schedules"><p className="text-sm text-text-secondary">Create and monitor vesting schedules on-chain via the admin API.</p></Card>;
}

function TreasurySection({ token }: { token: string }) {
  const { data, err, load } = useApi<any>(token, '/api/admin/treasury', null);
  return (
    <Card title="Treasury">
      <p className="text-sm text-text-secondary">Treasury is controlled by a multisig + timelock, never a single key.</p>
      <button onClick={load} className="mt-2 rounded-md bg-brand px-3 py-1.5 text-xs text-white">Load transactions</button>
      <p className="mt-2 text-sm text-text-secondary">{data ? `${data.transactions?.length ?? 0} transactions.` : ''}</p>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </Card>
  );
}

function StakingSection() {
  return <Card title="Staking statistics"><p className="text-sm text-text-secondary">Total staked, participation and reward-rate controls.</p></Card>;
}

function GovernanceSection() {
  return <Card title="Governance"><p className="text-sm text-text-secondary">Proposals, votes and execution status via the Governor/Timelock.</p></Card>;
}

function SecuritySection({ token }: { token: string }) {
  const { data, err, load } = useApi<any>(token, '/api/admin/roles', null);
  return (
    <div className="space-y-4">
      <Card title="Contract ownership & roles">
        <p className="text-sm text-text-secondary">Treasury = multisig, Governance = Governor + Timelock. Admin roles are stored server-side.</p>
      </Card>
      <Card title="Server-side admin roles">
        <button onClick={load} className="rounded-md bg-brand px-3 py-1.5 text-xs text-white">Load roles</button>
        <p className="mt-2 text-sm text-text-secondary">{data ? `${data.roles?.length ?? 0} roles.` : ''}</p>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </Card>
    </div>
  );
}
