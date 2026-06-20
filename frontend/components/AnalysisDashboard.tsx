import { ZohoPayload, Org } from "../lib/types";
import HeaderCard from "./HeaderCard";
import FlagFeed from "./FlagFeed";
import AnomalyExplorer from "./AnomalyExplorer";
import PlainLanguageReport from "./PlainLanguageReport";
import FollowupWorkflow from "./FollowupWorkflow";
import MissingInformationChecklist from "./MissingInformationChecklist";
import SupportingDocumentsReview from "./SupportingDocumentsReview";
import { ArrowLeft, Building2 } from "lucide-react";

interface AnalysisDashboardProps {
  data: ZohoPayload;
  orgs: Org[];
  selectedOrg: string;
  onSelectOrg: (slug: string) => void;
  onBack: () => void;
  loading: boolean;
}

export default function AnalysisDashboard({
  data,
  orgs,
  selectedOrg,
  onSelectOrg,
  onBack,
  loading,
}: AnalysisDashboardProps) {
  const currentOrg = orgs.find((org) => org.slug === selectedOrg);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md bg-slate-950/50">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-900 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Businesses
            </button>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-900" />
              <span className="text-gray-900 font-semibold">{currentOrg?.company_name || selectedOrg}</span>
            </div>
          </div>

          {/* Business switcher */}
          {orgs.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {orgs.map((org) => (
                <button
                  key={org.slug}
                  onClick={() => onSelectOrg(org.slug)}
                  disabled={loading}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition ${
                    selectedOrg === org.slug
                      ? "bg-cyan-500/20 text-blue-800 border border-blue-800/50"
                      : "bg-white/5 text-gray-900/70 hover:bg-white/10 border border-white/10"
                  } disabled:opacity-50`}
                >
                  {org.company_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 rounded-xl p-4">
            <p className="text-emerald-700/80 text-xs font-semibold uppercase tracking-wide">Cash Buffer</p>
            <p className="text-4xl font-bold text-emerald-700 mt-2">{data.report.cash_buffer_days}</p>
            <p className="text-emerald-700/60 text-xs mt-1">days of runway</p>
          </div>

          <div className="bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-300/80 text-xs font-semibold uppercase tracking-wide">Risk Flags</p>
            <p className="text-4xl font-bold text-red-300 mt-2">{data.report.flags.length}</p>
            <p className="text-red-300/60 text-xs mt-1">issues to review</p>
          </div>

          <div className="bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 rounded-xl p-4">
            <p className="text-amber-300/80 text-xs font-semibold uppercase tracking-wide">Anomalies</p>
            <p className="text-4xl font-bold text-amber-300 mt-2">{data.report.anomaly_transactions.length}</p>
            <p className="text-amber-300/60 text-xs mt-1">flagged transactions</p>
          </div>

          <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/30 rounded-xl p-4">
            <p className="text-cyan-300/80 text-xs font-semibold uppercase tracking-wide">Action Items</p>
            <p className="text-4xl font-bold text-cyan-300 mt-2">{data.report.followup_workflow.length}</p>
            <p className="text-cyan-300/60 text-xs mt-1">next steps</p>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left column - Main insights */}
          <div className="lg:col-span-2 space-y-6">
            {/* Plain language summary */}
            <PlainLanguageReport report={data.report} />

            {/* Risk flags */}
            <FlagFeed flags={data.report.flags} />

            {/* Supporting documents review */}
            <SupportingDocumentsReview review={data.report.supporting_document_review} />

            {/* Anomaly explorer */}
            <AnomalyExplorer anomalies={data.report.anomaly_transactions} />
          </div>

          {/* Right column - Actions & Workflow */}
          <div className="space-y-6">
            {/* Followup workflow */}
            <FollowupWorkflow items={data.report.followup_workflow} />

            {/* Missing information checklist */}
            <MissingInformationChecklist report={data.report} />
          </div>
        </div>

        {/* Period info */}
        <div className="mt-12 text-center text-gray-900/50 text-xs">
          <p>
            Report for {data.meta.company_name} • {data.meta.period_start} to {data.meta.period_end} •{" "}
            {data.meta.branches.join(", ")}
          </p>
        </div>
      </main>
    </div>
  );
}
