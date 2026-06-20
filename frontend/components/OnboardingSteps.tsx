export default function OnboardingSteps({ connected, orgs }: { connected: boolean; orgs: Array<{ company_name: string; slug: string }> }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Onboard a business in 3 steps</h2>
      <ol className="mt-6 space-y-4 text-sm text-slate-600">
        <li className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="font-semibold text-slate-950">1. Connect Zoho Books</p>
          <p className="mt-2">Click the button above to fetch your Zoho organizations. This is a mock equivalent of the real Zoho OAuth flow.</p>
        </li>
        <li className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="font-semibold text-slate-950">2. Select your business</p>
          <p className="mt-2">Choose the restaurant group that should be monitored. If you only have one business, we select it automatically.</p>
        </li>
        <li className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="font-semibold text-slate-950">3. Review alerts</p>
          <p className="mt-2">The dashboard shows high-priority flags, cash buffer risk, and plain-language next steps.</p>
        </li>
      </ol>
      {connected && orgs.length > 0 ? (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <label className="block text-sm font-semibold text-slate-900">Business selected</label>
          <p className="mt-2 text-sm text-slate-700">{orgs[0].company_name}</p>
        </div>
      ) : null}
    </div>
  );
}
