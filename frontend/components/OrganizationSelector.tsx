import { type Org } from "../lib/types";

export default function OrganizationSelector({ orgs, selectedOrg, onChange }: { orgs: Org[]; selectedOrg: string; onChange: (slug: string) => void; }) {
  return (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <label className="block text-sm font-semibold text-slate-900">Choose your business</label>
      <select
        value={selectedOrg}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
      >
        {orgs.map((org) => (
          <option key={org.slug} value={org.slug}>
            {org.company_name}
          </option>
        ))}
      </select>
    </div>
  );
}
