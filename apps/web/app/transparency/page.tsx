import type { Metadata } from 'next';
import { loadAddresses } from '@nexora/config';

export const metadata: Metadata = {
  title: 'Transparency',
  description: 'Nexora transparency — public contract addresses, no hidden functionality, no honeypot mechanisms.',
};

export default function TransparencyPage() {
  const addrs = loadAddresses();
  const rows: Array<[string, string | undefined]> = [
    ['NXR Token', addrs.nxrToken],
    ['Vote Token (NXVT)', addrs.voteToken],
    ['Vote Wrapper (1:1)', addrs.voteWrapper],
    ['Airdrop Contract', addrs.airdrop],
    ['Vesting Contract', addrs.vesting],
    ['Staking Contract', addrs.staking],
    ['Governor', addrs.governor],
    ['Timelock', addrs.timelock],
    ['Treasury', addrs.treasury],
    ['Presale Contract', addrs.presale],
    ['Multisig', addrs.multisig],
  ];

  return (
    <div className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-text-primary">Transparency</h1>
        <p className="mt-3 text-text-secondary">
          Nexora is built for transparency. All contract addresses and critical operations are public and verifiable
          on-chain.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, addr]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td className="w-48 px-4 py-3 text-text-muted">{label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-primary">
                    {addr ?? 'Coming soon'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 rounded-xl border border-line bg-elevated p-6">
          <h2 className="text-lg font-semibold text-text-primary">No Hidden Mechanisms</h2>
          <ul className="mt-3 space-y-2 text-sm text-text-secondary">
            <li>• Fixed supply — no undisclosed minting</li>
            <li>• No hidden transfer restrictions</li>
            <li>• No hidden tax on transfers</li>
            <li>• No stealth blacklist</li>
            <li>• No ability for an owner to confiscate user funds</li>
            <li>• No honeypot mechanisms</li>
            <li>• Team & advisor allocations are subject to on-chain vesting</li>
          </ul>
        </div>

        <p className="mt-6 text-sm text-text-muted">
          Addresses are populated from real deployment metadata. Until a contract is deployed, its address reads
          &quot;Coming soon&quot;.
        </p>
      </div>
    </div>
  );
}
