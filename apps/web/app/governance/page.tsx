import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Governance', description: 'Nexora on-chain governance.' };

export default function GovernancePage() {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-text-primary">Governance</h1>
        <p className="mt-3 text-text-secondary">
          Nexora is moving toward decentralized governance. Proposals, voting, delegation and execution are handled
          on-chain, with a timelock so no single wallet can force critical actions.
        </p>
        <div className="mt-8 rounded-xl border border-line bg-elevated p-6">
          <p className="text-sm text-text-secondary">
            Governance is not yet active on the testnet in this session. Once the Governor and Timelock contracts are
            deployed, proposals and voting will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
