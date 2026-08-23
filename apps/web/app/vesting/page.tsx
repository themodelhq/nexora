import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Vesting', description: 'Transparent NXR vesting schedules for team, advisors, partners, investors and grants.' };

const example = [
  ['Team', '12-month cliff + 36-month linear', '100,000,000 NXR'],
  ['Advisors & Strategic Partners', '6-month cliff + 24-month linear', '50,000,000 NXR'],
  ['Development & Grants', 'Subject to schedule', '100,000,000 NXR'],
];

export default function VestingPage() {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-text-primary">Vesting</h1>
        <p className="mt-3 text-text-secondary">
          Team, advisor, partner, investor and grant allocations are subject to transparent on-chain vesting schedules.
          Beneficiaries can see their allocation, claimed amount, remaining balance, next unlock and schedule.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-overlay text-left text-text-muted">
              <tr>
                <th className="px-4 py-3">Program</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {example.map(([p, s, a]) => (
                <tr key={p} className="border-t border-line">
                  <td className="px-4 py-3 text-text-primary">{p}</td>
                  <td className="px-4 py-3 text-text-secondary">{s}</td>
                  <td className="px-4 py-3 text-text-secondary">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-sm text-text-muted">
          Vesting is enforced on-chain. Beneficiaries connect their wallet to view their personal schedule once the
          vesting contract is deployed.
        </p>
      </div>
    </div>
  );
}
